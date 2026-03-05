# Schedulearr

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

Schedulearr is an automated scheduler for the *arr suite (Radarr, Sonarr, Prowlarr).

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for details.

## Overview
Schedulearr acts as a localized bridge for your media automation stack. It prevents API bans from private trackers by managing download quotas and intelligently triggers searches for missing media based on custom schedules.

## Key Features
- **Prowlarr Indexer Quota Management**: Set Max Data (GB) or Max Grabs (Hits) limits per indexer.
- **Auto-Reset Intervals**: Automatically reset quotas and re-enable indexers on Daily, Weekly, or Monthly schedules.
- **Smart Scheduler**: Optimized trigger system for Radarr and Sonarr missing media searches.
- **Standalone & Localized**: Runs as a lightweight Next.js standalone application, perfect for Unraid.

## Unraid Installation
1. Search for **Schedulearr** in Community Applications.
2. Map the `/app/data` container directory to your local appdata (e.g., `/mnt/user/appdata/schedulearr/data`).
3. Set the WebUI port to `3010`.

## Local Development
First, install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3010](http://localhost:3010) in your browser.

## Database
The application uses a SQLite database located at `/app/data/schedulearr.db`.

