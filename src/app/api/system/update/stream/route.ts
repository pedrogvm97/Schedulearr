import { NextResponse } from 'next/server';
import fs from 'fs';
import axios from 'axios';
import os from 'os';
import { findSelfContainer } from '@/lib/docker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tagParam = searchParams.get('tag');

  const socketPath = '/var/run/docker.sock';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          console.error('Error writing to stream:', e);
        }
      };

      if (!fs.existsSync(socketPath)) {
        sendEvent('log', { type: 'error', message: 'Docker socket not found. Please mount /var/run/docker.sock to the container to enable updates.' });
        controller.close();
        return;
      }

      const hostname = os.hostname() || 'localhost';
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
          containerInfo = await findSelfContainer(docker, hostname);
          if (containerInfo) {
            sendEvent('log', { type: 'info', message: `[OK] Identified container: ${containerInfo.Name} (${containerInfo.Config?.Image || 'unknown image'})` });
          } else {
            sendEvent('log', { type: 'warn', message: `[WARN] Could not identify container metadata via API. Proceeding with defaults...` });
          }
        } catch (err: any) {
          sendEvent('log', { type: 'warn', message: `[WARN] Error identifying container: ${err.message}. Proceeding with defaults...` });
        }

        // Step 2: Pull image
        let fromImage = containerInfo?.Config?.Image || 'ghcr.io/pedrogvm97/schedulearr:latest';
        let tag = 'latest';

        if (tagParam) {
          tag = tagParam.replace(/^v/, '');
          if (fromImage.includes(':')) {
            const parts = fromImage.split(':');
            parts.pop();
            fromImage = parts.join(':');
          }
        } else {
          if (fromImage.includes(':')) {
            const parts = fromImage.split(':');
            tag = parts.pop() || 'latest';
            fromImage = parts.join(':');
          }
        }

        const finalImage = `${fromImage}:${tag}`;
        sendEvent('log', { type: 'info', message: `[INFO] Pulling latest image: ${finalImage}...` });

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

        // Step 3: Recreate or restart container
        if (containerInfo) {
          sendEvent('log', { type: 'info', message: `[INFO] Recreating container "${containerInfo.Name.replace(/^\//, '')}" with the new image layer (${finalImage})...` });
          
          setTimeout(async () => {
            try {
              const oldName = containerInfo.Name.replace(/^\//, '');
              const oldId = containerInfo.Id;
              const oldNameTmp = `${oldName}_old`;
              
              sendEvent('log', { type: 'info', message: `[INFO] Stopping current container...` });
              await docker.post(`/containers/${oldId}/stop?t=10`);
              
              sendEvent('log', { type: 'info', message: `[INFO] Renaming container to ${oldNameTmp}...` });
              await docker.post(`/containers/${oldId}/rename?name=${oldNameTmp}`);
              
              sendEvent('log', { type: 'info', message: `[INFO] Creating container with tag ${tag}...` });
              const createBody = {
                ...containerInfo.Config,
                Image: finalImage,
                HostConfig: containerInfo.HostConfig,
                NetworkingConfig: {
                  EndpointsConfig: containerInfo.NetworkSettings?.Networks || {}
                }
              };
              
              let newId = '';
              try {
                const createRes = await docker.post(`/containers/create?name=${oldName}`, createBody);
                newId = createRes.data.Id;
              } catch (createErr: any) {
                // Rollback rename and restart old
                await docker.post(`/containers/${oldId}/rename?name=${oldName}`);
                await docker.post(`/containers/${oldId}/start`);
                throw new Error(`Failed to create container: ${createErr.message}`);
              }
              
              sendEvent('log', { type: 'info', message: `[INFO] Starting container...` });
              await docker.post(`/containers/${newId}/start`);
              
              sendEvent('log', { type: 'info', message: `[INFO] Removing old container layer...` });
              await docker.delete(`/containers/${oldId}_old?force=true`);
              
              sendEvent('log', { type: 'success', message: `[OK] Switch to version v${tag} complete! Container is online.` });
              sendEvent('complete', { success: true });
            } catch (err: any) {
              sendEvent('log', { type: 'error', message: `[ERROR] Recreate failed: ${err.message}` });
              sendEvent('complete', { success: false, error: err.message });
            } finally {
              try {
                controller.close();
              } catch (e) {}
            }
          }, 1500);
        } else {
          const containerId = hostname;
          sendEvent('log', { type: 'info', message: `[INFO] Sending restart signal to container (ID: ${containerId})...` });
          
          setTimeout(async () => {
            try {
              await docker.post(`/containers/${containerId}/restart`);
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
        }

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
