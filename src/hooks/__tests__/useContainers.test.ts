import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useContainers } from '../useContainers';
import { api } from '../../lib/api';
import { clearCache } from '../../lib/resourceCache';
import type { Container } from '../../types';

vi.mock('../../lib/api', () => ({
    api: {
        listContainers: vi.fn(),
        containerAction: vi.fn(),
    },
}));

const listContainers = vi.mocked(api.listContainers);
const web = { Id: 'abc', Names: ['/web'] } as unknown as Container;

describe('useContainers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        clearCache();
    });

    it('starts empty and loading on first mount', () => {
        listContainers.mockReturnValue(new Promise(() => { }));
        const { result } = renderHook(() => useContainers());

        expect(result.current.containers).toEqual([]);
        expect(result.current.loading).toBe(true);
    });

    it('remounts with the last fetched data instead of starting empty', async () => {
        listContainers.mockResolvedValue({ success: true, data: [web] });
        const first = renderHook(() => useContainers());
        await waitFor(() => expect(first.result.current.containers).toEqual([web]));
        first.unmount();

        // Second visit: the refetch hasn't resolved yet, cached data shows anyway.
        listContainers.mockReturnValue(new Promise(() => { }));
        const { result } = renderHook(() => useContainers());

        expect(result.current.containers).toEqual([web]);
        expect(result.current.loading).toBe(false);
        expect(listContainers).toHaveBeenCalledTimes(2);
    });
});
