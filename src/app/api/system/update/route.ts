import { NextResponse } from "next/server";
import fs from "fs";
import axios from "axios";
import os from "os";
import { findSelfContainer } from "@/lib/docker";

export const dynamic = "force-dynamic";

export async function POST() {
  const socketPath = "/var/run/docker.sock";

  if (!fs.existsSync(socketPath)) {
    return NextResponse.json({
      error: "Docker socket not found. Please map /var/run/docker.sock to the container to enable updates."
    }, { status: 400 });
  }

  const hostname = os.hostname() || "localhost";

  try {
    const docker = axios.create({ socketPath, baseURL: "http://localhost/v1.41", timeout: 180000 });

    let imageName = "ghcr.io/pedrogvm97/schedulearr:latest";
    let containerId = hostname;
    try {
      const containerInfo = await findSelfContainer(docker, hostname);
      if (containerInfo) {
        imageName = containerInfo.Config?.Image || imageName;
        containerId = containerInfo.Id || hostname;
      }
    } catch (e) {
      console.warn("Could not read container config, using defaults");
    }

    let fromImage = imageName;
    let tag = "latest";
    if (imageName.includes(":")) {
      const parts = imageName.split(":");
      tag = parts.pop() || "latest";
      fromImage = parts.join(":");
    }

    try {
      await docker.post(`/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`);
    } catch (pullError: any) {
      return NextResponse.json({ error: "Failed to pull latest image: " + pullError.message }, { status: 500 });
    }

    // Restart — not recreate. The server dies when the container stops;
    // Docker restart policy (unless-stopped) brings it back on the new image.
    setTimeout(async () => {
      try {
        await docker.post(`/containers/${containerId}/restart?t=5`);
      } catch (e: any) {
        console.log("[Updater] Restart in flight (connection drop expected):", e.message);
      }
    }, 500);

    return NextResponse.json({
      success: true,
      message: "Image pulled. Container is restarting — it will come back automatically on the new version."
    });

  } catch (error: any) {
    return NextResponse.json({ error: "System update failed: " + error.message }, { status: 500 });
  }
}
