import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Activity, Terminal as TerminalIcon, Info } from 'lucide-react';
import LogsView from './LogsView';
import ExecView from './ExecView';
import SummaryView from './SummaryView';
import type { Container } from '../types';

interface TabButtonProps {
    active: boolean;
    label: string;
    icon: any;
    onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ active, label, icon: Icon, onClick }) => (
    <button
        onClick={onClick}
        style={{
            padding: '12px 16px',
            borderBottom: active ? '2px solid var(--status-running)' : '2px solid transparent',
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 500,
            background: 'transparent',
            transition: 'all 0.2s ease',
        }}
    >
        <Icon size={14} />
        {label}
    </button>
);

interface ContainerDrawerProps {
    container: Container | null;
    onClose: () => void;
}

const ContainerDrawer: React.FC<ContainerDrawerProps> = ({ container, onClose }) => {
    const [tab, setTab] = useState<'summary' | 'logs' | 'exec'>('logs');

    if (!container) return null;

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: '600px',
                height: '100vh',
                background: 'var(--bg-panel)',
                borderLeft: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-xl)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            {/* Header */}
            <div style={{
                padding: '16px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                WebkitAppRegion: 'no-drag'
            } as any}>
                <div>
                    <h2 style={{ fontSize: '16px' }}>{container.Names[0].replace('/', '')}</h2>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {container.Id.substring(0, 12)}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        color: 'var(--text-secondary)',
                        padding: '4px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    className="hover-bg"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-subtle)',
                padding: '0 16px',
                background: 'var(--bg-app)'
            }}>
                <TabButton
                    active={tab === 'summary'}
                    onClick={() => setTab('summary')}
                    label="Summary"
                    icon={Info}
                />
                <TabButton
                    active={tab === 'logs'}
                    onClick={() => setTab('logs')}
                    label="Logs"
                    icon={Activity}
                />
                <TabButton
                    active={tab === 'exec'}
                    onClick={() => setTab('exec')}
                    label="Terminal"
                    icon={TerminalIcon}
                />
            </div>

            {/* Content */}
            <div style={{ flex: 1, position: 'relative', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: tab === 'summary' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
                    <SummaryView container={container} />
                </div>
                <div style={{ display: tab === 'logs' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
                    <LogsView containerId={container.Id} active={tab === 'logs'} />
                </div>
                <div style={{ display: tab === 'exec' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
                    <ExecView
                        key={container.Id}
                        containerId={container.Id}
                        active={tab === 'exec'}
                        isRunning={container.State === 'running'}
                    />
                </div>
            </div>
        </motion.div>
    );
};

export default ContainerDrawer;
