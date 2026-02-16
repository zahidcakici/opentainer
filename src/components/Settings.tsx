import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { Moon, Sun, Monitor } from 'lucide-react';
import { api } from '../lib/api';

const Settings = () => {
    const { theme, setTheme } = useTheme();
    const [version, setVersion] = useState<string>('');

    useEffect(() => {
        api.getAppVersion().then(setVersion).catch(() => setVersion('unknown'));
    }, []);

    const themes: { id: 'light' | 'dark' | 'system'; label: string; icon: any }[] = [
        { id: 'light', label: 'Light', icon: Sun },
        { id: 'dark', label: 'Dark', icon: Moon },
        { id: 'system', label: 'System', icon: Monitor },
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ padding: '20px', maxWidth: '600px', margin: '0' }}
        >
            <h1 style={{ marginBottom: '20px', fontSize: '24px' }}>Settings</h1>

            {/* Appearance Section */}
            <div style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '16px', marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>Appearance</h2>
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '16px',
                    background: 'var(--bg-panel)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)'
                }}>
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

            {/* About Section */}
            <div style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '16px', marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>About</h2>
                <div style={{ padding: '16px', background: 'var(--bg-panel)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
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

            {/* General Section */}
            <div>
                <h2 style={{ fontSize: '16px', marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>General</h2>
                <div style={{ padding: '16px', background: 'var(--bg-panel)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked readOnly style={{ accentColor: 'var(--status-running)' }} />
                        Start at login (Disabled in MVP)
                    </label>
                </div>
            </div>

        </motion.div>
    );
};

export default Settings;
