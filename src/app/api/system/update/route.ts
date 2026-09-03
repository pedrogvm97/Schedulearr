import { NextResponse } from "next/server";
import fs from "fs";
import axios from "axios";
import os from "os";
import { findSelfContainer, recreateSelfContainer, cleanupOrphanImages } from "@/lib/docker";

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

    let fromImage = "ghcr.io/pedrogvm97/schedulearr";
    let tag = "latest";
    let containerId = hostname;
    let containerInfo: any = null;

    try {
      containerInfo = await findSelfContainer(docker, hostname);
      if (containerInfo) {
        containerId = containerInfo.Id || hostname;
        const currentImg = containerInfo.Config?.Image || "";
        if (currentImg.includes("/")) {
          fromImage = currentImg.split(":")[0];
        }
      }
    } catch (e) {
      console.warn("Could not read container config, using defaults");
    }

    try {
      await docker.post(`/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`);
    } catch (pullError: any) {
      return NextResponse.json({ error: "Failed to pull latest image: " + pullError.message }, { status: 500 });
    }

    // Clean up orphaned / dangling images from previous updates
    try {
      await cleanupOrphanImages(docker);
    } catch (e) {}

    const finalImage = `${fromImage}:${tag}`;

    setTimeout(async () => {
      try {
        if (containerInfo) {
          await recreateSelfContainer(docker, containerInfo, finalImage);
        } else {
          await docker.post(`/containers/${containerId}/restart?t=5`);
        }
      } catch (e: any) {
        console.log("[Updater] Container recreate in flight:", e.message);
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
