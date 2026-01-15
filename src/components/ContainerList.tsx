import React, { useState, useMemo } from 'react';
import { useContainers } from '../hooks/useContainers';
import { useBatchContainerStats } from '../hooks/useBatchContainerStats';
import ContainerItem from './ContainerItem';
import ContainerDrawer from './ContainerDrawer';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, ArrowDown, ChevronRight, ChevronDown, Layers, Play, Square, RefreshCw } from 'lucide-react';
import { useSortable } from '../hooks/useSortable';
import type { Container } from '../types';
import SearchInput from './SearchInput';

interface SortIconProps {
    active: boolean;
    direction: 'ascending' | 'descending';
}

const SortIcon: React.FC<SortIconProps> = ({ active, direction }) => {
    if (!active) return <div style={{ width: 12 }} />;
    return direction === 'ascending' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
};

const ContainerList: React.FC = () => {
    const { containers, error, performAction } = useContainers();
    const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState('');

    const filteredContainers = useMemo(() => {
        if (!searchQuery) return containers;
        const query = searchQuery.toLowerCase();
        return containers.filter(c =>
            c.Names[0].toLowerCase().includes(query) ||
            c.Image.toLowerCase().includes(query) ||
            (c.Labels['com.docker.compose.project'] || '').toLowerCase().includes(query)
        );
    }, [containers, searchQuery]);

    const runningContainerIds = useMemo(() =>
        filteredContainers.filter(c => c.State === 'running').map(c => c.Id),
        [filteredContainers]);

    const allStats = useBatchContainerStats(runningContainerIds);

    const toggleGroup = (groupName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
    };

    const runningCount = filteredContainers.filter(c => c.State === 'running').length;

    // Prepare data with ranks for default sorting
    const tableData = useMemo(() => {
        return filteredContainers.map(c => {
            // ... existing rank logic ...
            let statusRank = 100;
            const state = c.State.toLowerCase();
            if (state === 'running') statusRank = 0;
            else if (state === 'restarting') statusRank = 10;
            else if (state === 'paused') statusRank = 20;
            else if (state === 'exited') statusRank = 30;

            const projectName = c.Labels['com.docker.compose.project'];
            const networks = Object.keys(c.NetworkSettings.Networks);
            const customNetwork = networks.find(n => n !== 'bridge' && n !== 'host' && n !== 'none');
            const groupKey = projectName || customNetwork || null;

            return {
                ...c,
                displayState: c.State,
                statusRank,
                cleanName: c.Names[0].replace('/', ''),
                imageName: c.Image,
                projectName: groupKey
            };
        });
    }, [filteredContainers]);

    // ... rest of the logic ...

    // Default sort by statusRank (Running top)
    const { items: sortedContainers, requestSort, sortConfig } = useSortable(tableData, { key: 'statusRank', direction: 'ascending' });

    // Grouping Logic
    const groupedItems = useMemo(() => {
        const groups: Record<string, { type: 'group', name: string, containers: any[], statusRank: number }> = {};
        const standalone: any[] = [];

        sortedContainers.forEach(c => {
            if (c.projectName) {
                if (!groups[c.projectName]) {
                    groups[c.projectName] = { type: 'group', name: c.projectName, containers: [], statusRank: c.statusRank };
                }
                groups[c.projectName].containers.push(c);
                if (c.statusRank < groups[c.projectName].statusRank) {
                    groups[c.projectName].statusRank = c.statusRank;
                }
            } else {
                standalone.push({ type: 'item', container: c, statusRank: c.statusRank });
            }
        });

        const mixed: any[] = [];
        Object.values(groups).forEach(g => {
            if (g.containers.length > 1) {
                mixed.push(g);
            } else {
                mixed.push({ type: 'item', container: g.containers[0], statusRank: g.statusRank });
            }
        });

        standalone.forEach(s => mixed.push(s));
        return mixed.sort((a, b) => a.statusRank - b.statusRank);
    }, [sortedContainers]);

    const GroupActionButton: React.FC<{ icon: any; onClick: () => void; title: string; color?: string }> = ({ icon: Icon, onClick, title, color }) => (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            title={title}
            style={{
                padding: '4px',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.color = color || 'var(--text-primary)';
                e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.background = 'transparent';
            }}
        >
            <Icon size={14} />
        </button>
    );

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
        return (
            <div style={{ padding: '20px', color: 'var(--status-error)' }}>
                Docker Error: {error}
                <br />
                <small style={{ color: 'var(--text-muted)' }}>Is Docker Desktop or OrbStack running?</small>
            </div>
        );
    }

    return (
        <>
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>Containers</h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            {runningCount} running {runningCount === 1 ? 'container' : 'containers'}
                            {searchQuery && ` (filtered from ${containers.length})`}
                        </p>
                    </div>
                    <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search containers..."
                    />
                </div>

                {/* Header */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 2fr 2fr 1.5fr 1fr 120px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    borderBottom: '1px solid var(--border-subtle)',
                    gap: '12px'
                }}>
                    <HeaderCell label="" sortKey="statusRank" />
                    <HeaderCell label="NAME" sortKey="cleanName" />
                    <HeaderCell label="IMAGE" sortKey="imageName" />
                    <HeaderCell label="PORTS" />
                    <HeaderCell label="CPU / MEM" />
                    <span style={{ textAlign: 'right' }}>ACTIONS</span>
                </div>

                {/* List */}
                <div style={{ paddingBottom: '40px' }}>
                    {containers.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No containers found.
                        </div>
                    ) : (
                        <AnimatePresence>
                            {groupedItems.map((item) => {
                                if (item.type === 'group') {
                                    const isExpanded = expandedGroups[item.name];
                                    const runningInGroup = item.containers.filter((c: any) => c.State === 'running').length;

                                    return (
                                        <div key={item.name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            <div
                                                onClick={(e) => toggleGroup(item.name, e)}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '40px 1fr 120px',
                                                    alignItems: 'center',
                                                    padding: '10px 16px',
                                                    cursor: 'pointer',
                                                    background: 'var(--bg-panel)',
                                                    fontSize: '13px',
                                                    fontWeight: 500
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: runningInGroup > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                    <Layers size={14} color={runningInGroup > 0 ? 'var(--status-running)' : 'var(--text-muted)'} />
                                                    <span>{item.name}</span>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                                                        ({item.containers.length} containers, {runningInGroup} running)
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                                    <GroupActionButton
                                                        icon={Play}
                                                        title="Start All"
                                                        color="var(--status-running)"
                                                        onClick={() => item.containers.forEach((c: Container) => performAction(c.Id, 'start'))}
                                                    />
                                                    <GroupActionButton
                                                        icon={Square}
                                                        title="Stop All"
                                                        color="var(--status-warn)"
                                                        onClick={() => item.containers.forEach((c: Container) => performAction(c.Id, 'stop'))}
                                                    />
                                                    <GroupActionButton
                                                        icon={RefreshCw}
                                                        title="Restart All"
                                                        onClick={() => item.containers.forEach((c: Container) => performAction(c.Id, 'restart'))}
                                                    />
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        style={{ overflow: 'hidden', background: 'rgba(0,0,0,0.02)' }}
                                                    >
                                                        {item.containers.map((container: any) => (
                                                            <div
                                                                key={container.Id}
                                                                onClick={() => setSelectedContainer(container)}
                                                                style={{ paddingLeft: '20px' }}
                                                            >
                                                                <ContainerItem
                                                                    container={container}
                                                                    stats={allStats[container.Id]}
                                                                    onAction={performAction}
                                                                />
                                                            </div>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                } else {
                                    return (
                                        <div key={item.container.Id} onClick={() => setSelectedContainer(item.container)}>
                                            <ContainerItem
                                                container={item.container}
                                                stats={allStats[item.container.Id]}
                                                onAction={performAction}
                                            />
                                        </div>
                                    );
                                }
                            })}
                        </AnimatePresence>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {selectedContainer && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedContainer(null)}
                            style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0,0,0,0.5)',
                                zIndex: 90
                            }}
                        />
                        <ContainerDrawer
                            container={selectedContainer}
                            onClose={() => setSelectedContainer(null)}
                        />
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default ContainerList;
