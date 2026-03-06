/**
 * ThemeContext — 다크/라이트 모드 전환
 */
import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { getTheme } from './theme';

type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
    mode: ThemeMode;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    mode: 'dark',
    toggleTheme: () => {},
});

export const useThemeMode = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>(() => {
        const saved = localStorage.getItem('theme_mode');
        return (saved === 'light' || saved === 'dark') ? saved : 'dark';
    });

    useEffect(() => {
        localStorage.setItem('theme_mode', mode);
    }, [mode]);

    const toggleTheme = () => {
        setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

    const theme = useMemo(() => getTheme(mode), [mode]);

    return (
        <ThemeContext.Provider value={{ mode, toggleTheme }}>
            <MuiThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
}
