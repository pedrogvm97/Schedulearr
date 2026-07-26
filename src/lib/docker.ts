import fs from 'fs';

/**
 * Sweeps and force-deletes all orphaned _old_ temporary containers created during updates.
 */
export async function cleanupOrphanContainers(docker: any): Promise<number> {
  let count = 0;
  try {
    const listRes = await docker.get('/containers/json?all=true');
    const containers = listRes.data || [];
    for (const c of containers) {
      const names = c.Names || [];
      if (names.some((n: string) => n.includes('_old_') || n.toLowerCase().includes('schedulearr_old'))) {
        try {
          await docker.delete(`/containers/${c.Id}?v=true&force=true`);
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

    // Check by name case-insensitively
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
      return image.includes('schedulearr');
    });

    for (const container of schedulearrContainers) {
      try {
        const res = await docker.get(`/containers/${container.Id}/json`);
        // If it matches our hostname, or if it is the only container with schedulearr image
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

/**
 * Recreates a container in-place with a new image tag while preserving all
 * port bindings, volumes, environment variables, and network configurations.
 */
export async function recreateSelfContainer(docker: any, containerInfo: any, targetImage: string): Promise<boolean> {
  if (!containerInfo || !containerInfo.Id) {
    throw new Error('Container info not found');
  }

  // First: Purge any leftover _old_ containers from previous update attempts
  try {
    const listRes = await docker.get('/containers/json?all=true');
    const containers = listRes.data || [];
    for (const c of containers) {
      const names = c.Names || [];
      if (names.some((n: string) => n.includes('_old_'))) {
        await docker.delete(`/containers/${c.Id}?v=true&force=true`).catch(() => {});
      }
    }
  } catch (e) {}

  const containerId = containerInfo.Id;
  const rawName = containerInfo.Name || 'Schedulearr';
  const name = rawName.replace(/^\//, '');
  const tempName = `${name}_old_${Date.now()}`;

  // 1. Stop existing container to release port bindings
  try {
    await docker.post(`/containers/${containerId}/stop?t=5`);
  } catch (e) {}

  // 2. Rename existing container
  await docker.post(`/containers/${containerId}/rename?name=${tempName}`);

  // 3. Prepare clean container config with new image
  const createBody = {
    Image: targetImage,
    Env: containerInfo.Config?.Env || [],
    Cmd: containerInfo.Config?.Cmd,
    Entrypoint: containerInfo.Config?.Entrypoint,
    WorkingDir: containerInfo.Config?.WorkingDir,
    ExposedPorts: containerInfo.Config?.ExposedPorts || {},
    Labels: containerInfo.Config?.Labels || {},
    Volumes: containerInfo.Config?.Volumes || {},
    HostConfig: {
      Binds: containerInfo.HostConfig?.Binds || [],
      NetworkMode: containerInfo.HostConfig?.NetworkMode || 'host',
      PortBindings: containerInfo.HostConfig?.PortBindings || {},
      RestartPolicy: containerInfo.HostConfig?.RestartPolicy?.Name ? containerInfo.HostConfig.RestartPolicy : { Name: 'unless-stopped' },
      ExtraHosts: containerInfo.HostConfig?.ExtraHosts || [],
      Privileged: containerInfo.HostConfig?.Privileged || false
    },
    NetworkingConfig: {
      EndpointsConfig: containerInfo.NetworkSettings?.Networks || {}
    }
  };

  try {
    // 4. Create new container with original name on freed port
    const createRes = await docker.post(`/containers/create?name=${name}`, createBody);
    const newContainerId = createRes.data.Id;

    // 5. Start new container
    await docker.post(`/containers/${newContainerId}/start`);

    // 6. Delete old container synchronously to prevent orphan containers in Unraid
    await docker.delete(`/containers/${tempName}?v=true&force=true`).catch(() => {});
    await docker.delete(`/containers/${containerId}?v=true&force=true`).catch(() => {});
    return true;
  } catch (err: any) {
    // If creation failed, attempt to restart original container
    await docker.post(`/containers/${tempName}/rename?name=${name}`).catch(() => {});
    await docker.post(`/containers/${containerId}/start`).catch(() => {});
    throw err;
  }
}
