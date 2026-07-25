# Quality Assurance & Due Diligence Rule (Mandatory Across All Sessions)

Before proposing, writing, or executing ANY code changes, version bumps, or releases in this repository, you MUST inspect and strictly enforce all items in the **Quality Assurance Checklist**:

---

## Mandatory Release & Pre-Execution Verification Checklist

1. **Dual Version Checking (Releases & Tags)**:
   - `/api/system/version` MUST check both `/releases/latest` AND `/tags` from GitHub.
   - Pushed git tags (`vX.Y.Z`) MUST be flagged as `--latest` on GitHub Releases (`gh release edit vX.Y.Z --latest`) so the release API never reports an older version.

2. **Synchronized Version Bumping**:
   - `package.json` MUST be incremented *before* tagging or building. Never leave multiple commits under the same version number.

3. **In-App Auto-Updater Engine**:
   - Updates MUST use `recreateSelfContainer` via `/var/run/docker.sock` to inspect ports (`3010:3010`), volume mounts (`/app/data`), and env vars, rename the old container, create a new container instance from the newly pulled image layer, and delete the old container.
   - Standard `docker restart` is strictly forbidden for updates.

4. **Dockerfile Asset Ingestion**:
   - Production Dockerfile runner stage MUST explicitly copy `package.json` into working directory candidate locations (`COPY --from=builder /app/package.json ./package.json`).
   - All `mkdir` commands in Dockerfile MUST use `-p` flags (`RUN mkdir -p /app/data`).

5. **Defensive React UI Safety**:
   - All dynamic API data arrays and properties (e.g. `diskInfo?.byInstance`, `inst?.folders`, `candidates`) MUST use safe optional chaining and fallback arrays (`Array.isArray(...) ? ... : []`) to guarantee zero client-side React crashes.

6. **Feature Isolation**:
   - **Torrent Cleaner** (`/downloads`: stalled/oversized downloading torrents) and **Storage Guard** (`/settings`: media filling protection for Radarr/Sonarr) MUST remain 100% separate in UI labels, settings, and navigation.

7. **Shared Volume Deduplication**:
   - Disk space API (`/api/system/disk`) and Storage Guard MUST deduplicate root folders by volume signatures (`${totalMB}_${freeMB}`) so shared Unraid NAS array storage is counted exactly once.

8. **Build Completion Verification**:
   - MUST verify GitHub Actions job completion (`gh run view`) and confirm image push to GHCR is 100% finished before telling the user to click **Update App**, preventing race conditions.
