import { useState, useEffect, useCallback } from 'react';
import type { Volume, ApiResult } from '../types';
import { api } from '../lib/api';
import { getCached, hasCached, setCached } from '../lib/resourceCache';

const CACHE_KEY = 'volumes';

interface UseVolumesReturn {
    volumes: Volume[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    removeVolume: (name: string) => Promise<void>;
}

export function useVolumes(): UseVolumesReturn {
    const [volumes, setVolumes] = useState<Volume[]>(() => getCached<Volume[]>(CACHE_KEY) ?? []);
    const [loading, setLoading] = useState(() => !hasCached(CACHE_KEY));
    const [error, setError] = useState<string | null>(null);

    const fetchVolumes = useCallback(async () => {
        try {
            const result: ApiResult<Volume[]> = await api.listVolumes();
            if (result.success && result.data) {
                // Docker lists these in no fixed order; sort so rows don't shuffle
                // between fetches (and act as the tiebreak for column sorts).
                const sorted = [...result.data].sort((a, b) => a.Name.localeCompare(b.Name));
                setCached(CACHE_KEY, sorted);
                setVolumes(sorted);
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
        fetchVolumes();
    }, [fetchVolumes]);

    const removeVolume = async (name: string) => {
        const result: ApiResult<void> = await api.removeVolume(name);
        if (result.success) {
            fetchVolumes();
        } else {
            console.error(result.error);
        }
    };

    return { volumes, loading, error, refresh: fetchVolumes, removeVolume };
}
