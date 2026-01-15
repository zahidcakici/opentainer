import { useState, useMemo } from 'react';

interface SortConfig {
    key: string | null;
    direction: 'ascending' | 'descending';
}

interface UseSortableReturn<T> {
    items: T[];
    requestSort: (key: string) => void;
    sortConfig: SortConfig;
}

export function useSortable<T extends Record<string, any>>(
    items: T[],
    config: SortConfig = { key: null, direction: 'ascending' }
): UseSortableReturn<T> {
    const [sortConfig, setSortConfig] = useState<SortConfig>(config);

    const sortedItems = useMemo(() => {
        const sortableItems = [...items];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key!];
                let bValue = b[sortConfig.key!];

                if (aValue === undefined || aValue === null) aValue = '';
                if (bValue === undefined || bValue === null) bValue = '';

                if (typeof aValue === 'string') {
                    aValue = aValue.toLowerCase();
                    bValue = (bValue as string).toLowerCase();
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [items, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    return { items: sortedItems, requestSort, sortConfig };
}
