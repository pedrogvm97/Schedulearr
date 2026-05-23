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
    const hostname = process.env.HOSTNAME || 'localhost';
    const docker = axios.create({
      socketPath: socketPath,
      baseURL: 'http://localhost/v1.41',
      timeout: 5000
    });

    const response = await docker.get(`/containers/${hostname}/json`);
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
