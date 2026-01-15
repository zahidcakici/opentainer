import React, { useMemo, useState } from 'react';
import { useVolumes } from '../hooks/useVolumes';
import { useContainers } from '../hooks/useContainers';
import { Trash2, HardDrive, ArrowUp, ArrowDown, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import byteSize from 'byte-size';
import { useSortable } from '../hooks/useSortable';
import SearchInput from './SearchInput';

interface SortIconProps {
    active: boolean;
    direction: 'ascending' | 'descending';
}

const SortIcon: React.FC<SortIconProps> = ({ active, direction }) => {
    if (!active) return <div style={{ width: 12 }} />;
    return direction === 'ascending' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
};

interface VolumeItemProps {
    vol: any;
    onRemove: (name: string) => void;
}

const VolumeItem: React.FC<VolumeItemProps> = React.memo(({ vol, onRemove }) => {
    const { inUse, connectedContainers } = vol;
    const created = vol.CreatedAt ? formatDistanceToNow(new Date(vol.CreatedAt), { addSuffix: true }) : '-';
    const size = byteSize(vol.rawSize);

    return (
        <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 80px',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid var(--bg-hover)',
                fontSize: '13px',
                color: 'var(--text-primary)',
                gap: '12px',
                cursor: 'default'
            }}
            whileHover={{ backgroundColor: 'var(--bg-panel)' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <div style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <HardDrive size={16} color={inUse ? 'var(--status-running)' : 'var(--text-muted)'} />
                </div>
                <span title={vol.Name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: inUse ? 500 : 400 }}>
                    {vol.Name}
                </span>
                {inUse && (
                    <span style={{
                        fontSize: '9px',
                        color: 'var(--status-running)',
                        background: 'rgba(34, 197, 94, 0.1)',
                        padding: '1px 5px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontWeight: 600,
                        flexShrink: 0
                    }}>
                        <CheckCircle2 size={10} />
                        In Use
                    </span>
                )}
            </div>

            <div style={{ overflow: 'hidden', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {connectedContainers.length > 0 ? (
                    connectedContainers.map((name: string) => (
                        <span key={name} style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            background: 'var(--bg-app)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                            whiteSpace: 'nowrap'
                        }}>
                            {name}
                        </span>
                    ))
                ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                )}
            </div>

            <span style={{ color: 'var(--text-secondary)' }}>{vol.Driver}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{created}</span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{size.value} {size.unit}</span>

            <div style={{ textAlign: 'right' }}>
                <button
                    onClick={() => !inUse && onRemove(vol.Name)}
                    title={inUse ? "Cannot remove volume in use" : "Remove Volume"}
                    disabled={inUse}
                    style={{
                        color: 'var(--text-muted)',
                        background: 'transparent',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'all 0.2s',
                        opacity: inUse ? 0.3 : 1,
                        cursor: inUse ? 'not-allowed' : 'pointer'
                    }}
                    onMouseEnter={e => {
                        if (inUse) return;
                        e.currentTarget.style.color = 'var(--status-error)';
                        e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={e => {
                        if (inUse) return;
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.background = 'transparent';
                    }}
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </motion.div>
    );
});

const VolumeList: React.FC = () => {
    const { volumes, error, removeVolume } = useVolumes();
    const { containers } = useContainers();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredVolumes = useMemo(() => {
        if (!searchQuery) return volumes;
        const query = searchQuery.toLowerCase();
        return volumes.filter(vol =>
            vol.Name.toLowerCase().includes(query) ||
            vol.Driver.toLowerCase().includes(query)
        );
    }, [volumes, searchQuery]);

    const tableData = useMemo(() => {
        return filteredVolumes.map(vol => {
            const connected = containers.filter(c =>
                c.Mounts?.some((m: any) => m.Name === vol.Name || m.Source === vol.Name)
            );
            const inUse = connected.length > 0;
            return {
                ...vol,
                rawSize: vol.UsageData?.Size || 0,
                createdDate: vol.CreatedAt ? new Date(vol.CreatedAt).getTime() : 0,
                inUse,
                usageRank: inUse ? 0 : 1,
                connectedContainers: connected.map(c => c.Names[0].replace('/', ''))
            };
        });
    }, [filteredVolumes, containers]);

    const { items: sortedVolumes, requestSort, sortConfig } = useSortable(tableData, { key: 'usageRank', direction: 'ascending' });

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
                    <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>Volumes</h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {filteredVolumes.length} {filteredVolumes.length === 1 ? 'volume' : 'volumes'}
                        {searchQuery && ` (filtered from ${volumes.length})`}
                    </p>
                </div>
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search volumes..."
                />
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 80px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border-subtle)',
                gap: '12px'
            }}>
                <HeaderCell label="NAME" sortKey="Name" />
                <HeaderCell label="USED BY" />
                <HeaderCell label="DRIVER" sortKey="Driver" />
                <HeaderCell label="CREATED" sortKey="createdDate" />
                <HeaderCell label="SIZE" sortKey="rawSize" />
                <span style={{ textAlign: 'right' }}>ACTIONS</span>
            </div>

            <div>
                {volumes.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No volumes found.
                    </div>
                )}
                <AnimatePresence>
                    {sortedVolumes.map(vol => (
                        <VolumeItem
                            key={vol.Name}
                            vol={vol}
                            onRemove={removeVolume}
                        />
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default VolumeList;
