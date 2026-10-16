import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { Moon, Sun, Monitor, Container, Box, Download, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, AppSettings } from '../lib/api';
import { Updater } from '../hooks/useUpdater';

interface SettingsProps {
    onReconfigureEngine?: () => void;
    updater: Updater;
}

const formatMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const Settings = ({ onReconfigureEngine, updater }: SettingsProps) => {
    const { theme, setTheme } = useTheme();
    const [version, setVersion] = useState<string>('');
    const [settings, setSettings] = useState<AppSettings | null>(null);

    useEffect(() => {
        api.getAppVersion().then(setVersion).catch(() => setVersion('unknown'));
        api.getSettings().then((res) => {
            if (res.success && res.data) setSettings(res.data);
        }).catch(() => { });
    }, []);

    const themes: { id: 'light' | 'dark' | 'system'; label: string; icon: any }[] = [
        { id: 'light', label: 'Light', icon: Sun },
        { id: 'dark', label: 'Dark', icon: Moon },
        { id: 'system', label: 'System', icon: Monitor },
    ];

    const sectionHeading: React.CSSProperties = {
        fontSize: '16px', marginBottom: '12px',
        borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px',
    };
    const panel: React.CSSProperties = {
        padding: '16px', background: 'var(--bg-panel)', borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
    };
    const secondaryButton: React.CSSProperties = {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '8px 14px', fontSize: '13px', fontWeight: 500,
        borderRadius: '6px', border: '1px solid var(--border-subtle)',
        background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer',
        whiteSpace: 'nowrap',
    };
    const primaryButton: React.CSSProperties = {
        ...secondaryButton,
        border: '1px solid var(--text-primary)',
        background: 'var(--text-primary)', color: 'var(--bg-app)',
    };

    const toggleAutoCheck = async (enabled: boolean) => {
        if (!settings) return;
        const next = { ...settings, auto_check_updates: enabled };
        setSettings(next);
        const res = await api.updateSettings(next);
        if (!res.success) setSettings(settings);
    };

    const { status, info, progress, error: updateError } = updater;
    const busy = status === 'checking' || status === 'installing';
    const percent = progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ padding: '20px', maxWidth: '600px', margin: '0' }}
        >
            <h1 style={{ marginBottom: '20px', fontSize: '24px' }}>Settings</h1>

            {/* Appearance Section */}
            <div style={{ marginBottom: '40px' }}>
                <h2 style={sectionHeading}>Appearance</h2>
                <div style={{ ...panel, display: 'flex', gap: '12px' }}>
                    {themes.map((t) => {
                        const Icon = t.icon;
                        const active = theme === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTheme(t.id)}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    border: '1px solid',
                                    borderColor: active ? 'var(--text-primary)' : 'var(--border-subtle)',
                                    background: active ? 'var(--bg-hover)' : 'transparent',
                                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                <Icon size={20} />
                                <span style={{ fontSize: '12px', fontWeight: 500 }}>{t.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Engine Section */}
            <div style={{ marginBottom: '40px' }}>
                <h2 style={sectionHeading}>Engine</h2>
                <div style={panel}>
                    {settings ? (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {settings.engine === 'colima'
                                        ? <Container size={20} color="var(--status-running)" />
                                        : <Box size={20} color="var(--text-secondary)" />}
                                    <div>
                                        <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                                            {settings.engine === 'colima' ? 'Colima (managed)' : 'External engine'}
                                        </div>
                                        {settings.engine === 'colima' && (
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                                                {settings.colima.cpu} CPU · {settings.colima.memory} GB RAM · {settings.colima.disk} GB disk
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {onReconfigureEngine && (
                                    <button
                                        onClick={onReconfigureEngine}
                                        style={{
                                            padding: '8px 14px', fontSize: '13px', fontWeight: 500,
                                            borderRadius: '6px', border: '1px solid var(--border-subtle)',
                                            background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        Reconfigure
                                    </button>
                                )}
                            </div>
                            {settings.engine === 'colima' && (
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', marginBottom: 0 }}>
                                    Resource changes apply the next time Docker starts.
                                </p>
                            )}
                        </>
                    ) : (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Loading…</p>
                    )}
                </div>
            </div>

            {/* Updates Section */}
            <div style={{ marginBottom: '40px' }}>
                <h2 style={sectionHeading}>Updates</h2>
                <div style={panel}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            {status === 'available' || status === 'installing'
                                ? <Download size={20} color="var(--status-running)" />
                                : status === 'error'
                                    ? <AlertCircle size={20} color="var(--status-error)" />
                                    : status === 'up-to-date'
                                        ? <CheckCircle2 size={20} color="var(--status-running)" />
                                        : <RefreshCw size={20} color="var(--text-secondary)" />}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {status === 'checking' && 'Checking for updates…'}
                                    {status === 'up-to-date' && 'Opentainer is up to date'}
                                    {status === 'available' && `Version ${info?.version} is available`}
                                    {status === 'installing' && (percent === null ? 'Downloading update…' : `Downloading update… ${percent}%`)}
                                    {status === 'error' && 'Update failed'}
                                    {status === 'idle' && 'Check for a newer version'}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
                                    {status === 'error'
                                        ? updateError
                                        : status === 'installing' && progress
                                            ? `${formatMB(progress.downloaded)}${progress.total ? ` / ${formatMB(progress.total)}` : ''}`
                                            : `Current version ${version || '…'}`}
                                </div>
                            </div>
                        </div>
                        {status === 'available' ? (
                            <button style={primaryButton} onClick={() => updater.install()}>
                                <Download size={14} /> Install &amp; Restart
                            </button>
                        ) : (
                            <button
                                style={{ ...secondaryButton, opacity: busy ? 0.5 : 1, cursor: busy ? 'default' : 'pointer' }}
                                disabled={busy}
                                onClick={() => updater.check()}
                            >
                                <RefreshCw size={14} /> {status === 'error' ? 'Try again' : 'Check for updates'}
                            </button>
                        )}
                    </div>

                    {status === 'installing' && (
                        <div style={{ marginTop: '12px', height: '4px', borderRadius: '2px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', width: `${percent ?? 100}%`, background: 'var(--status-running)',
                                opacity: percent === null ? 0.5 : 1, transition: 'width 0.2s ease',
                            }} />
                        </div>
                    )}

                    {status === 'available' && info?.notes && (
                        <pre style={{
                            marginTop: '12px', marginBottom: 0, padding: '10px 12px', maxHeight: '160px', overflow: 'auto',
                            fontSize: '12px', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)',
                            background: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border-subtle)',
                            fontFamily: 'inherit',
                        }}>
                            {info.notes}
                        </pre>
                    )}

                    {settings && (
                        <label style={{
                            display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', paddingTop: '12px',
                            borderTop: '1px solid var(--border-subtle)', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer',
                        }}>
                            <input
                                type="checkbox"
                                checked={settings.auto_check_updates}
                                onChange={(e) => toggleAutoCheck(e.target.checked)}
                            />
                            Automatically check for updates on launch
                        </label>
                    )}
                </div>
            </div>

            {/* About Section */}
            <div style={{ marginBottom: '40px' }}>
                <h2 style={sectionHeading}>About</h2>
                <div style={panel}>
                    <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Opentainer</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5' }}>
                        A minimal, dark-mode first container manager for macOS.
                        Built with Tauri, React, and Vite.
                    </p>

                    <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <p>Version {version || '…'}</p>
                        <p style={{ marginTop: '4px' }}>License: MIT</p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default Settings;
