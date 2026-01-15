import React, { useState, useMemo, useCallback } from 'react';
import { useImages } from '../hooks/useImages';
import { useContainers } from '../hooks/useContainers';
import { Trash2, Download, PackageOpen, ArrowUp, ArrowDown, CheckCircle2 } from 'lucide-react';
import byteSize from 'byte-size';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortable } from '../hooks/useSortable';
import SearchInput from './SearchInput';

import { api } from '../lib/api';

interface SortIconProps {
    active: boolean;
    direction: 'ascending' | 'descending';
}

const SortIcon: React.FC<SortIconProps> = ({ active, direction }) => {
    if (!active) return <div style={{ width: 12 }} />;
    return direction === 'ascending' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
};

interface ImageItemProps {
    img: any;
    onRemove: (id: string) => void;
    inUse: boolean;
}

const ImageItem: React.FC<ImageItemProps> = React.memo(({ img, onRemove, inUse }) => {
    const size = byteSize(img.rawSize);
    const created = formatDistanceToNow(new Date(img.createdDate), { addSuffix: true });

    return (
        <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
                display: 'grid',
                gridTemplateColumns: '3fr 1.5fr 1fr 1fr 80px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <PackageOpen size={16} color={inUse ? 'var(--status-running)' : 'var(--text-muted)'} />
                <span title={img.tag} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: inUse ? 500 : 400 }}>
                    {img.tag}
                </span>
                {inUse && (
                    <span style={{
                        fontSize: '10px',
                        color: 'var(--status-running)',
                        background: 'rgba(34, 197, 94, 0.1)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 600
                    }}>
                        <CheckCircle2 size={10} />
                        In Use
                    </span>
                )}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{img.shortId}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{created}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{size.value} {size.unit}</span>
            <div style={{ textAlign: 'right' }}>
                <button
                    onClick={() => !inUse && onRemove(img.Id)}
                    title={inUse ? "Cannot remove image in use" : "Remove Image"}
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

const ImageList: React.FC = () => {
    const { images, error, removeImage, refresh } = useImages();
    const { containers } = useContainers();
    const [pulling, setPulling] = useState(false);
    const [pullName, setPullName] = useState('');
    const [pullLogs, setPullLogs] = useState<any[]>([]);
    const [showPullModal, setShowPullModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const cancelPullRef = React.useRef<(() => void) | null>(null);

    const filteredImages = useMemo(() => {
        if (!searchQuery) return images;
        const query = searchQuery.toLowerCase();
        return images.filter(img =>
            (img.RepoTags?.[0] || '<none>').toLowerCase().includes(query) ||
            img.Id.toLowerCase().includes(query)
        );
    }, [images, searchQuery]);

    const tableData = useMemo(() => {
        return filteredImages.map(img => {
            const tag = img.RepoTags?.[0] || '<none>';
            const inUse = containers.some(c => c.ImageID === img.Id || c.Image === tag);
            return {
                ...img,
                tag,
                shortId: img.Id.split(':')[1].substring(0, 12),
                rawSize: img.Size,
                createdDate: img.Created * 1000,
                inUse,
                usageRank: inUse ? 0 : 1
            };
        });
    }, [filteredImages, containers]);

    const { items: sortedImages, requestSort, sortConfig } = useSortable(tableData, { key: 'usageRank', direction: 'ascending' });

    const handlePull = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (!pullName) return;

        setPulling(true);
        setPullLogs([]);

        const cancel = api.pullImage(
            pullName,
            (progress) => {
                setPullLogs(prev => [...prev.slice(-4), progress]);
            },
            () => {
                setPulling(false);
                setShowPullModal(false);
                setPullName('');
                cancelPullRef.current = null;
                refresh();
            },
            (err) => {
                setPullLogs(prev => [...prev, { status: `Error: ${err}` }]);
                setPulling(false);
                cancelPullRef.current = null;
            }
        );
        cancelPullRef.current = cancel;
    }, [pullName, refresh]);

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '4px' }}>
                        <h1 style={{ fontSize: '24px' }}>Images</h1>
                        <button
                            onClick={() => setShowPullModal(true)}
                            style={{
                                background: 'var(--bg-panel)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                padding: '4px 12px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                            className="hover-bg"
                        >
                            <Download size={14} /> Pull Image
                        </button>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {filteredImages.length} {filteredImages.length === 1 ? 'image' : 'images'}
                        {searchQuery && ` (filtered from ${images.length})`}
                    </p>
                </div>
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search images..."
                />
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '3fr 1.5fr 1fr 1fr 80px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border-subtle)',
                gap: '12px'
            }}>
                <HeaderCell label="TAG" sortKey="tag" />
                <HeaderCell label="ID" sortKey="shortId" />
                <HeaderCell label="CREATED" sortKey="createdDate" />
                <HeaderCell label="SIZE" sortKey="rawSize" />
                <span style={{ textAlign: 'right' }}>ACTIONS</span>
            </div>

            <div>
                {images.length === 0 && !pulling && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No images found.
                    </div>
                )}
                {sortedImages.map(img => (
                    <ImageItem
                        key={img.Id}
                        img={img}
                        onRemove={removeImage}
                        inUse={img.inUse}
                    />
                ))}
            </div>

            <AnimatePresence>
                {showPullModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => !pulling && setShowPullModal(false)}
                        style={{
                            position: 'fixed',
                            top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.6)',
                            zIndex: 100,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: 'var(--bg-panel)',
                                padding: '24px',
                                borderRadius: '12px',
                                width: '400px',
                                border: '1px solid var(--border-subtle)',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                            }}
                        >
                            <h3 style={{ marginBottom: '16px' }}>Pull Image</h3>
                            <form onSubmit={handlePull}>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="e.g. alpine:latest"
                                    value={pullName}
                                    onChange={e => setPullName(e.target.value)}
                                    disabled={pulling}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '6px',
                                        background: 'var(--bg-app)',
                                        border: '1px solid var(--border-subtle)',
                                        color: 'var(--text-primary)',
                                        marginBottom: '16px',
                                        outline: 'none'
                                    }}
                                />

                                {pulling && (
                                    <div style={{ marginBottom: '16px', maxHeight: '100px', overflow: 'auto', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                        {pullLogs.map((log, i) => (
                                            <div key={i}>{log.status} {log.progress}</div>
                                        ))}
                                        <div>Pulling...</div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (cancelPullRef.current) {
                                                cancelPullRef.current();
                                                cancelPullRef.current = null;
                                            }
                                            setPulling(false);
                                            setShowPullModal(false);
                                        }}
                                        style={{ padding: '8px 16px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={pulling}
                                        style={{
                                            padding: '8px 16px',
                                            background: 'var(--text-primary)',
                                            color: 'var(--bg-app)',
                                            borderRadius: '6px',
                                            fontWeight: 500,
                                            opacity: pulling ? 0.7 : 1
                                        }}
                                    >
                                        {pulling ? 'Pulling...' : 'Pull'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ImageList;
