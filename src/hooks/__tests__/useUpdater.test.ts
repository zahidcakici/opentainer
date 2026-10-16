import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUpdater } from '../useUpdater';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
    api: {
        checkForUpdate: vi.fn(),
        installUpdate: vi.fn(),
    },
}));

const checkForUpdate = vi.mocked(api.checkForUpdate);
const installUpdate = vi.mocked(api.installUpdate);

describe('useUpdater', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('reports an available update', async () => {
        checkForUpdate.mockResolvedValue({
            success: true,
            data: { current_version: '0.1.0', version: '0.2.0', notes: 'Fixes' },
        });
        const { result } = renderHook(() => useUpdater());

        await act(() => result.current.check());

        expect(result.current.status).toBe('available');
        expect(result.current.info?.version).toBe('0.2.0');
    });

    it('reports up to date when there is no update', async () => {
        checkForUpdate.mockResolvedValue({ success: true, data: null });
        const { result } = renderHook(() => useUpdater());

        await act(() => result.current.check());

        expect(result.current.status).toBe('up-to-date');
    });

    it('surfaces errors from a manual check', async () => {
        checkForUpdate.mockResolvedValue({ success: false, error: 'offline' });
        const { result } = renderHook(() => useUpdater());

        await act(() => result.current.check());

        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('offline');
    });

    it('stays idle when a silent check fails or finds nothing', async () => {
        const { result } = renderHook(() => useUpdater());

        checkForUpdate.mockResolvedValue({ success: false, error: 'offline' });
        await act(() => result.current.check({ silent: true }));
        expect(result.current.status).toBe('idle');
        expect(result.current.error).toBeUndefined();

        checkForUpdate.mockResolvedValue({ success: true, data: null });
        await act(() => result.current.check({ silent: true }));
        expect(result.current.status).toBe('idle');
    });

    it('tracks progress and reports a failed install', async () => {
        installUpdate.mockImplementation(async (onProgress) => {
            onProgress({ downloaded: 50, total: 100 });
            return { success: false, error: 'bad signature' };
        });
        const { result } = renderHook(() => useUpdater());

        await act(() => result.current.install());

        expect(result.current.progress).toEqual({ downloaded: 50, total: 100 });
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('bad signature');
    });
});
