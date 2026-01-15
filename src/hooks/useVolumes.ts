import { useState, useEffect, useCallback } from 'react';
import type { Volume } from '../types';
import { api } from '../lib/api';

interface ApiResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

interface UseVolumesReturn {
    volumes: Volume[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    removeVolume: (name: string) => Promise<void>;
}

export function useVolumes(): UseVolumesReturn {
    const [volumes, setVolumes] = useState<Volume[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchVolumes = useCallback(async () => {
        try {
            const result: ApiResult<Volume[]> = await api.listVolumes();
            if (result.success && result.data) {
                setVolumes(result.data);
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
