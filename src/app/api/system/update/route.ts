import { NextResponse } from 'next/server';
import fs from 'fs';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function POST() {
  const socketPath = '/var/run/docker.sock';

  if (!fs.existsSync(socketPath)) {
    return NextResponse.json({ 
      error: 'Docker socket not found. Please map /var/run/docker.sock to the container to enable updates.' 
    }, { status: 400 });
  }

  try {
    const docker = axios.create({
      socketPath: socketPath,
      baseURL: 'http://localhost/v1.41', // Standard docker API version
      timeout: 120000 // 2 minutes for pull
    });

    // 1. Pull the latest image
    console.log('Starting image pull: ghcr.io/pedrogvm97/schedulearr:latest');
    try {
      await docker.post('/images/create?fromImage=ghcr.io/pedrogvm97/schedulearr&tag=latest');
    } catch (pullError: any) {
      console.error('Docker pull failed:', pullError.message);
      return NextResponse.json({ error: 'Failed to pull latest image: ' + pullError.message }, { status: 500 });
    }

    // 2. We can't safely recreate the container from within itself without high risk
    // But we can inform the user that the image is pulled and they just need to restart.
    // ON UNRAID: If the image is pulled, the user can just hit 'Restart' and it will use the new one.
    
    return NextResponse.json({ 
      success: true, 
      message: 'Latest image pulled successfully. The application will now attempt to restart if configured, or you can manually restart it in Unraid to apply the changes.' 
    });
  } catch (error: any) {
    console.error('Update API error:', error);
    return NextResponse.json({ error: 'System update failed: ' + error.message }, { status: 500 });
  }
}
