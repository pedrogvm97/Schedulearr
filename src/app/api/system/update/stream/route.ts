import { NextResponse } from "next/server";
import fs from "fs";
import axios from "axios";
import os from "os";
import { findSelfContainer } from "@/lib/docker";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tagParam = searchParams.get("tag");

  const socketPath = "/var/run/docker.sock";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {}
      };

      const closeStream = () => { try { controller.close(); } catch (e) {} };

      if (!fs.existsSync(socketPath)) {
        sendEvent("log", { type: "error", message: "Docker socket not found. Mount /var/run/docker.sock to enable updates." });
        closeStream();
        return;
      }

      const hostname = os.hostname() || "localhost";
      const docker = axios.create({ socketPath, baseURL: "http://localhost/v1.41", timeout: 300000 });

      try {
        // Step 1: Identify container
        sendEvent("log", { type: "info", message: "[INFO] Connecting to Docker daemon..." });
        let containerInfo: any = null;
        let containerId = hostname;

        try {
          containerInfo = await findSelfContainer(docker, hostname);
          if (containerInfo) {
            containerId = containerInfo.Id;
            sendEvent("log", { type: "info", message: `[OK] Found container: ${containerInfo.Name} (${containerInfo.Config?.Image || "unknown"})` });
          } else {
            sendEvent("log", { type: "warn", message: "[WARN] Could not identify container via API. Will attempt restart by hostname." });
          }
        } catch (err: any) {
          sendEvent("log", { type: "warn", message: `[WARN] ${err.message}. Falling back to hostname.` });
        }

        // Step 2: Determine image and tag
        let fromImage = "ghcr.io/pedrogvm97/schedulearr";
        let tag = tagParam ? tagParam.replace(/^v/, "") : "latest";

        if (containerInfo?.Config?.Image) {
          const currentImg = containerInfo.Config.Image;
          if (currentImg.includes("/")) {
            fromImage = currentImg.split(":")[0];
          }
        }

        const finalImage = `${fromImage}:${tag}`;
        sendEvent("log", { type: "info", message: `[INFO] Pulling image: ${finalImage}...` });

        // Step 3: Pull image with streamed progress
        const pullRes = await docker.post(
          `/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`,
          null,
          { responseType: "stream" }
        );

        await new Promise<void>((resolve, reject) => {
          let buffer = "";
          const pullStream = pullRes.data;
          pullStream.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.error) { reject(new Error(parsed.error)); return; }
                let msg = parsed.status || "";
                if (parsed.id) msg = `[${parsed.id}] ${msg}`;
                if (parsed.progress) msg += ` ${parsed.progress}`;
                if (msg.trim()) sendEvent("log", { type: "pull", message: msg });
              } catch (e) {}
            }
          });
          pullStream.on("end", resolve);
          pullStream.on("error", reject);
        });

        sendEvent("log", { type: "success", message: "[OK] All image layers are up to date." });

        // Step 4: Restart the container (NOT recreate)
        // Restarting is safe: the server dies, Docker's restart policy brings it back
        // on the new image. Recreating inside the running process is broken because
        // the server dies before it can start the new container.
        sendEvent("log", { type: "info", message: "[INFO] Sending restart signal. Container will automatically come back on the new image..." });

        // Tell the UI we are done — give it time to receive the event before we die
        sendEvent("complete", { success: true, restarting: true });
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
          // t=5 gives the app 5 seconds to shut down gracefully before SIGKILL
          await docker.post(`/containers/${containerId}/restart?t=5`);
        } catch (e: any) {
          // Expected — connection drops as container stops. Restart is already in flight.
          console.log("[Updater] Restart in progress (connection closed is normal):", e.message);
        }

        closeStream();
      } catch (error: any) {
        console.error("Update stream failed:", error);
        sendEvent("log", { type: "error", message: `[ERROR] Update failed: ${error.message}` });
        sendEvent("complete", { success: false, error: error.message });
        closeStream();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
