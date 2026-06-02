import fs from 'fs';

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
    for (const container of containers) {
      const names = container.Names || [];
      const hasNameMatch = names.some((n: string) => n.replace(/^\//, '').toLowerCase() === hostnameLower);
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
