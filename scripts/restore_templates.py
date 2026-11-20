#!/usr/bin/env python3
import os
import sys
import xml.etree.ElementTree as ET
import subprocess

TEMPLATE_DIR = "/boot/config/plugins/dockerMan/templates-user"

# Active priority containers if none specified
DEFAULT_ACTIVE = [
    "immich_postgresql",
    "postgresql_immich",
    "immich",
    "homearr",
    "cloudflaredtunnel",
    "adguard-home",
    "binhex-qbittorrentvpn",
    "binhex-radarr",
    "binhex-sonarr",
    "binhex-prowlarr",
    "binhex-plexpass",
    "plex-media-server",
    "binhex-lidarr",
    "tautulli"
]

def main():
    if not os.path.exists(TEMPLATE_DIR):
        print(f"Error: Template directory not found: {TEMPLATE_DIR}")
        sys.exit(1)

    args = [a.lower().strip() for a in sys.argv[1:] if a.strip()]
    restore_all = "--all" in args
    if restore_all:
        args = [a for a in args if a != "--all"]

    xml_files = sorted(os.listdir(TEMPLATE_DIR))
    templates_to_run = []

    for fname in xml_files:
        if not fname.startswith("my-") or not fname.endswith(".xml") or fname.endswith(".bak"):
            continue
        cname = fname[3:-4]
        cname_lower = cname.lower()

        # Skip schedulearr (already running)
        if cname_lower in ["schedulearr", "arr-schedulerr", "scheduler", "arr-scheduler"]:
            continue

        if args:
            # Match against user provided arguments
            if any(arg in cname_lower or cname_lower in arg for arg in args):
                templates_to_run.append((cname, os.path.join(TEMPLATE_DIR, fname)))
        elif restore_all:
            templates_to_run.append((cname, os.path.join(TEMPLATE_DIR, fname)))
        else:
            # Match against default active list
            if any(tgt in cname_lower for tgt in DEFAULT_ACTIVE):
                templates_to_run.append((cname, os.path.join(TEMPLATE_DIR, fname)))

    if not templates_to_run:
        print("No matching templates found to restore.")
        print("Available templates in templates-user:")
        for fname in xml_files:
            if fname.startswith("my-") and fname.endswith(".xml") and not fname.endswith(".bak"):
                print(f"  - {fname[3:-4]}")
        sys.exit(0)

    print(f"\nFound {len(templates_to_run)} containers to restore:")
    for name, _ in templates_to_run:
        print(f"  * {name}")
    print("\nStarting restoration...\n")

    success_count = 0
    fail_count = 0

    for idx, (cname, xml_path) in enumerate(templates_to_run, 1):
        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()
            name = root.findtext("Name") or cname
            repo = root.findtext("Repository")
            if not repo:
                print(f"[{idx}/{len(templates_to_run)}] Skipping {name}: No <Repository> defined in XML.")
                continue

            print(f"--------------------------------------------------")
            print(f"[{idx}/{len(templates_to_run)}] 🚀 Restoring {name} ({repo})...")

            # Remove existing stopped container with same name if any
            subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            cmd = ["docker", "run", "-d", f"--name={name}", "--restart=unless-stopped"]

            # Network mode
            net = root.findtext("Network") or "bridge"
            cmd.append(f"--net={net}")

            # Privileged
            if (root.findtext("Privileged") or "").lower() == "true":
                cmd.append("--privileged=true")

            # Extra Parameters (e.g. --device, --cap-add, etc.)
            extra = root.findtext("ExtraParams")
            if extra:
                for token in extra.split():
                    # Filter out problematic /dev/bus/usb directory device
                    if token.startswith("--device=/dev/bus/usb") or token == "/dev/bus/usb":
                        continue
                    cmd.append(token)

            # Ports
            for port in root.findall(".//Publish/Port"):
                hp = port.findtext("HostPort")
                cp = port.findtext("ContainerPort")
                proto = port.findtext("Protocol") or "tcp"
                if hp and cp:
                    cmd.extend(["-p", f"{hp}:{cp}/{proto}"])

            # Volume Mounts
            for vol in root.findall(".//Data/Volume"):
                host = vol.findtext("HostDir")
                cont = vol.findtext("ContainerDir")
                mode = vol.findtext("Mode") or "rw"
                if host and cont:
                    cmd.extend(["-v", f"{host}:{cont}:{mode}"])

            # Environment Variables
            for env in root.findall(".//Environment/Variable"):
                vname = env.findtext("Name")
                vval = env.findtext("Value") or ""
                if vname:
                    cmd.extend(["-e", f"{vname}={vval}"])

            # Target Image
            cmd.append(repo)

            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if result.returncode == 0:
                print(f"   ✅ Successfully started: {name}")
                success_count += 1
            else:
                print(f"   ⚠️ Docker error for {name}: {result.stderr.strip()}")
                fail_count += 1
        except Exception as e:
            print(f"   ❌ Failed to process template for {cname}: {e}")
            fail_count += 1

    print("\n==================================================")
    print(f"Restoration Complete: {success_count} started, {fail_count} failed.")
    print("Run 'docker ps' to see your active containers.\n")

if __name__ == "__main__":
    main()
