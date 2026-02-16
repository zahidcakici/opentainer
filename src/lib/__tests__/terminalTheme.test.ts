import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDarkTheme, getTerminalTheme } from '../../lib/terminalTheme';

describe('terminalTheme', () => {
    beforeEach(() => {
        // Reset matchMedia mock before each test
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    });

    describe('isDarkTheme', () => {
        it('returns true for "dark"', () => {
            expect(isDarkTheme('dark')).toBe(true);
        });

        it('returns false for "light"', () => {
            expect(isDarkTheme('light')).toBe(false);
        });

        it('returns true for "system" when prefers dark', () => {
            vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
            expect(isDarkTheme('system')).toBe(true);
        });

        it('returns false for "system" when prefers light', () => {
            vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
            expect(isDarkTheme('system')).toBe(false);
        });
    });

    describe('getTerminalTheme', () => {
        it('returns dark background for dark theme', () => {
            const theme = getTerminalTheme('dark');
            expect(theme.background).toBe('#0f0f10');
            expect(theme.foreground).toBe('#f4f4f5');
        });

        it('returns light background for light theme', () => {
            const theme = getTerminalTheme('light');
            expect(theme.background).toBe('#ffffff');
            expect(theme.foreground).toBe('#18181b');
        });

        it('always includes ANSI color palette', () => {
            const theme = getTerminalTheme('dark');
            expect(theme.red).toBe('#ef4444');
            expect(theme.green).toBe('#22c55e');
            expect(theme.yellow).toBe('#f59e0b');
            expect(theme.blue).toBe('#3b82f6');
            expect(theme.magenta).toBe('#a855f7');
            expect(theme.cyan).toBe('#06b6d4');
        });

        it('respects system preference', () => {
            vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
            const theme = getTerminalTheme('system');
            expect(theme.background).toBe('#0f0f10'); // dark

            vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
            const themeLight = getTerminalTheme('system');
            expect(themeLight.background).toBe('#ffffff'); // light
        });
    });
});
