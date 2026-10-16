import { useState, useCallback } from 'react';
import { api, UpdateInfo, UpdateProgress } from '../lib/api';

export type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'up-to-date'
    | 'available'
    | 'installing'
    | 'error';

export interface Updater {
    status: UpdateStatus;
    info: UpdateInfo | null;
    progress: UpdateProgress | null;
    error?: string;
    /** Check for a newer version. A silent check never surfaces errors. */
    check: (options?: { silent?: boolean }) => Promise<void>;
    /** Download + install the available update, then relaunch. */
    install: () => Promise<void>;
}

export const useUpdater = (): Updater => {
    const [status, setStatus] = useState<UpdateStatus>('idle');
    const [info, setInfo] = useState<UpdateInfo | null>(null);
    const [progress, setProgress] = useState<UpdateProgress | null>(null);
    const [error, setError] = useState<string | undefined>();

    const check = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        if (!silent) setStatus('checking');
        setError(undefined);
        try {
            const res = await api.checkForUpdate();
            if (!res.success) throw new Error(res.error || 'Update check failed');
            setInfo(res.data ?? null);
            if (res.data) setStatus('available');
            else if (!silent) setStatus('up-to-date');
        } catch (e: any) {
            // Background checks fail quietly (offline, no release yet, …).
            if (!silent) {
                setStatus('error');
                setError(e?.message ?? String(e));
            }
        }
    }, []);

    const install = useCallback(async () => {
        setStatus('installing');
        setProgress(null);
        setError(undefined);
        try {
            // Resolves only on failure — success relaunches the app.
            const res = await api.installUpdate(setProgress);
            if (!res.success) throw new Error(res.error || 'Update failed');
        } catch (e: any) {
            setStatus('error');
            setError(e?.message ?? String(e));
        }
    }, []);

    return { status, info, progress, error, check, install };
};
