import React from 'react';
import {
    Info,
    Network,
    HardDrive,
    Tag,
    ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import type { Container } from '../types';

interface SummaryViewProps {
    container: Container;
}

const SummaryView: React.FC<SummaryViewProps> = ({ container }) => {
    const sectionStyle: React.CSSProperties = {
        marginBottom: '24px',
    };

    const sectionTitleStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '12px',
    };

    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        background: 'var(--bg-panel)',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
    };

    const infoItemStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '11px',
        color: 'var(--text-muted)',
    };

    const valueStyle: React.CSSProperties = {
        fontSize: '13px',
        color: 'var(--text-primary)',
        wordBreak: 'break-all',
        fontFamily: 'var(--font-mono)',
    };

    const badgeStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--bg-app)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '4px',
        padding: '2px 8px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
        margin: '2px',
    };

    return (
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
            {/* General Information */}
            <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}><Info size={14} /> General</h3>
                <div style={gridStyle}>
                    <div style={infoItemStyle}>
                        <span style={labelStyle}>Image</span>
                        <span style={{ ...valueStyle, fontWeight: 500 }}>{container.Image}</span>
                    </div>
                    <div style={infoItemStyle}>
                        <span style={labelStyle}>State</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: container.State === 'running' ? 'var(--status-running)' : 'var(--status-stopped)',
                            }} />
                            <span style={{ ...valueStyle, textTransform: 'capitalize' }}>{container.State} ({container.Status})</span>
                        </div>
                    </div>
                    <div style={infoItemStyle}>
                        <span style={labelStyle}>Container ID</span>
                        <span style={valueStyle}>{container.Id}</span>
                    </div>
                    <div style={infoItemStyle}>
                        <span style={labelStyle}>Created</span>
                        <span style={valueStyle}>{format(container.Created * 1000, 'PPpp')}</span>
                    </div>
                    <div style={{ ...infoItemStyle, gridColumn: 'span 2' }}>
                        <span style={labelStyle}>Command</span>
                        <span style={{ ...valueStyle, background: 'var(--bg-app)', padding: '8px', borderRadius: '4px' }}>{container.Command}</span>
                    </div>
                </div>
            </div>

            {/* Network */}
            <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}><Network size={14} /> Network</h3>
                <div style={gridStyle}>
                    {Object.entries(container.NetworkSettings.Networks).map(([name, net]) => (
                        <React.Fragment key={name}>
                            <div style={infoItemStyle}>
                                <span style={labelStyle}>Network Name</span>
                                <span style={valueStyle}>{name}</span>
                            </div>
                            <div style={infoItemStyle}>
                                <span style={labelStyle}>IP Address</span>
                                <span style={valueStyle}>{net.IPAddress || '-'}</span>
                            </div>
                        </React.Fragment>
                    ))}
                    <div style={{ ...infoItemStyle, gridColumn: 'span 2' }}>
                        <span style={labelStyle}>Published Ports</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                            {container.Ports.length > 0 ? container.Ports.map((p: any, i: number) => {
                                const isClickable = !!p.PublicPort;
                                const url = `http://localhost:${p.PublicPort}`;

                                return (
                                    <div
                                        key={i}
                                        onClick={() => {
                                            if (isClickable) {
                                                api.openExternal(url);
                                            }
                                        }}
                                        style={{
                                            ...badgeStyle,
                                            cursor: isClickable ? 'pointer' : 'default',
                                            padding: '4px 10px',
                                            transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (isClickable) {
                                                e.currentTarget.style.borderColor = 'var(--status-running)';
                                                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.05)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                            e.currentTarget.style.background = 'var(--bg-app)';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>
                                                {p.PublicPort ? `localhost:${p.PublicPort} ➔ ` : ''}{p.PrivatePort}/{p.Type}
                                            </span>
                                            {isClickable && (
                                                <ExternalLink size={10} style={{ opacity: 0.6 }} />
                                            )}
                                        </div>
                                    </div>
                                );
                            }) : <span style={{ ...valueStyle, color: 'var(--text-muted)' }}>No ports published</span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mounts */}
            <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}><HardDrive size={14} /> Mounts</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {container.Mounts.length > 0 ? container.Mounts.map((mount: any, i: number) => (
                        <div key={i} style={{ ...gridStyle, gridTemplateColumns: '1fr 1fr' }}>
                            <div style={infoItemStyle}>
                                <span style={labelStyle}>Source ({mount.Type})</span>
                                <span style={valueStyle}>{mount.Source}</span>
                            </div>
                            <div style={infoItemStyle}>
                                <span style={labelStyle}>Destination</span>
                                <span style={valueStyle}>{mount.Destination}</span>
                            </div>
                        </div>
                    )) : (
                        <div style={{ ...gridStyle, justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                            No volumes mounted
                        </div>
                    )}
                </div>
            </div>

            {/* Labels */}
            <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}><Tag size={14} /> Labels</h3>
                <div style={{ ...gridStyle, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.entries(container.Labels).length > 0 ? Object.entries(container.Labels).map(([k, v]: [string, any]) => (
                        <div key={k} style={{ ...badgeStyle, maxWidth: '100%', overflow: 'hidden' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k}:</span>
                            <span style={{ marginLeft: '4px', textOverflow: 'ellipsis', overflow: 'hidden' }}>{String(v)}</span>
                        </div>
                    )) : <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No labels defined</span>}
                </div>
            </div>
        </div>
    );
};

export default SummaryView;
