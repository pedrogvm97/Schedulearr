import { NextResponse } from 'next/server';
import fs from 'fs';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET() {
  const socketPath = '/var/run/docker.sock';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          // Stream might have been closed by user closing page
          console.error('Error writing to stream:', e);
        }
      };

      if (!fs.existsSync(socketPath)) {
        sendEvent('log', { type: 'error', message: 'Docker socket not found. Please mount /var/run/docker.sock to the container to enable updates.' });
        controller.close();
        return;
      }

      const hostname = process.env.HOSTNAME || 'localhost';
      const docker = axios.create({
        socketPath: socketPath,
        baseURL: 'http://localhost/v1.41',
        timeout: 300000 // 5 minutes for stream pull
      });

      try {
        // Step 1: Identification
        sendEvent('log', { type: 'info', message: `[INFO] Identifying container (ID: ${hostname})...` });
        let containerInfo: any = null;
        try {
          const selfRes = await docker.get(`/containers/${hostname}/json`);
          containerInfo = selfRes.data;
          sendEvent('log', { type: 'info', message: `[OK] Identified container: ${containerInfo.Name} (${containerInfo.Config.Image})` });
        } catch (err: any) {
          sendEvent('log', { type: 'warn', message: `[WARN] Could not identify container metadata via API: ${err.message}. Proceeding with default pull...` });
        }

        // Step 2: Pull image
        const imageName = containerInfo?.Config?.Image || 'ghcr.io/pedrogvm97/schedulearr:latest';
        sendEvent('log', { type: 'info', message: `[INFO] Pulling latest image: ${imageName}...` });

        // Parse image name and tag
        let fromImage = imageName;
        let tag = 'latest';
        if (imageName.includes(':')) {
          const parts = imageName.split(':');
          tag = parts.pop() || 'latest';
          fromImage = parts.join(':');
        }

        const pullRes = await docker.post(
          `/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`,
          null,
          { responseType: 'stream' }
        );

        const pullStream = pullRes.data;

        await new Promise<void>((resolve, reject) => {
          let buffer = '';
          
          pullStream.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line
            
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.error) {
                  reject(new Error(parsed.error));
                  return;
                }
                
                let msg = parsed.status || '';
                if (parsed.id) {
                  msg = `[${parsed.id}] ${msg}`;
                }
                if (parsed.progress) {
                  msg += ` - ${parsed.progress}`;
                }
                
                sendEvent('log', { type: 'pull', message: msg });
              } catch (e) {
                // Not standard JSON or parse failed
              }
            }
          });

          pullStream.on('end', () => {
            resolve();
          });

          pullStream.on('error', (err: any) => {
            reject(err);
          });
        });

        sendEvent('log', { type: 'success', message: '[OK] Latest image pulled successfully!' });

        // Step 3: Restart container
        sendEvent('log', { type: 'info', message: '[INFO] Sending restart signal to container...' });
        
        // We delay the actual restart call slightly so the user sees the success message in the log
        setTimeout(async () => {
          try {
            await docker.post(`/containers/${hostname}/restart`);
            sendEvent('log', { type: 'success', message: '[OK] Restart command acknowledged. The container is restarting now...' });
            sendEvent('complete', { success: true });
          } catch (restartErr: any) {
            sendEvent('log', { 
              type: 'error', 
              message: `[ERROR] Failed to automatically restart: ${restartErr.message}. You must manually restart the container in Unraid to apply the changes.` 
            });
            sendEvent('complete', { success: false, manualRequired: true });
          } finally {
            try {
              controller.close();
            } catch (e) {}
          }
        }, 1500);

      } catch (error: any) {
        console.error('Update stream failed:', error);
        sendEvent('log', { type: 'error', message: `[ERROR] Update failed: ${error.message}` });
        sendEvent('complete', { success: false, error: error.message });
        try {
          controller.close();
        } catch (e) {}
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
