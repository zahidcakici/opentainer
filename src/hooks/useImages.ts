import { useState, useEffect, useCallback } from 'react';
import type { Image } from '../types';
import { api } from '../lib/api';

interface ApiResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

interface UseImagesReturn {
    images: Image[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    removeImage: (id: string) => Promise<void>;
}

export function useImages(): UseImagesReturn {
    const [images, setImages] = useState<Image[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchImages = useCallback(async () => {
        try {
            const result: ApiResult<Image[]> = await api.listImages();
            if (result.success && result.data) {
                setImages(result.data);
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
        fetchImages();
        const interval = setInterval(fetchImages, 30000);
        return () => clearInterval(interval);
    }, [fetchImages]);

    const removeImage = async (id: string) => {
        const result: ApiResult<void> = await api.removeImage(id);
        if (result.success) {
            fetchImages();
        } else {
            throw new Error(result.error);
        }
    };

    return { images, loading, error, refresh: fetchImages, removeImage };
}
