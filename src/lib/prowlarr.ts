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
    indexers: ProwlarrIndexer[];
}

export const getIndexerHealth = async (url: string, apiKey: string): Promise<IndexerHealth> => {
    try {
        const response = await axios.get(`${url}/api/v1/indexer`, {
            headers: { 'X-Api-Key': apiKey }
        });

        const indexers: ProwlarrIndexer[] = response.data;

        // Filter to only look at indexers the user has enabled
        const activeIndexers = indexers.filter(i => i.enable);

        // Fetch indexer statuses (provides temporary failure states/disabled states)
        let indexerStatuses: any[] = [];
        try {
            const statusRes = await axios.get(`${url}/api/v1/indexerstatus`, {
                headers: { 'X-Api-Key': apiKey }
            });
            indexerStatuses = statusRes.data;
        } catch (e) {
            console.warn(`Could not fetch indexerstatus for ${url}`);
        }

        // Map disabled/failing status back to the active indexers
        // In Prowlarr, if an indexer is in `indexerStatuses`, it's temporarily disabled due to failures.
        const downIndexersList = indexerStatuses.map(s => s.indexerId);

        const activeIndexersWithStatus = activeIndexers.map(indexer => {
            const isFailing = downIndexersList.includes(indexer.id);
            return {
                ...indexer,
                status: isFailing ? 0 : 1 // 1 is healthy, 0 is failing
            };
        });

        const downIndexers = activeIndexersWithStatus.filter(i => i.status === 0).map(i => i.name);

        return {
            allHealthy: downIndexers.length === 0,
            downIndexers,
            totalActive: activeIndexers.length,
            indexers: activeIndexersWithStatus
        };

    } catch (error) {
        console.error(`Error fetching from Prowlarr (${url}):`, error);
        return {
            allHealthy: false,
            downIndexers: ['API Connection Failed'],
            totalActive: 0,
            indexers: []
        };
    }
};
