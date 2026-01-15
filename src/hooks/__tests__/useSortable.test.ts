import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSortable } from '../useSortable';

describe('useSortable', () => {
    const items = [
        { name: 'b', value: 2 },
        { name: 'a', value: 1 },
        { name: 'c', value: 3 },
    ];

    it('should sort items in ascending order by default key if provided', () => {
        const { result } = renderHook(() => useSortable(items, { key: 'name', direction: 'ascending' }));
        expect(result.current.items[0].name).toBe('a');
        expect(result.current.items[1].name).toBe('b');
        expect(result.current.items[2].name).toBe('c');
    });

    it('should sort items in descending order', () => {
        const { result } = renderHook(() => useSortable(items, { key: 'name', direction: 'descending' }));
        expect(result.current.items[0].name).toBe('c');
        expect(result.current.items[1].name).toBe('b');
        expect(result.current.items[2].name).toBe('a');
    });

    it('should change sort order when requestSort is called', () => {
        const { result } = renderHook(() => useSortable(items));

        act(() => {
            result.current.requestSort('name');
        });
        expect(result.current.items[0].name).toBe('a');

        act(() => {
            result.current.requestSort('name');
        });
        expect(result.current.items[0].name).toBe('c');
    });

    it('should sort numeric values correctly', () => {
        const { result } = renderHook(() => useSortable(items, { key: 'value', direction: 'descending' }));
        expect(result.current.items[0].value).toBe(3);
        expect(result.current.items[2].value).toBe(1);
    });
});
