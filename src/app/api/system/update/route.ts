import { NextResponse } from 'next/server';
import fs from 'fs';
import axios from 'axios';
import os from 'os';
import { findSelfContainer } from '@/lib/docker';

export const dynamic = 'force-dynamic';

export async function POST() {
  const socketPath = '/var/run/docker.sock';

  if (!fs.existsSync(socketPath)) {
    return NextResponse.json({ 
      error: 'Docker socket not found. Please map /var/run/docker.sock to the container to enable updates.' 
    }, { status: 400 });
  }

  const hostname = os.hostname() || 'localhost';

  try {
    const docker = axios.create({
      socketPath: socketPath,
      baseURL: 'http://localhost/v1.41', // Standard docker API version
      timeout: 180000 // 3 minutes for pull
    });

    // 1. Identify image name and container ID
    let imageName = 'ghcr.io/pedrogvm97/schedulearr:latest';
    let containerId = hostname;
    let containerInfo: any = null;
    try {
      containerInfo = await findSelfContainer(docker, hostname);
      if (containerInfo) {
        imageName = containerInfo.Config?.Image || imageName;
        containerId = containerInfo.Id || hostname;
      }
    } catch (e) {
      console.warn('Could not read container config, using defaults');
    }

    // 2. Pull the latest image
    console.log(`Starting image pull: ${imageName}`);
    let fromImage = imageName;
    let tag = 'latest';
    if (imageName.includes(':')) {
      const parts = imageName.split(':');
      tag = parts.pop() || 'latest';
      fromImage = parts.join(':');
    }

    try {
      await docker.post(`/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`);
    } catch (pullError: any) {
      console.error('Docker pull failed:', pullError.message);
      return NextResponse.json({ error: 'Failed to pull latest image: ' + pullError.message }, { status: 500 });
    }

    // 3. Recreate or restart container via Docker socket
    console.log(`Triggering container recreate/restart for ${containerId}`);
    try {
      // Trigger container recreation/restart asynchronously so we can return the response before the container goes down
      setTimeout(async () => {
        try {
          if (containerInfo) {
            const finalImage = `${fromImage}:${tag}`;
            const oldName = containerInfo.Name.replace(/^\//, '');
            const oldId = containerInfo.Id;
            const oldNameTmp = `${oldName}_old`;

            await docker.post(`/containers/${oldId}/stop?t=10`);
            await docker.post(`/containers/${oldId}/rename?name=${oldNameTmp}`);

            const createBody = {
              ...containerInfo.Config,
              Image: finalImage,
              HostConfig: containerInfo.HostConfig,
              NetworkingConfig: {
                EndpointsConfig: containerInfo.NetworkSettings?.Networks || {}
              }
            };

            const createRes = await docker.post(`/containers/create?name=${oldName}`, createBody);
            const newId = createRes.data.Id;

            await docker.post(`/containers/${newId}/start`);
            await docker.delete(`/containers/${oldId}_old?force=true`);
            console.log('[Updater] Container updated and recreated successfully.');
          } else {
            await docker.post(`/containers/${containerId}/restart`);
          }
        } catch (e: any) {
          console.error('Failed to trigger update recreation in background:', e.message);
        }
      }, 500);

      return NextResponse.json({ 
        success: true, 
        message: 'Latest image pulled successfully. The application container is now updating/recreating.' 
      });
    } catch (restartError: any) {
      console.error('Docker restart failed:', restartError.message);
      return NextResponse.json({ 
        success: true,
        message: 'Latest image pulled successfully, but failed to auto-restart the container. Please restart the container manually in Unraid.' 
      });
    }
  } catch (error: any) {
    console.error('Update API error:', error);
    return NextResponse.json({ error: 'System update failed: ' + error.message }, { status: 500 });
  }
}

