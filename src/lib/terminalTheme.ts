import type { ITheme } from '@xterm/xterm';

/**
 * Determine whether the current effective theme is dark.
 */
export function isDarkTheme(theme: 'light' | 'dark' | 'system'): boolean {
    return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/**
 * Build an xterm ITheme that matches the app's current light/dark mode.
 */
export function getTerminalTheme(theme: 'light' | 'dark' | 'system'): ITheme {
    const isDark = isDarkTheme(theme);
    return {
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
}
