import fs from 'fs';
import axios from 'axios';

function getDockerClient() {
  const socketPath = '/var/run/docker.sock';
  return axios.create({ socketPath, baseURL: 'http://localhost/v1.41', timeout: 30000 });
}

/**
 * Sweeps and force-deletes all orphaned _old_ or _updater_ temporary containers created during updates.
 */
export async function cleanupOrphanContainers(docker?: any): Promise<number> {
  let count = 0;
  try {
    const client = docker || getDockerClient();
    const listRes = await client.get('/containers/json?all=true');
    const containers = listRes.data || [];
    for (const c of containers) {
      const names = c.Names || [];
      const isStale = names.some((n: string) => {
        const lower = n.toLowerCase();
        return lower.includes('_old_') ||
               lower.includes('schedulearr_old') ||
               lower.includes('schedulearr_updater') ||
               lower.includes('_updater_') ||
               lower.includes('_new_');
      });

      if (isStale) {
        try {
          await client.delete(`/containers/${c.Id}?v=true&force=true`);
          count++;
        } catch (e) {}
      }
    }
  } catch (e) {}
  return count;
}

/**
 * Searches for the running container metadata of the application itself.
 * Uses cgroups, mountinfo, hostname, standard fallbacks, and listing all containers.
 */
export async function findSelfContainer(docker: any, hostname: string): Promise<any> {
  // 1. Try to read from /proc/self/cgroup (supports cgroups v1 and v2)
  try {
    if (fs.existsSync('/proc/self/cgroup')) {
      const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8');
      const matches = cgroup.match(/docker[/-]([a-f0-9]{64})/i);
      if (matches && matches[1]) {
        const res = await docker.get(`/containers/${matches[1]}/json`);
        if (res.data) return res.data;
      }
      
      const lines = cgroup.split('\n');
      for (const line of lines) {
        const parts = line.split('/');
        const last = parts[parts.length - 1].replace(/\.scope$/, '').replace(/^docker-/, '');
        if (last && last.length === 64 && /^[a-f0-9]+$/i.test(last)) {
          const res = await docker.get(`/containers/${last}/json`);
          if (res.data) return res.data;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to resolve container ID from cgroup:', e);
  }

  // 2. Try to read from /proc/self/mountinfo
  try {
    if (fs.existsSync('/proc/self/mountinfo')) {
      const mountinfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
      const matches = mountinfo.match(/\/docker\/(?:containers|overlay2)\/([a-f0-9]{64})/i);
      if (matches && matches[1]) {
        const res = await docker.get(`/containers/${matches[1]}/json`);
        if (res.data) return res.data;
      }
    }
  } catch (e) {
    console.warn('Failed to resolve container ID from mountinfo:', e);
  }

  // 3. Try direct lookup using standard container names and hostname silently
  const directCandidates = Array.from(new Set(['Schedulearr', 'schedulearr', 'schedule-arr', hostname].filter(Boolean)));
  for (const name of directCandidates) {
    try {
      const res = await docker.get(`/containers/${name}/json`);
      if (res.data) return res.data;
    } catch (e) {}
  }

  // 5. Try listing all containers to find a match
  try {
    const listRes = await docker.get('/containers/json?all=true');
    const containers = listRes.data || [];

    const hostnameLower = hostname.toLowerCase();
    const isGenericHost = hostnameLower === '0.0.0.0' || hostnameLower === 'localhost' || hostnameLower === '127.0.0.1';
    
    for (const container of containers) {
      const names = container.Names || [];
      const hasNameMatch = names.some((n: string) => {
        const cleaned = n.replace(/^\//, '').toLowerCase();
        return (!isGenericHost && cleaned === hostnameLower) || cleaned === 'schedulearr';
      });
      if (hasNameMatch) {
        try {
          const res = await docker.get(`/containers/${container.Id}/json`);
          if (res.data) return res.data;
        } catch (e) {}
      }
    }

    // Check containers running the schedulearr image or named schedulearr
    const schedulearrContainers = containers.filter((c: any) => {
      const image = (c.Image || '').toLowerCase();
      const names = (c.Names || []).map((n: string) => n.toLowerCase());
      return (image.includes('schedulearr') || names.some((n: string) => n.includes('schedulearr'))) && !names.some((n: string) => n.includes('updater'));
    });

    const runningSchedulearr = schedulearrContainers.find((c: any) => c.State === 'running');
    const target = runningSchedulearr || schedulearrContainers[0];
    if (target) {
      try {
        const res = await docker.get(`/containers/${target.Id}/json`);
        if (res.data) return res.data;
      } catch (e) {}
    }
  } catch (e) {
    console.warn('Failed to search containers list:', e);
  }

  return null;
}

/**
 * Sweeps and deletes orphaned / dangling Docker images (<none>:<none>) and unreferenced older image builds.
 */
export interface VDiskStats {
  available: boolean;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
  layersSizeBytes: number;
  images: {
    totalCount: number;
    activeCount: number;
    unusedCount: number;
    totalBytes: number;
    reclaimableBytes: number;
  };
  buildCache: {
    count: number;
    reclaimableBytes: number;
  };
  containers: {
    totalCount: number;
    runningCount: number;
    stoppedCount: number;
  };
  volumes: {
    count: number;
    totalBytes: number;
  };
}

/**
 * Returns accurate VDisk filesystem metrics and Docker storage breakdown (/system/df).
 */
export async function getVDiskStats(): Promise<VDiskStats> {
  let totalBytes = 0;
  let freeBytes = 0;
  let usedBytes = 0;
  let usedPercent = 0;

  try {
    if (typeof (fs as any).statfsSync === 'function') {
      const stats = (fs as any).statfsSync('/');
      totalBytes = (stats.blocks || 0) * (stats.bsize || 0);
      freeBytes = (stats.bfree || 0) * (stats.bsize || 0);
      usedBytes = Math.max(0, totalBytes - freeBytes);
      usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
    }
  } catch (e) {}

  let available = false;
  let layersSizeBytes = 0;
  const images = { totalCount: 0, activeCount: 0, unusedCount: 0, totalBytes: 0, reclaimableBytes: 0 };
  const buildCache = { count: 0, reclaimableBytes: 0 };
  const containers = { totalCount: 0, runningCount: 0, stoppedCount: 0 };
  const volumes = { count: 0, totalBytes: 0 };

  try {
    if (fs.existsSync('/var/run/docker.sock')) {
      const client = getDockerClient();
      const dfRes = await client.get('/system/df');
      if (dfRes.data) {
        available = true;
        const data = dfRes.data;
        layersSizeBytes = data.LayersSize || 0;

        const rawImgs: any[] = data.Images || [];
        images.totalCount = rawImgs.length;
        for (const img of rawImgs) {
          const sz = img.Size || 0;
          images.totalBytes += sz;
          const containerCount = img.Containers ?? 0;
          if (containerCount > 0) {
            images.activeCount++;
          } else {
            images.unusedCount++;
            images.reclaimableBytes += sz;
          }
        }

        const rawBc: any[] = data.BuildCache || [];
        buildCache.count = rawBc.length;
        for (const bc of rawBc) {
          if (!bc.InUse) {
            buildCache.reclaimableBytes += bc.Size || 0;
          }
        }

        const rawConts: any[] = data.Containers || [];
        containers.totalCount = rawConts.length;
        for (const c of rawConts) {
          if (c.State === 'running') containers.runningCount++;
          else containers.stoppedCount++;
        }

        const rawVols: any[] = data.Volumes || [];
        volumes.count = rawVols.length;
        for (const v of rawVols) {
          volumes.totalBytes += v.UsageData?.Size || 0;
        }
      }
    }
  } catch (e) {
    // Docker socket not available
  }

  return {
    available,
    totalBytes,
    usedBytes,
    freeBytes,
    usedPercent,
    layersSizeBytes,
    images,
    buildCache,
    containers,
    volumes
  };
}

/**
 * Sweeps and deletes orphaned / dangling Docker images, stale Schedulearr versions, and unreferenced build cache.
 */
export async function cleanupOrphanImages(
  docker?: any,
  options?: { pruneAllUnused?: boolean; pruneBuildCache?: boolean }
): Promise<{ deletedCount: number; spaceReclaimed: number }> {
  let deletedCount = 0;
  let spaceReclaimed = 0;
  try {
    const client = docker || getDockerClient();

    // 1. Docker API Prune Dangling Images
    try {
      const pruneRes = await client.post('/images/prune?filters=%7B%22dangling%22%3A%5B%22true%22%5D%7D');
      if (pruneRes.data) {
        deletedCount += (pruneRes.data.ImagesDeleted || []).length;
        spaceReclaimed += pruneRes.data.SpaceReclaimed || 0;
      }
    } catch (e: any) {
      console.warn('[Docker Cleanup] Prune dangling images request failed:', e.message);
    }

    // 2. Identify and delete untagged (<none>:<none>), stale schedulearr versions, and unused images
    try {
      const imgRes = await client.get('/images/json?all=true');
      const allImages = imgRes.data || [];

      // Determine images currently used by running containers so we NEVER delete active ones
      const contRes = await client.get('/containers/json?all=false');
      const runningContainers = contRes.data || [];
      const activeImageIds = new Set<string>();
      for (const c of runningContainers) {
        if (c.ImageID) activeImageIds.add(c.ImageID);
        if (c.Image) activeImageIds.add(c.Image);
      }

      for (const img of allImages) {
        const id = img.Id || '';
        if (activeImageIds.has(id)) continue;

        const repoTags: string[] = img.RepoTags || [];
        const isUntagged = repoTags.length === 0 || repoTags.every((t: string) => t.includes('<none>'));
        // Old superseded schedulearr releases that fill up the vdisk
        const isStaleSchedulearr = repoTags.some(
          (t: string) => t.toLowerCase().includes('schedulearr') && !t.endsWith(':latest')
        );
        const isUnused = options?.pruneAllUnused && (img.Containers === 0 || img.Containers === undefined);

        if (isUntagged || isStaleSchedulearr || isUnused) {
          try {
            await client.delete(`/images/${encodeURIComponent(id)}?force=false`);
            deletedCount++;
            spaceReclaimed += img.Size || 0;
            console.log(`[Docker Cleanup] Removed stale/unused image: ${repoTags.join(', ') || id}`);
          } catch (e) {
            // In use by another stopped container or layer dependency — safe to skip
          }
        }
      }
    } catch (e: any) {
      console.warn('[Docker Cleanup] Image sweep error:', e.message);
    }

    // 3. Prune Build Cache if requested
    if (options?.pruneBuildCache) {
      try {
        const bcRes = await client.post('/build/prune');
        if (bcRes.data) {
          spaceReclaimed += bcRes.data.SpaceReclaimed || 0;
        }
      } catch (e: any) {
        console.warn('[Docker Cleanup] Build cache prune failed:', e.message);
      }
    }
  } catch (e: any) {
    // Docker socket not available or permission error
  }
  return { deletedCount, spaceReclaimed };
}

/**
 * Dedicated VDisk cleaning action handler.
 */
export async function cleanVDisk(
  action: 'images' | 'build_cache' | 'dangling' | 'deep_clean'
): Promise<{ deletedCount: number; spaceReclaimed: number; details: string }> {
  const client = getDockerClient();
  let deletedCount = 0;
  let spaceReclaimed = 0;
  let details = '';

  if (action === 'dangling') {
    const res = await cleanupOrphanImages(client, { pruneAllUnused: false, pruneBuildCache: false });
    deletedCount = res.deletedCount;
    spaceReclaimed = res.spaceReclaimed;
    details = `Pruned ${deletedCount} dangling images`;
  } else if (action === 'build_cache') {
    try {
      const bcRes = await client.post('/build/prune');
      spaceReclaimed = bcRes.data?.SpaceReclaimed || 0;
      deletedCount = (bcRes.data?.CachesDeleted || []).length;
      details = `Pruned ${deletedCount} build cache layers`;
    } catch (e: any) {
      details = `Build cache prune: ${e.message}`;
    }
  } else if (action === 'images') {
    const res = await cleanupOrphanImages(client, { pruneAllUnused: true, pruneBuildCache: false });
    deletedCount = res.deletedCount;
    spaceReclaimed = res.spaceReclaimed;
    details = `Cleaned ${deletedCount} unused and stale images`;
  } else if (action === 'deep_clean') {
    const res = await cleanupOrphanImages(client, { pruneAllUnused: true, pruneBuildCache: true });
    const contCount = await cleanupOrphanContainers(client);
    deletedCount = res.deletedCount + contCount;
    spaceReclaimed = res.spaceReclaimed;
    details = `Deep clean: removed ${res.deletedCount} images, ${contCount} stale containers, and pruned build cache`;
  }

  return { deletedCount, spaceReclaimed, details };
}

export async function performStartupContainerCleanup(): Promise<void> {
  try {
    if (!fs.existsSync('/var/run/docker.sock')) return;
    const docker = getDockerClient();
    const listRes = await docker.get('/containers/json?all=true');
    const containers = listRes.data || [];

    const hostname = process.env.HOSTNAME || '';

    let currentContainerId = '';
    for (const c of containers) {
      if (hostname && (c.Id.startsWith(hostname) || hostname.startsWith(c.Id))) {
        currentContainerId = c.Id;
        break;
      }
    }

    // Clean up all inactive updater and orphan containers from past runs
    for (const c of containers) {
      if (c.Id === currentContainerId) continue;
      const names = c.Names || [];
      const isStale = names.some((n: string) => {
        const lower = n.toLowerCase();
        return lower.includes('schedulearr_updater') ||
               lower.includes('_updater_') ||
               lower.includes('_new_') ||
               lower.includes('_old_') ||
               lower.includes('schedulearr_old');
      });

      if (isStale) {
        try {
          await docker.delete(`/containers/${c.Id}?v=true&force=true`);
          console.log(`[Docker Cleanup] Removed stale container: ${names.join(', ')} (${c.Id})`);
        } catch (e) {}
      }
    }

    // Clean up orphaned / dangling images from previous updates
    await cleanupOrphanImages(docker);
  } catch (e) {
    // Ignore cleanup errors on non-docker environments
  }
}

export async function recreateSelfContainer(docker: any, containerInfo: any, targetImage: string): Promise<boolean> {
  if (!containerInfo) {
    throw new Error('Could not inspect current container over Docker socket.');
  }

  const rawName = containerInfo.Name || 'Schedulearr';
  const baseName = rawName.replace(/^\//, '').replace(/_new.*$/, '').replace(/_old.*$/, '');
  const timestamp = Date.now();
  const helperName = `schedulearr_updater_${timestamp}`;

  const existingBinds: string[] = Array.from(new Set(
    containerInfo.HostConfig?.Binds || [
      '/var/run/docker.sock:/var/run/docker.sock',
      '/mnt/user/appdata/schedulearr/data:/app/data'
    ]
  ));

  // Automatically propagate Unraid Plex / Media volume mounts so Schedulearr can always navigate the Unraid Plex folder
  try {
    const discovered = await discoverUnraidPlexMountsAndRoot(docker);
    for (const bind of discovered.extraBinds) {
      const [hostSrc, contDst] = bind.split(':');
      const alreadyHas = existingBinds.some((b: string) => {
        const [bSrc, bDst] = b.split(':');
        return bSrc === hostSrc || bDst === contDst;
      });
      if (!alreadyHas && hostSrc && contDst) {
        existingBinds.push(bind);
      }
    }
  } catch {}

  const binds: string[] = existingBinds;
  if (!binds.some(b => b.startsWith('/dev/bus/usb'))) {
    binds.push('/dev/bus/usb:/dev/bus/usb');
  }

  const rawHostConfig = containerInfo.HostConfig || {};
  const isHostNetwork = rawHostConfig.NetworkMode === 'host';

  const cleanHostConfig: any = {
    RestartPolicy: rawHostConfig.RestartPolicy || { Name: 'unless-stopped' },
    Binds: binds,
    NetworkMode: rawHostConfig.NetworkMode || (isHostNetwork ? 'host' : 'bridge'),
    Privileged: true
  };

  if (!isHostNetwork && rawHostConfig.PortBindings) {
    cleanHostConfig.PortBindings = rawHostConfig.PortBindings;
  }
  const existingDevices = (rawHostConfig.Devices || []).filter((d: any) => d.PathOnHost !== '/dev/bus/usb');
  cleanHostConfig.Devices = [
    ...existingDevices,
    {
      PathOnHost: '/dev/bus/usb',
      PathInContainer: '/dev/bus/usb',
      CgroupPermissions: 'rwm'
    }
  ];
  if (rawHostConfig.ExtraHosts && Array.isArray(rawHostConfig.ExtraHosts) && rawHostConfig.ExtraHosts.length > 0) {
    cleanHostConfig.ExtraHosts = rawHostConfig.ExtraHosts;
  }

  const networkingConfig = (!isHostNetwork && containerInfo.NetworkSettings?.Networks)
    ? { EndpointsConfig: containerInfo.NetworkSettings.Networks }
    : undefined;

  const newContainerConfig: any = {
    Image: targetImage,
    Env: containerInfo.Config?.Env || [],
    HostConfig: cleanHostConfig,
    Labels: {
      ...(containerInfo.Config?.Labels || {}),
      'schedulearr.original_name': baseName,
      'net.unraid.docker.managed': 'dockerman',
      'net.unraid.docker.webui': 'http://[IP]:[PORT:3010]/',
      'net.unraid.docker.shell': 'sh',
      'net.unraid.docker.icon': 'https://raw.githubusercontent.com/pedrogvm97/Schedulearr/main/public/icon.png'
    }
  };

  if (networkingConfig) {
    newContainerConfig.NetworkingConfig = networkingConfig;
  }

  const oldImageId = containerInfo.Image || '';

  const nodeScript = `
const http = require('http');
const fs = require('fs');
const oldId = '${containerInfo.Id}';
const oldImageId = '${oldImageId}';
const baseName = '${baseName}';
const helperName = '${helperName}';
const newConfig = JSON.parse(${JSON.stringify(JSON.stringify(newContainerConfig))});

try {
  const tPath = '/boot/config/plugins/dockerMan/templates-user/my-Schedulearr.xml';
  if (fs.existsSync(tPath)) {
    let xml = fs.readFileSync(tPath, 'utf8');
    if (xml.includes('<Privileged>false</Privileged>')) {
      xml = xml.replace('<Privileged>false</Privileged>', '<Privileged>true</Privileged>');
    }
    if (!xml.includes('/dev/bus/usb')) {
      xml = xml.replace('</Data>', '  <Volume>\\n      <HostDir>/dev/bus/usb</HostDir>\\n      <ContainerDir>/dev/bus/usb</ContainerDir>\\n      <Mode>rw</Mode>\\n    </Volume>\\n  </Data>');
    }
    fs.writeFileSync(tPath, xml, 'utf8');
  }
} catch (e) {}

function request(path, method, body, callback) {
  const req = http.request({
    socketPath: '/var/run/docker.sock',
    path: '/v1.41' + path,
    method: method || 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {}
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => callback && callback(null, data));
  });
  req.on('error', err => callback && callback(err));
  if (body) req.write(JSON.stringify(body));
  req.end();
}

setTimeout(() => {
  request('/containers/' + oldId + '/stop?t=10', 'POST', null, () => {
    const backupName = baseName + '_old_' + Date.now();
    request('/containers/' + oldId + '/rename?name=' + backupName, 'POST', null, () => {
      // 500ms breather for Docker daemon to free up baseName
      setTimeout(() => {
        request('/containers/create?name=' + baseName, 'POST', newConfig, (err, resData) => {
          let parsed = {};
          try { parsed = JSON.parse(resData); } catch(e) {}
          if (parsed && parsed.Id) {
            request('/containers/' + parsed.Id + '/start', 'POST', null, () => {
              request('/containers/' + oldId + '?v=true&force=true', 'DELETE', null, () => {
                request('/images/prune?filters=%7B%22dangling%22%3A%5B%22true%22%5D%7D', 'POST', null, () => {
                  process.exit(0);
                });
              });
            });
          } else {
            console.error('Failed to create replacement container with full config:', resData);
            // Fallback attempt: minimal config
            const minimalConfig = {
              Image: newConfig.Image,
              Env: newConfig.Env,
              HostConfig: {
                Privileged: true,
                Binds: newConfig.HostConfig?.Binds || ['/var/run/docker.sock:/var/run/docker.sock', '/mnt/user/appdata/schedulearr/data:/app/data', '/dev/bus/usb:/dev/bus/usb'],
                Devices: [{ PathOnHost: '/dev/bus/usb', PathInContainer: '/dev/bus/usb', CgroupPermissions: 'rwm' }],
                NetworkMode: newConfig.HostConfig?.NetworkMode || 'bridge',
                PortBindings: newConfig.HostConfig?.PortBindings,
                RestartPolicy: { Name: 'unless-stopped' }
              }
            };
            request('/containers/create?name=' + baseName, 'POST', minimalConfig, (err2, resData2) => {
              let parsed2 = {};
              try { parsed2 = JSON.parse(resData2); } catch(e) {}
              if (parsed2 && parsed2.Id) {
                request('/containers/' + parsed2.Id + '/start', 'POST', null, () => {
                  request('/containers/' + oldId + '?v=true&force=true', 'DELETE', null, () => {
                    process.exit(0);
                  });
                });
              } else {
                console.error('Minimal fallback container creation failed:', resData2);
                request('/containers/' + oldId + '/rename?name=' + baseName, 'POST', null, () => {
                  request('/containers/' + oldId + '/start', 'POST', null, () => {
                    process.exit(1);
                  });
                });
              }
            });
          }
        });
      }, 500);
    });
  });
}, 2000);
`;

  const helperConfig = {
    Image: targetImage,
    Cmd: ['node', '-e', nodeScript],
    HostConfig: {
      AutoRemove: true,
      Privileged: true,
      Binds: [
        '/var/run/docker.sock:/var/run/docker.sock',
        '/boot:/boot:rw'
      ]
    }
  };

  try {
    const createRes = await docker.post(`/containers/create?name=${helperName}`, helperConfig);
    const helperId = createRes.data.Id;
    await docker.post(`/containers/${helperId}/start`);
  } catch (e: any) {
    console.error('Failed to launch self-updater helper container:', e.message);
    throw e;
  }

  return true;
}

export interface UnraidMountDiscovery {
  extraBinds: string[];
  plexRootCandidates: string[];
  mountMappings: Array<{
    hostPath: string;
    containerPath: string;
    sourceContainer: string;
  }>;
}

/**
 * Inspects Docker containers on Unraid (Plex, Radarr, Sonarr, Lidarr, and Schedulearr)
 * to discover the Unraid host/container media mounts and the parent Plex Media Folder.
 */
export async function discoverUnraidPlexMountsAndRoot(dockerClient?: any): Promise<UnraidMountDiscovery> {
  const extraBinds: string[] = [];
  const plexRootCandidates = new Set<string>();
  const mountMappings: Array<{ hostPath: string; containerPath: string; sourceContainer: string }> = [];

  try {
    if (fs.existsSync('/var/run/docker.sock')) {
      const client = dockerClient || getDockerClient();
      const listRes = await client.get('/containers/json?all=true');
      const containers = listRes.data || [];

      for (const c of containers) {
        const names: string[] = (c.Names || []).map((n: string) => n.replace(/^\//, ''));
        const image = String(c.Image || '').toLowerCase();
        const isMediaContainer = names.some((n) =>
          /\b(plex|radarr|sonarr|lidarr|jellyfin|emby|schedulearr)\b/i.test(n)
        ) || /\b(plex|radarr|sonarr|lidarr|schedulearr)\b/i.test(image);

        if (!isMediaContainer) continue;

        const mounts = Array.isArray(c.Mounts) ? c.Mounts : [];
        for (const m of mounts) {
          const src = String(m.Source || '').replace(/\/+$/, '');
          const dst = String(m.Destination || '').replace(/\/+$/, '');
          if (!src || !dst) continue;
          if (
            dst === '/config' ||
            dst === '/app/data' ||
            dst === '/var/run/docker.sock' ||
            dst.startsWith('/transcode') ||
            src.includes('/appdata/')
          ) {
            continue;
          }

          if (src.startsWith('/mnt/') || dst.startsWith('/data') || dst.startsWith('/media') || dst.startsWith('/mnt')) {
            mountMappings.push({
              hostPath: src,
              containerPath: dst,
              sourceContainer: names[0] || 'media'
            });
            extraBinds.push(`${src}:${dst}:rw`);
            extraBinds.push(`${src}:${src}:rw`);
            if (fs.existsSync(dst)) plexRootCandidates.add(dst);
            if (fs.existsSync(src)) plexRootCandidates.add(src);
          }
        }
      }
    }
  } catch {}

  const standardCandidates = [
    '/mnt/user/data/media',
    '/mnt/user/media',
    '/mnt/user/Media',
    '/mnt/user/Plex',
    '/mnt/user/plex',
    '/data/media',
    '/media',
    '/data'
  ];
  for (const cand of standardCandidates) {
    if (fs.existsSync(cand)) {
      plexRootCandidates.add(cand);
    }
  }

  return {
    extraBinds: Array.from(new Set(extraBinds)),
    plexRootCandidates: Array.from(plexRootCandidates),
    mountMappings
  };
}

/**
 * Automated Unraid permission fixer (runs automatically like the auto-updater commands).
 * Ensures directories are 0777 and files are 0666 with Unraid `nobody:users` (99:100) ownership.
 * Falls back to a lightweight ephemeral Docker container over `/var/run/docker.sock` if local chown/chmod is restricted.
 */
export async function ensureUnraidPathPermissions(targetPath: string): Promise<{ ok: boolean; method: string }> {
  if (!targetPath) return { ok: false, method: 'none' };

  let localSuccess = false;
  try {
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      const mode = stat.isDirectory() ? 0o777 : 0o666;
      try { fs.chmodSync(targetPath, mode); } catch {}
      try { fs.chownSync(targetPath, 99, 100); } catch {}
      localSuccess = true;
    }
  } catch {}

  // If on Linux/Unraid with Docker socket available, also ensure host-level 99:100 (nobody:users) & 777 permissions
  if (process.platform === 'linux' && fs.existsSync('/var/run/docker.sock')) {
    try {
      const docker = getDockerClient();
      const hostname = process.env.HOSTNAME || '';
      const selfInfo = await findSelfContainer(docker, hostname);
      const image = selfInfo?.Image || 'pedrogvm97/schedulearr:latest';
      const binds: string[] = selfInfo?.HostConfig?.Binds || [];

      if (binds.length > 0) {
        const permHelperName = `schedulearr_perm_${Date.now()}`;
        const safePath = targetPath.replace(/'/g, "'\\''");
        const cmdScript = `chmod -R 777 '${safePath}' 2>/dev/null || true; chown -R 99:100 '${safePath}' 2>/dev/null || true`;
        const createRes = await docker.post(`/containers/create?name=${permHelperName}`, {
          Image: image,
          User: '0:0',
          Cmd: ['sh', '-c', cmdScript],
          HostConfig: {
            AutoRemove: true,
            Binds: binds
          }
        });
        if (createRes.data?.Id) {
          await docker.post(`/containers/${createRes.data.Id}/start`);
          return { ok: true, method: 'docker_helper' };
        }
      }
    } catch {}
  }

  return { ok: localSuccess, method: localSuccess ? 'local_fs' : 'none' };
}

/**
 * Runs an ephemeral privileged container on the host via /var/run/docker.sock with /dev/bus/usb bound.
 * This directly transmits the ADB USB handshake from the host to a physical Android phone plugged into the server,
 * which displays the "Always allow from this computer" dialog on the phone's screen,
 * and restarts the phone's ADB daemon into TCP mode on port 5555.
 */
export async function runPrivilegedUsbAdb(targetIp?: string): Promise<{
  success: boolean;
  devicesOutput: string;
  tcpipOutput: string;
  connectOutput?: string;
  message: string;
}> {
  if (!fs.existsSync('/var/run/docker.sock')) {
    return {
      success: false,
      devicesOutput: '',
      tcpipOutput: '',
      message: 'Docker socket not available on host'
    };
  }

  const docker = getDockerClient();
  const hostname = process.env.HOSTNAME || '';
  const selfInfo = await findSelfContainer(docker, hostname);
  const image = selfInfo?.Config?.Image || selfInfo?.Image || 'ghcr.io/pedrogvm97/schedulearr:latest';

  // Discover host path for /app/data so keys persist
  const binds: string[] = selfInfo?.HostConfig?.Binds || [];
  let hostDataDir = '/mnt/user/appdata/schedulearr/data';
  for (const b of binds) {
    const parts = b.split(':');
    if (parts[1] === '/app/data' || parts[1]?.startsWith('/app/data')) {
      hostDataDir = parts[0];
      break;
    }
  }

  // Ensure local /app/data/.android exists
  const localAndroidDir = '/app/data/.android';
  try {
    if (!fs.existsSync(localAndroidDir)) {
      fs.mkdirSync(localAndroidDir, { recursive: true });
    }
    // Also copy existing /root/.android keys to /app/data/.android if present
    if (fs.existsSync('/root/.android')) {
      const files = fs.readdirSync('/root/.android');
      for (const f of files) {
        const src = `/root/.android/${f}`;
        const dst = `${localAndroidDir}/${f}`;
        if (!fs.existsSync(dst)) {
          try { fs.copyFileSync(src, dst); } catch {}
        }
      }
    }
  } catch {}

  const helperName = `schedulearr_usb_${Date.now()}`;
  const script = [
    'mkdir -p /root/.android',
    'cp -r /app/data/.android/* /root/.android/ 2>/dev/null || true',
    'adb start-server',
    'echo "=== ADB_DEVICES ==="',
    'adb devices -l',
    'echo "=== ADB_TCPIP ==="',
    'adb tcpip 5555 2>&1 || true',
    'cp -r /root/.android/* /app/data/.android/ 2>/dev/null || true',
    'chmod -R 777 /app/data/.android 2>/dev/null || true'
  ].join(' && ');

  let rawLogs = '';
  try {
    const createRes = await docker.post(`/containers/create?name=${helperName}`, {
      Image: image,
      User: '0:0',
      Tty: true,
      Cmd: ['sh', '-c', script],
      HostConfig: {
        Privileged: true,
        Binds: [
          '/dev/bus/usb:/dev/bus/usb',
          `${hostDataDir}:/app/data:rw`
        ]
      }
    });

    const helperId = createRes.data?.Id;
    if (!helperId) {
      return {
        success: false,
        devicesOutput: '',
        tcpipOutput: '',
        message: 'Failed to create USB runner container'
      };
    }

    // Start container
    await docker.post(`/containers/${helperId}/start`);

    // Wait up to 10 seconds for completion
    const startWait = Date.now();
    while (Date.now() - startWait < 10000) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const inspectRes = await docker.get(`/containers/${helperId}/json`);
        if (!inspectRes.data?.State?.Running) break;
      } catch {
        break;
      }
    }

    try {
      const logRes = await docker.get(`/containers/${helperId}/logs?stdout=true&stderr=true`, {
        responseType: 'text'
      });
      rawLogs = String(logRes.data || '');
    } catch {}

    // Clean up helper container
    try {
      await docker.delete(`/containers/${helperId}?v=true&force=true`);
    } catch {}

    // Sync newly generated keys back into /root/.android in current container
    try {
      if (fs.existsSync(localAndroidDir)) {
        if (!fs.existsSync('/root/.android')) {
          fs.mkdirSync('/root/.android', { recursive: true });
        }
        const files = fs.readdirSync(localAndroidDir);
        for (const f of files) {
          try {
            fs.copyFileSync(`${localAndroidDir}/${f}`, `/root/.android/${f}`);
          } catch {}
        }
      }
    } catch {}

    const devSection = rawLogs.includes('=== ADB_DEVICES ===')
      ? rawLogs.split('=== ADB_DEVICES ===')[1].split('=== ADB_TCPIP ===')[0].trim()
      : rawLogs;
    const tcpipSection = rawLogs.includes('=== ADB_TCPIP ===')
      ? rawLogs.split('=== ADB_TCPIP ===')[1].trim()
      : '';

    const lowerLogs = rawLogs.toLowerCase();
    const isSuccess = lowerLogs.includes('restarting in tcp mode') || lowerLogs.includes('restarting in tcpip mode');
    const isUnauthorized = lowerLogs.includes('unauthorized');
    const hasDevice = lowerLogs.includes('usb:') || (devSection.split('\n').length > 1 && devSection.split('\n')[1].trim().length > 0);

    let connectOutput = '';
    if (isSuccess && targetIp && targetIp.trim()) {
      const cleanIp = targetIp.trim().split(':')[0];
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execP = promisify(exec);
        const connRes = await execP(`adb connect ${cleanIp}:5555`, { timeout: 6000 }).catch((e: any) => ({ stdout: e.message }));
        connectOutput = (connRes.stdout || '').trim();
      } catch {}
    }

    let message = '';
    if (isSuccess) {
      message = 'TCP/IP mode activated on port 5555! Phone is ready for wireless pairing.';
    } else if (isUnauthorized) {
      message = 'USB device detected! Look at your phone screen now, check "Always allow from this computer", tap Allow, then click Run again.';
    } else if (hasDevice) {
      message = tcpipSection || 'USB device detected on server.';
    } else {
      message = 'No USB device detected on server. Make sure the phone is plugged into the server and USB Debugging is ON.';
    }

    return {
      success: isSuccess,
      devicesOutput: devSection,
      tcpipOutput: tcpipSection || rawLogs,
      connectOutput: connectOutput || undefined,
      message
    };
  } catch (err: any) {
    return {
      success: false,
      devicesOutput: rawLogs,
      tcpipOutput: err.message,
      message: `Privileged USB runner error: ${err.message}`
    };
  }
}

