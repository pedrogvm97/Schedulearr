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

  // 3. Try direct lookup using hostname
  try {
    const res = await docker.get(`/containers/${hostname}/json`);
    if (res.data) return res.data;
  } catch (e) {
    console.warn(`Direct container lookup for hostname "${hostname}" failed, searching fallback names...`);
  }

  // 4. Try standard default names (e.g. casing discrepancies)
  const fallbackNames = ['Schedulearr', 'schedulearr', 'schedule-arr'];
  for (const name of fallbackNames) {
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
export async function cleanupOrphanImages(docker?: any): Promise<{ deletedCount: number; spaceReclaimed: number }> {
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

    // 2. Identify and delete untagged (<none>:<none>) or stale schedulearr images
    try {
      const imgRes = await client.get('/images/json?all=true');
      const images = imgRes.data || [];
      
      // Determine image currently used by running containers so we NEVER delete active ones
      const contRes = await client.get('/containers/json?all=false');
      const runningContainers = contRes.data || [];
      const activeImageIds = new Set<string>();
      for (const c of runningContainers) {
        if (c.ImageID) activeImageIds.add(c.ImageID);
        if (c.Image) activeImageIds.add(c.Image);
      }

      for (const img of images) {
        const id = img.Id || '';
        if (activeImageIds.has(id)) continue;

        const repoTags: string[] = img.RepoTags || [];
        const isUntagged = repoTags.length === 0 || repoTags.every((t: string) => t.includes('<none>'));

        if (isUntagged) {
          try {
            await client.delete(`/images/${encodeURIComponent(id)}?force=false`);
            deletedCount++;
            spaceReclaimed += img.Size || 0;
            console.log(`[Docker Cleanup] Removed orphaned/stale image: ${repoTags.join(', ') || id}`);
          } catch (e) {
            // In use by another stopped container or layer dependency — safe to skip
          }
        }
      }
    } catch (e: any) {
      console.warn('[Docker Cleanup] Stale image sweep error:', e.message);
    }
  } catch (e: any) {
    // Docker socket not available or permission error
  }
  return { deletedCount, spaceReclaimed };
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

  const binds: string[] = containerInfo.HostConfig?.Binds || [
    '/var/run/docker.sock:/var/run/docker.sock',
    '/mnt/user/appdata/schedulearr/data:/app/data'
  ];

  const rawHostConfig = containerInfo.HostConfig || {};
  const isHostNetwork = rawHostConfig.NetworkMode === 'host';

  const cleanHostConfig: any = {
    RestartPolicy: rawHostConfig.RestartPolicy || { Name: 'unless-stopped' },
    Binds: rawHostConfig.Binds || binds,
    NetworkMode: rawHostConfig.NetworkMode || (isHostNetwork ? 'host' : 'bridge'),
    Privileged: !!rawHostConfig.Privileged
  };

  if (!isHostNetwork && rawHostConfig.PortBindings) {
    cleanHostConfig.PortBindings = rawHostConfig.PortBindings;
  }
  if (rawHostConfig.Devices && Array.isArray(rawHostConfig.Devices) && rawHostConfig.Devices.length > 0) {
    cleanHostConfig.Devices = rawHostConfig.Devices;
  }
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
      'schedulearr.original_name': baseName
    }
  };

  if (networkingConfig) {
    newContainerConfig.NetworkingConfig = networkingConfig;
  }

  const oldImageId = containerInfo.Image || '';

  const nodeScript = `
const http = require('http');
const oldId = '${containerInfo.Id}';
const oldImageId = '${oldImageId}';
const baseName = '${baseName}';
const helperName = '${helperName}';
const newConfig = JSON.parse(${JSON.stringify(JSON.stringify(newContainerConfig))});

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
                Binds: newConfig.HostConfig?.Binds || ['/var/run/docker.sock:/var/run/docker.sock', '/mnt/user/appdata/schedulearr/data:/app/data'],
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
      Binds: ['/var/run/docker.sock:/var/run/docker.sock']
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
