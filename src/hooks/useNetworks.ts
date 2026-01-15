import { useState, useEffect, useCallback } from 'react';
import type { Network } from '../types';
import { api } from '../lib/api';

interface ApiResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

interface UseNetworksReturn {
    networks: Network[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useNetworks(): UseNetworksReturn {
    const [networks, setNetworks] = useState<Network[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchNetworks = useCallback(async () => {
        try {
            const result: ApiResult<Network[]> = await api.listNetworks();
            if (result.success && result.data) {
                setNetworks(result.data);
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
