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

export async function performStartupContainerCleanup(): Promise<void> {
  try {
    const docker = getDockerClient();
    const listRes = await docker.get('/containers/json?all=true');
    const containers = listRes.data || [];

    const hostname = process.env.HOSTNAME;
    if (!hostname) return;

    let currentContainer: any = null;
    for (const c of containers) {
      if (c.Id.startsWith(hostname) || hostname.startsWith(c.Id)) {
        currentContainer = c;
        break;
      }
    }

    if (!currentContainer) return;

    const labels = currentContainer.Labels || {};
    const cleanupTargetId = labels['schedulearr.cleanup_target'];
    const originalName = labels['schedulearr.original_name'] || 'Schedulearr';

    if (cleanupTargetId) {
      // 1. Force stop and delete old container over Docker socket
      await docker.post(`/containers/${cleanupTargetId}/stop?t=5`).catch(() => {});
      await docker.delete(`/containers/${cleanupTargetId}?v=true&force=true`).catch(() => {});

      // 2. Rename current container to original name
      const currentNames = currentContainer.Names || [];
      const isAlreadyOriginalName = currentNames.some((n: string) => n === `/${originalName}`);
      if (!isAlreadyOriginalName) {
        await docker.post(`/containers/${currentContainer.Id}/rename?name=${originalName}`).catch(() => {});
      }
    }

    // Clean up any stale orphan containers from past runs
    for (const c of containers) {
      const names = c.Names || [];
      if (c.Id !== currentContainer.Id && names.some((n: string) => n.includes('_new_') || n.includes('_old_'))) {
        await docker.delete(`/containers/${c.Id}?v=true&force=true`).catch(() => {});
      }
    }
  } catch (e) {
    // Ignore cleanup errors on non-docker environments
  }
}

export async function recreateSelfContainer(targetImage: string): Promise<boolean> {
  const containerInfo = await getSelfContainerInfo();
  if (!containerInfo) {
    throw new Error('Could not inspect current container over Docker socket.');
  }

  const docker = getDockerClient();
  const rawName = containerInfo.Name || 'Schedulearr';
  const baseName = rawName.replace(/^\//, '').replace(/_new.*$/, '').replace(/_old.*$/, '');
  const tempNewName = `${baseName}_new_${Date.now()}`;

  // 1. Prepare minimal clean container config with new image
  const createBody = {
    Image: targetImage,
    Env: containerInfo.Config?.Env || [],
    Cmd: containerInfo.Config?.Cmd,
    Entrypoint: containerInfo.Config?.Entrypoint,
    WorkingDir: containerInfo.Config?.WorkingDir,
    Volumes: containerInfo.Config?.Volumes || {},
    Labels: {
      ...(containerInfo.Config?.Labels || {}),
      'schedulearr.cleanup_target': containerInfo.Id,
      'schedulearr.original_name': baseName
    },
    HostConfig: {
      Binds: containerInfo.HostConfig?.Binds || [],
      NetworkMode: 'host',
      RestartPolicy: { Name: 'unless-stopped' }
    }
  };

  // 2. Create replacement container under temporary unique name (no 409 name conflicts, process stays alive)
  const createRes = await docker.post(`/containers/create?name=${tempNewName}`, createBody);
  const newContainerId = createRes.data.Id;

  // 3. Start replacement container
  await docker.post(`/containers/${newContainerId}/start`);

  // 4. Return true cleanly to HTTP SSE stream
  return true;
}
