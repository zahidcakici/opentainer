import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../context/ThemeContext';
import { Terminal as TerminalIcon, AlertCircle } from 'lucide-react';

import { api } from '../lib/api';

interface ExecViewProps {
    containerId: string;
    active: boolean;
    isRunning: boolean;
}

const ExecView: React.FC<ExecViewProps> = ({ containerId, active, isRunning }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const execSessionRef = useRef<any>(null);

    useEffect(() => {
        if (!containerId || !terminalRef.current || !isRunning) return;

        const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        const term = new Terminal({
            theme: {
                background: isDark ? '#0f0f10' : '#ffffff',
                foreground: isDark ? '#f4f4f5' : '#18181b',
                cursor: isDark ? '#f4f4f5' : '#18181b',
                selectionBackground: isDark ? '#3f3f46' : '#e4e4e7',
                black: isDark ? '#000000' : '#000000',
                red: '#ef4444',
                green: '#22c55e',
                yellow: '#f59e0b',
                blue: '#3b82f6',
                magenta: '#a855f7',
                cyan: '#06b6d4',
                white: isDark ? '#ffffff' : '#e5e7eb',
            },
            fontFamily: '"JetBrains Mono", "Menlo", "Monaco", "Consolas", monospace',
            fontSize: 13,
            lineHeight: 1.2,
            cursorBlink: true,
            scrollback: 1000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Generate a unique session ID
        const sessionId = `${containerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        let currentExecSession: any = null;
        let disposed = false;

        currentExecSession = api.startExec(
            sessionId,
            term.cols,
            term.rows,
            (data: string) => {
                if (!disposed) term.write(data);
            },
            containerId
        );
        execSessionRef.current = currentExecSession;

        term.onData(data => {
            if (currentExecSession && !disposed) currentExecSession.write(data);
        });
        term.onResize(({ cols, rows }) => {
            if (currentExecSession && !disposed) currentExecSession.resize(cols, rows);
        });

        const handleResize = () => {
            fitAddon.fit();
            if (currentExecSession && !disposed) {
                currentExecSession.resize(term.cols, term.rows);
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            disposed = true;
            window.removeEventListener('resize', handleResize);
            if (currentExecSession) currentExecSession.dispose();
            term.dispose();
            xtermRef.current = null;
            execSessionRef.current = null;
        };
    }, [containerId, isRunning]); // Dependencies updated

    // Handle theme updates dynamically
    useEffect(() => {
        if (!xtermRef.current) return;

        const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        xtermRef.current.options.theme = {
            background: isDark ? '#0f0f10' : '#ffffff',
            foreground: isDark ? '#f4f4f5' : '#18181b',
            cursor: isDark ? '#f4f4f5' : '#18181b',
            selectionBackground: isDark ? '#3f3f46' : '#e4e4e7',
            black: isDark ? '#000000' : '#000000',
            red: '#ef4444',
            green: '#22c55e',
            yellow: '#f59e0b',
            blue: '#3b82f6',
            magenta: '#a855f7',
            cyan: '#06b6d4',
            white: isDark ? '#ffffff' : '#e5e7eb',
        };
    }, [theme]);

    useEffect(() => {
        if (active && fitAddonRef.current) {
            const fitAddon = fitAddonRef.current;
            const term = xtermRef.current;
            const exec = execSessionRef.current;

            setTimeout(() => {
                fitAddon.fit();
                if (term && exec) {
                    exec.resize(term.cols, term.rows);
                    term.focus();
                }
            }, 100);
        }
    }, [active]);

    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (!isRunning) {
        return (
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
                textAlign: 'center',
                background: isDark ? '#0f0f10' : '#ffffff',
                color: 'var(--text-secondary)'
            }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '32px',
                    background: isDark ? '#1a1a1c' : '#f4f4f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px'
                }}>
                    <TerminalIcon size={32} color="var(--text-muted)" />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Terminal Unavailable
                </h3>
                <p style={{ fontSize: '14px', maxWidth: '300px', lineHeight: 1.5 }}>
                    This container is currently stopped. Start the container to access the interactive terminal.
                </p>
                <div style={{
                    marginTop: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    padding: '8px 12px',
                    background: isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2',
                    color: '#ef4444',
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                    <AlertCircle size={14} />
                    Container must be running
                </div>
            </div>
        );
    }

    return (
        <div style={{
            flex: 1,
            padding: '24px 12px 24px 24px',
            background: isDark ? '#0f0f10' : '#ffffff',
            overflow: 'hidden',
            height: '100%'
        }}>
            <div
                ref={terminalRef}
                style={{
                    width: '100%',
                    height: '100%'
                }}
            />
        </div>
    );
};

export default ExecView;
