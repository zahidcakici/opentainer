import { useState, useEffect, useCallback } from 'react';
import type { Network, ApiResult } from '../types';
import { api } from '../lib/api';
import { getCached, hasCached, setCached } from '../lib/resourceCache';

const CACHE_KEY = 'networks';

interface UseNetworksReturn {
    networks: Network[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useNetworks(): UseNetworksReturn {
    const [networks, setNetworks] = useState<Network[]>(() => getCached<Network[]>(CACHE_KEY) ?? []);
    const [loading, setLoading] = useState(() => !hasCached(CACHE_KEY));
    const [error, setError] = useState<string | null>(null);

    const fetchNetworks = useCallback(async () => {
        try {
            const result: ApiResult<Network[]> = await api.listNetworks();
            if (result.success && result.data) {
                // Docker lists these in no fixed order; sort so rows don't shuffle
                // between fetches (and act as the tiebreak for column sorts).
                const sorted = [...result.data].sort((a, b) => a.Name.localeCompare(b.Name));
                setCached(CACHE_KEY, sorted);
                setNetworks(sorted);
            } else {
                setError(result.error || 'Unknown error');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNetworks();
    }, [fetchNetworks]);

    return { networks, loading, error, refresh: fetchNetworks };
}
