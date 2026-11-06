import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVolumes } from '../useVolumes';
import { api } from '../../lib/api';
import { clearCache } from '../../lib/resourceCache';
import type { Volume } from '../../types';

vi.mock('../../lib/api', () => ({
    api: {
        listVolumes: vi.fn(),
        removeVolume: vi.fn(),
    },
}));

const listVolumes = vi.mocked(api.listVolumes);
const vol = (Name: string) => ({ Name, Driver: 'local' }) as unknown as Volume;

describe('useVolumes', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        clearCache();
    });

    it('orders volumes by name regardless of Docker response order', async () => {
        listVolumes.mockResolvedValue({ success: true, data: [vol('c'), vol('a'), vol('b')] });
        const { result } = renderHook(() => useVolumes());

        await waitFor(() => expect(result.current.volumes).toHaveLength(3));
        expect(result.current.volumes.map(v => v.Name)).toEqual(['a', 'b', 'c']);
    });
});
