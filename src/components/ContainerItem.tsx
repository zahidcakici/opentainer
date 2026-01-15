import React, { useState } from 'react';
import { Play, Square, RefreshCw, Trash2, Terminal } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ContainerStats } from '../hooks/useBatchContainerStats';
import type { Container } from '../types';

interface ActionButtonProps {
    icon: any;
    onClick: () => void;
    title: string;
    color?: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({ icon: Icon, onClick, title, color }) => (
    <button
        onClick={(e) => {
            e.stopPropagation();
            onClick();
        }}
        title={title}
        style={{
            padding: '6px',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
            background: 'transparent',
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

interface ContainerItemProps {
    container: Container;
    stats?: ContainerStats;
    onAction: (id: string, action: string) => Promise<void>;
}

const ContainerItem: React.FC<ContainerItemProps> = React.memo(({ container, stats, onAction }) => {
    const isRunning = container.State === 'running';
    const name = container.Names[0].replace('/', '');
    const image = container.Image;
    const shortId = container.Id.substring(0, 12);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const handleAction = async (act: string) => {
        setActionLoading(act);
        await onAction(container.Id, act);
        setActionLoading(null);
    };

    // Format ports
    const ports = container.Ports.map(p =>
        p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : `${p.PrivatePort}`
    ).join(', ');

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
                display: 'grid',
                gridTemplateColumns: '40px 2fr 2fr 1.5fr 1fr 120px',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: '13px',
                color: 'var(--text-primary)',
                gap: '12px',
                cursor: 'pointer'
            }}
            whileHover={{ backgroundColor: 'var(--bg-panel)' }}
        >
            {/* Status Dot */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isRunning ? 'var(--status-running)' : 'var(--status-stopped)',
                    boxShadow: isRunning ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none',
                    opacity: actionLoading ? 0.5 : 1
                }} />
            </div>

            {/* Name & ID */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 500 }}>{name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {shortId}
                </span>
            </div>

            {/* Image */}
            <div style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--text-secondary)'
            }} title={image}>
                {image}
            </div>

            {/* Ports */}
            <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                {ports || '-'}
            </div>

            {/* CPU/Mem */}
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                {isRunning && stats ? `${stats.cpu} / ${stats.mem}` : isRunning ? '...' : '-'}
            </div>

            {/* Actions */}
            <div style={{
                display: 'flex',
                gap: '4px',
                justifyContent: 'flex-end',
                opacity: actionLoading ? 0.5 : 1,
                pointerEvents: actionLoading ? 'none' : 'auto'
            }}>
                {isRunning ? (
                    <>
                        <ActionButton icon={Square} title="Stop" onClick={() => handleAction('stop')} color="var(--status-warn)" />
                        <ActionButton icon={RefreshCw} title="Restart" onClick={() => handleAction('restart')} />
                        <ActionButton icon={Terminal} title="Exec" onClick={() => { }} />
                    </>
                ) : (
                    <>
                        <ActionButton icon={Play} title="Start" onClick={() => handleAction('start')} color="var(--status-running)" />
                        <ActionButton icon={Trash2} title="Remove" onClick={() => handleAction('remove')} color="var(--status-error)" />
                    </>
                )}
            </div>
        </motion.div>
    );
});

export default ContainerItem;
