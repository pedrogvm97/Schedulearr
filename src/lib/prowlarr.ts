import axios from 'axios';

export interface ProwlarrIndexer {
    id: number;
    name: string;
    enable: boolean;
    status: number; // 1 represents healthy/ok, usually
    indexerUrls: string[];
}

export interface IndexerHealth {
    allHealthy: boolean;
    downIndexers: string[];
    totalActive: number;
}

export const getIndexerHealth = async (url: string, apiKey: string): Promise<IndexerHealth> => {
    try {
        const response = await axios.get(`${url}/api/v1/indexer`, {
            headers: { 'X-Api-Key': apiKey }
        });

        const indexers: ProwlarrIndexer[] = response.data;

        // Filter to only look at indexers the user has enabled
        const activeIndexers = indexers.filter(i => i.enable);

        // In Prowlarr API logic (similar to Radarr/Sonarr), status !== 1 often implies offline/rate limited/failing
        // We also might want to check the `/api/v1/health` or `/api/v1/indexerstatus` endpoint for more granular "temporarily disabled" states
        // But basic status check is a good start.
        const downIndexers = activeIndexers.filter(i => i.status !== 1).map(i => i.name);

        return {
            allHealthy: downIndexers.length === 0,
            downIndexers,
            totalActive: activeIndexers.length
        };

    } catch (error) {
        console.error(`Error fetching from Prowlarr (${url}):`, error);
        return {
            allHealthy: false,
            downIndexers: ['API Connection Failed'],
            totalActive: 0
        };
    }
};
