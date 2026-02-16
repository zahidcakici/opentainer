import { useState, useEffect, useCallback } from 'react';
import type { Container, ApiResult } from '../types';
import { api } from '../lib/api';

interface UseContainersReturn {
    containers: Container[];
    loading: boolean;
    error: string | null;
    performAction: (id: string, action: string) => Promise<void>;
}

export function useContainers(): UseContainersReturn {
    const [containers, setContainers] = useState<Container[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchContainers = useCallback(async () => {
        try {
            const result: ApiResult<Container[]> = await api.listContainers();
            if (result.success && result.data) {
                setContainers(result.data);
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
        fetchContainers();
        const interval = setInterval(fetchContainers, 5000);
        return () => clearInterval(interval);
    }, [fetchContainers]);

    const performAction = useCallback(async (id: string, action: string) => {
        const result: ApiResult<void> = await api.containerAction(id, action);
        if (!result.success) {
            console.error('Action failed:', result.error);
        }
        fetchContainers();
    }, [fetchContainers]);

    return { containers, loading, error, performAction };
}
