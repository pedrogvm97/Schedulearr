import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import { findSelfContainer } from '@/lib/docker';
import { getInstances } from '@/lib/db';

export const dynamic = 'force-dynamic';

function resolveHostLanIp(): string | null {
  // 1. Check configured service instances (e.g., Plex/Sonarr/Radarr on Unraid LAN IP 192.168.x.x or 10.x.x.x)
  try {
    const instances = getInstances();
    for (const inst of instances) {
      if (!inst.url) continue;
      try {
        const u = new URL(inst.url);
        const h = u.hostname;
        if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h) && !h.startsWith('172.17.')) {
          return h;
        }
      } catch {}
    }
  } catch {}

  // 2. Check OS network interfaces for a non-internal, non-Docker-bridge IPv4 address
  try {
    const nets = os.networkInterfaces();
    const candidates: string[] = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
            return net.address;
          }
          if (!net.address.startsWith('172.17.')) {
            candidates.push(net.address);
          }
        }
      }
    }
    if (candidates.length > 0) return candidates[0];
  } catch {}

  return null;
}

export async function GET() {
  const socketPath = '/var/run/docker.sock';
  const dataDir = '/app/data';
  const lanIp = resolveHostLanIp();

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
      lanIp,
      reason: 'Docker socket not mapped',
      dataDir
    });
  }

  try {
    let hostname = 'localhost';
    try {
      if (fs.existsSync('/etc/hostname')) {
        const id = fs.readFileSync('/etc/hostname', 'utf8').trim();
        if (id && id !== '0.0.0.0' && id !== 'localhost') {
          hostname = id;
        }
      } else if (process.env.HOSTNAME && process.env.HOSTNAME !== '0.0.0.0' && process.env.HOSTNAME !== 'localhost') {
        hostname = process.env.HOSTNAME;
      }
    } catch (e) {
      console.warn('Failed to resolve container hostname:', e);
    }

    const docker = axios.create({
      socketPath: socketPath,
      baseURL: 'http://localhost/v1.41',
      timeout: 5000
    });

    const data = await findSelfContainer(docker, hostname);
    if (!data) {
      throw new Error(`Failed to find container info for hostname: ${hostname}`);
    }

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
      lanIp,
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
      lanIp,
      reason: `Failed to talk to Docker socket: ${error.message}`,
      dataHostPath: '/mnt/user/appdata/Schedulearr/data',
      dataDir
    });
  }
}
