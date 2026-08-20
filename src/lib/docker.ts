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
  // 1. Try to read from /proc/self/cgroup
  try {
    if (fs.existsSync('/proc/self/cgroup')) {
      const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8');
      const matches = cgroup.match(/\/docker\/([a-f0-9]{64})/i);
      if (matches && matches[1]) {
        const res = await docker.get(`/containers/${matches[1]}/json`);
        if (res.data) return res.data;
      }
      
      const lines = cgroup.split('\n');
      for (const line of lines) {
        const parts = line.split('/');
        const last = parts[parts.length - 1];
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
      const matches = mountinfo.match(/\/docker\/containers\/([a-f0-9]{64})/i);
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
  const fallbackNames = ['Schedulearr', 'schedulearr'];
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

    // Check containers running the schedulearr image
    const schedulearrContainers = containers.filter((c: any) => {
      const image = (c.Image || '').toLowerCase();
      return image.includes('schedulearr') && !c.Names?.some((n: string) => n.includes('updater'));
    });

    for (const container of schedulearrContainers) {
      try {
        const res = await docker.get(`/containers/${container.Id}/json`);
        if (res.data && (res.data.Config?.Hostname === hostname || schedulearrContainers.length === 1)) {
          return res.data;
        }
      } catch (e) {}
    }
  } catch (e) {
    console.warn('Failed to search containers list:', e);
  }

  return null;
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

  const newContainerConfig = {
    Image: targetImage,
    Cmd: containerInfo.Config?.Cmd,
    Env: containerInfo.Config?.Env,
    HostConfig: containerInfo.HostConfig || {
      NetworkMode: 'host',
      Binds: binds,
      RestartPolicy: { Name: 'unless-stopped' }
    },
    Labels: {
      ...(containerInfo.Config?.Labels || {}),
      'schedulearr.original_name': baseName
    }
  };

  const nodeScript = `
const http = require('http');
const oldId = '${containerInfo.Id}';
const baseName = '${baseName}';
const helperName = '${helperName}';
const newConfig = ${JSON.stringify(newContainerConfig)};

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
  request('/containers/' + oldId + '/stop?t=5', 'POST', null, () => {
    request('/containers/' + oldId + '?v=true&force=true', 'DELETE', null, () => {
      request('/containers/create?name=' + baseName, 'POST', newConfig, (err, resData) => {
        let createdId = baseName;
        try { createdId = JSON.parse(resData).Id || baseName; } catch(e) {}
        request('/containers/' + createdId + '/start', 'POST', null, () => {
          // Delete updater helper container itself before exiting
          request('/containers/' + helperName + '?v=true&force=true', 'DELETE', null, () => {
            process.exit(0);
          });
        });
      });
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
