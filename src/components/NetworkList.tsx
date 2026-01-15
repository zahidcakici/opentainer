import React from 'react';
import { useNetworks } from '../hooks/useNetworks';
import { Network, ArrowUp, ArrowDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortable } from '../hooks/useSortable';
import SearchInput from './SearchInput';
import { useState, useMemo } from 'react';

interface SortIconProps {
    active: boolean;
    direction: 'ascending' | 'descending';
}

const SortIcon: React.FC<SortIconProps> = ({ active, direction }) => {
    if (!active) return <div style={{ width: 12 }} />;
    return direction === 'ascending' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
};

const NetworkList: React.FC = () => {
    const { networks, error } = useNetworks();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredNetworks = useMemo(() => {
        if (!searchQuery) return networks;
        const query = searchQuery.toLowerCase();
        return networks.filter(net =>
            net.Name.toLowerCase().includes(query) ||
            net.Id.toLowerCase().includes(query) ||
            net.Driver.toLowerCase().includes(query)
        );
    }, [networks, searchQuery]);

    // Prepare data
    const tableData = useMemo(() => {
        return filteredNetworks.map(net => ({
            ...net,
            shortId: net.Id.substring(0, 12),
            createdDate: net.Created ? new Date(net.Created).getTime() : 0
        }));
    }, [filteredNetworks]);

    const { items: sortedNetworks, requestSort, sortConfig } = useSortable(tableData);

    // Header Helper
    const HeaderCell: React.FC<{ label: string; sortKey?: string; style?: React.CSSProperties }> = ({ label, sortKey, style }) => (
        <div
            onClick={() => sortKey && requestSort(sortKey)}
            style={{
                cursor: sortKey ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                userSelect: 'none',
                ...style
            }}
        >
            {label}
            {sortKey && <SortIcon active={sortConfig.key === sortKey} direction={sortConfig.direction} />}
        </div>
    );

    if (error) {
        return <div style={{ padding: '20px', color: 'var(--status-error)' }}>Error: {error}</div>;
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>Networks</h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {filteredNetworks.length} {filteredNetworks.length === 1 ? 'network' : 'networks'}
                        {searchQuery && ` (filtered from ${networks.length})`}
                    </p>
                </div>
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search networks..."
                />
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1fr 1fr',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border-subtle)',
                gap: '12px'
            }}>
                <HeaderCell label="NAME" sortKey="Name" />
                <HeaderCell label="ID" sortKey="shortId" />
                <HeaderCell label="DRIVER" sortKey="Driver" />
                <HeaderCell label="CREATED" sortKey="createdDate" />
            </div>

            <div>
                <AnimatePresence>
                    {sortedNetworks.map(net => {
                        const created = net.Created ? formatDistanceToNow(new Date(net.Created), { addSuffix: true }) : '-';

                        return (
                            <motion.div
                                key={net.Id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1.5fr 1fr 1fr',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    borderBottom: '1px solid var(--bg-hover)',
                                    fontSize: '13px',
                                    color: 'var(--text-primary)',
                                    gap: '12px'
                                }}
                                whileHover={{ backgroundColor: 'var(--bg-panel)' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Network size={16} color="var(--text-muted)" />
                                    <span style={{ fontWeight: 500 }}>{net.Name}</span>
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{net.shortId}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{net.Driver}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{created}</span>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                {networks.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No networks found.
                    </div>
                )}
            </div>
        </div>
    );
};

export default NetworkList;
