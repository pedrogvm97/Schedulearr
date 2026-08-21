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

export const testProwlarrIndexer = async (url: string, apiKey: string, indexerId: number): Promise<{ success: boolean; message?: string }> => {
    try {
        // Prowlarr requires the full indexer model object in POST /api/v1/indexer/test
        const getRes = await axios.get(`${url}/api/v1/indexer/${indexerId}`, {
            headers: { 'X-Api-Key': apiKey },
            timeout: 10000
        });

        await axios.post(`${url}/api/v1/indexer/test`, getRes.data, {
            headers: { 'X-Api-Key': apiKey },
            timeout: 20000
        });
        return { success: true, message: 'Indexer tested successfully!' };
    } catch (error: any) {
        const msg = error.response?.data?.[0]?.errorMessage || error.response?.data?.message || error.message || 'Indexer test failed';
        return { success: false, message: msg };
    }
};

export const getProwlarrIndexerStats = async (url: string, apiKey: string): Promise<any[]> => {
    try {
        const response = await axios.get(`${url}/api/v1/indexer/stats`, {
            headers: { 'X-Api-Key': apiKey },
            timeout: 10000
        });
        return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
        console.warn(`Could not fetch indexer stats from ${url}:`, error);
        return [];
    }
};

