import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronUp, ChevronDown, X, Trash2, Clock, Download, ArrowDown } from 'lucide-react';

import { api } from '../lib/api';

interface LogsViewProps {
    containerId: string;
    active: boolean;
}

const LogsView: React.FC<LogsViewProps> = ({ containerId, active }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const stopLogsRef = useRef<(() => void) | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [showTimestamps, setShowTimestamps] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [searchResult, setSearchResult] = useState<{ index: number; count: number } | null>(null);
    const searchListenerRef = useRef<any>(null);

    useEffect(() => {
        if (!containerId || !terminalRef.current) return;

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
            fontWeight: '400',
            lineHeight: 1.2,
            convertEol: true,
            disableStdin: true,
            cursorBlink: false,
            scrollback: 10000,
            allowTransparency: true,
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = searchAddon;

        // Listener for search results
        searchListenerRef.current = searchAddon.onDidChangeResults((results) => {
            if (results) {
                setSearchResult({ index: results.resultIndex, count: results.resultCount });
            } else {
                setSearchResult(null);
            }
        });

        // Pooled Log Streaming
        let buffer = '';
        const flushBuffer = () => {
            if (buffer && xtermRef.current) {
                xtermRef.current.write(buffer);
                buffer = '';
            }
        };
        const flushInterval = setInterval(flushBuffer, 50);

        stopLogsRef.current = api.startLogs(containerId, (chunk: string) => {
            buffer += chunk;
        }, { timestamps: showTimestamps });

        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);

        const handleScroll = () => {
            const buffer = term.buffer.active;
            const atBottom = buffer.viewportY >= buffer.baseY - 1;
            setIsAtBottom(atBottom);
        };
        term.onScroll(handleScroll);

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setShowSearch(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            clearInterval(flushInterval);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            if (stopLogsRef.current) stopLogsRef.current();
            if (searchListenerRef.current) searchListenerRef.current.dispose();
            term.dispose();
            xtermRef.current = null;
        };
    }, [containerId, showTimestamps]); // Re-start if timestamps toggled

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
            setTimeout(() => fitAddon.fit(), 100);
        }
    }, [active]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (searchAddonRef.current) {
            if (query) {
                searchAddonRef.current.findNext(query, { incremental: true });
            } else {
                xtermRef.current?.clearSelection();
                searchAddonRef.current.findNext('', { incremental: true });
                setSearchResult(null);
            }
        }
    };

    const findNext = () => {
        if (searchAddonRef.current && searchQuery) {
            searchAddonRef.current.findNext(searchQuery);
        }
    };

    const findPrev = () => {
        if (searchAddonRef.current && searchQuery) {
            searchAddonRef.current.findPrevious(searchQuery);
        }
    };

    const clearTerminal = () => {
        if (xtermRef.current) {
            xtermRef.current.clear();
        }
    };

    const scrollToBottom = () => {
        if (xtermRef.current) {
            xtermRef.current.scrollToBottom();
            setIsAtBottom(true);
        }
    };

    const downloadLogs = () => {
        if (!xtermRef.current) return;

        // Get full buffer text
        const term = xtermRef.current;
        let text = '';
        const lineCount = term.buffer.active.baseY + term.rows;

        for (let i = 0; i < lineCount; i++) {
            const line = term.buffer.active.getLine(i);
            if (line) {
                text += line.translateToString() + '\n';
            }
        }

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${containerId.substring(0, 12)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Toolbar */}
            <div style={{
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                background: isDark ? '#18181b' : '#f4f4f5',
                borderBottom: '1px solid var(--border-subtle)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        onClick={() => setShowTimestamps(!showTimestamps)}
                        style={{
                            color: showTimestamps ? 'var(--status-running)' : 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px'
                        }}
                        title="Toggle Timestamps"
                    >
                        <Clock size={14} /> Timestamps
                    </button>
                    <button
                        onClick={downloadLogs}
                        style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                        title="Download Logs"
                    >
                        <Download size={14} /> Download
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => setShowSearch(!showSearch)}
                        style={{
                            color: showSearch ? 'var(--status-running)' : 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px'
                        }}
                    >
                        <Search size={14} /> Search
                    </button>
                    <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 4px' }} />
                    <button
                        onClick={clearTerminal}
                        style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                        title="Clear Buffer"
                    >
                        <Trash2 size={14} /> Clear
                    </button>
                </div>
            </div>

            {/* Search Bar (Floating) */}
            <AnimatePresence>
                {showSearch && (
                    <motion.div
                        initial={{ y: -10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -10, opacity: 0 }}
                        style={{
                            position: 'absolute',
                            top: '48px',
                            right: '12px',
                            background: 'var(--bg-panel)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: 'var(--shadow-lg)',
                            zIndex: 20
                        }}
                    >
                        <Search size={14} color="var(--text-muted)" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Find..."
                            value={searchQuery}
                            onChange={handleSearch}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') findNext();
                                if (e.key === 'Escape') setShowSearch(false);
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                fontSize: '13px',
                                width: '150px'
                            }}
                        />
                        {searchResult && searchResult.count > 0 && (
                            <span style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                padding: '0 8px',
                                whiteSpace: 'nowrap',
                                borderRight: '1px solid var(--border-subtle)',
                                borderLeft: '1px solid var(--border-subtle)',
                                margin: '0 4px'
                            }}>
                                {searchResult.index + 1} / {searchResult.count}
                            </span>
                        )}
                        <div style={{ display: 'flex', gap: '2px' }}>
                            <button onClick={findPrev} style={{ padding: '2px', color: 'var(--text-secondary)' }}><ChevronUp size={16} /></button>
                            <button onClick={findNext} style={{ padding: '2px', color: 'var(--text-secondary)' }}><ChevronDown size={16} /></button>
                        </div>
                        <button onClick={() => setShowSearch(false)} style={{ padding: '2px', color: 'var(--text-muted)' }}><X size={14} /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Scroll to Bottom Button */}
            <AnimatePresence>
                {!isAtBottom && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={scrollToBottom}
                        style={{
                            position: 'absolute',
                            bottom: '40px',
                            right: '40px',
                            background: 'var(--status-running)',
                            color: 'white',
                            width: '36px',
                            height: '36px',
                            borderRadius: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            zIndex: 20,
                            cursor: 'pointer',
                            border: 'none'
                        }}
                    >
                        <ArrowDown size={20} />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Terminal Container */}
            <div style={{
                flex: 1,
                padding: '24px 12px 24px 24px',
                background: isDark ? '#0f0f10' : '#ffffff',
                overflow: 'hidden'
            }}>
                <div
                    ref={terminalRef}
                    style={{
                        width: '100%',
                        height: '100%'
                    }}
                />
            </div>
        </div>
    );
};

export default LogsView;
