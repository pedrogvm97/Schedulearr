import { NextResponse } from 'next/server';
import fs from 'fs';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET() {
  const socketPath = '/var/run/docker.sock';
  const dataDir = '/app/data';

  // Check if data directory is writable from inside the container
  let isDataWritable = false;
  try {
    const testFile = `${dataDir}/.permission_test`;
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    isDataWritable = true;
  } catch (e) {
    console.error('Data directory is not writable:', e);
  }

  if (!fs.existsSync(socketPath)) {
    return NextResponse.json({
      available: false,
      isDataWritable,
      reason: 'Docker socket not mapped',
      dataDir
    });
  }

  try {
    let containerIdentifier = 'Schedulearr'; // standard fallback container name
    try {
      if (fs.existsSync('/etc/hostname')) {
        const id = fs.readFileSync('/etc/hostname', 'utf8').trim();
        if (id && id !== '0.0.0.0' && id !== 'localhost') {
          containerIdentifier = id;
        }
      } else if (process.env.HOSTNAME && process.env.HOSTNAME !== '0.0.0.0' && process.env.HOSTNAME !== 'localhost') {
        containerIdentifier = process.env.HOSTNAME;
      }
    } catch (e) {
      console.warn('Failed to resolve container hostname, falling back to Schedulearr:', e);
    }

    const docker = axios.create({
      socketPath: socketPath,
      baseURL: 'http://localhost/v1.41',
      timeout: 5000
    });

    // Try containerIdentifier (either container ID from /etc/hostname or 'Schedulearr')
    let response;
    try {
      response = await docker.get(`/containers/${containerIdentifier}/json`);
    } catch (err: any) {
      // If that fails (e.g. 404), fall back to standard container names or try short ID/lowercase
      console.warn(`Failed to query container via '${containerIdentifier}', trying fallback...`);
      try {
        response = await docker.get('/containers/Schedulearr/json');
      } catch {
        try {
          response = await docker.get('/containers/schedulearr/json');
        } catch {
          // If all specific queries fail, query /containers/json and find the one that has Schedulearr in its name
          const allContainers = await docker.get('/containers/json?all=true');
          const selfContainer = (allContainers.data || []).find((c: any) => 
            c.Names?.some((n: string) => n.toLowerCase().includes('schedulearr'))
          );
          if (selfContainer) {
            response = await docker.get(`/containers/${selfContainer.Id}/json`);
          } else {
            throw err; // throw original error if no container found
          }
        }
      }
    }
    const data = response.data;

    const mounts = (data.Mounts || []).map((m: any) => ({
      host: m.Source,
      container: m.Destination,
      mode: m.Mode,
      rw: m.RW
    }));

    // Find the host path mapping to /app/data
    const dataMount = mounts.find((m: any) => m.container === '/app/data' || m.container === '/app/data/');
    const dataHostPath = dataMount ? dataMount.host : '/mnt/user/appdata/Schedulearr/data';

    // Parse ports
    const ports: any[] = [];
    const portBindings = data.HostConfig?.PortBindings || {};
    const networkPorts = data.NetworkSettings?.Ports || {};
    
    // Combine ports info
    const allPortKeys = Array.from(new Set([...Object.keys(portBindings), ...Object.keys(networkPorts)]));
    for (const key of allPortKeys) {
      const containerPort = parseInt(key.split('/')[0]);
      const bindings = portBindings[key] || networkPorts[key] || [];
      if (bindings.length > 0) {
        ports.push({
          container: containerPort,
          host: parseInt(bindings[0].HostPort)
        });
      }
    }

    return NextResponse.json({
      available: true,
      isDataWritable,
      containerId: data.Id,
      containerName: data.Name?.replace(/^\//, ''),
      image: data.Config?.Image,
      mounts,
      ports,
      dataHostPath,
      rawConfig: {
        HostConfig: data.HostConfig,
        NetworkSettings: data.NetworkSettings
      }
    });

  } catch (error: any) {
    console.error('Error fetching docker self info:', error.message);
    return NextResponse.json({
      available: false,
      isDataWritable,
      reason: `Failed to talk to Docker socket: ${error.message}`,
      dataHostPath: '/mnt/user/appdata/Schedulearr/data',
      dataDir
    });
  }
}
