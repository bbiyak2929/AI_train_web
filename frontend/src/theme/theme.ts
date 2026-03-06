import { createTheme, alpha } from '@mui/material/styles';

export function getTheme(mode: 'light' | 'dark') {
    const isDark = mode === 'dark';

    return createTheme({
        palette: {
            mode,
            primary: {
                main: '#6C63FF',
                light: '#8B83FF',
                dark: '#4A42D4',
            },
            secondary: {
                main: '#00D9FF',
                light: '#33E1FF',
                dark: '#00ADcc',
            },
            success: {
                main: '#00E676',
                light: '#33EB91',
                dark: '#00B85C',
            },
            error: {
                main: '#FF5252',
                light: '#FF7474',
                dark: '#CC4242',
            },
            warning: {
                main: '#FFB74D',
                light: '#FFC570',
                dark: '#CC923E',
            },
            background: {
                default: isDark ? '#0A0E1A' : '#F5F7FA',
                paper: isDark ? '#111827' : '#FFFFFF',
            },
            text: {
                primary: isDark ? '#F1F5F9' : '#1E293B',
                secondary: isDark ? '#94A3B8' : '#64748B',
            },
        },
        typography: {
            fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
            h1: { fontWeight: 700, letterSpacing: '-0.02em' },
            h2: { fontWeight: 700, letterSpacing: '-0.01em' },
            h3: { fontWeight: 600 },
            h4: { fontWeight: 600 },
            h5: { fontWeight: 600 },
            h6: { fontWeight: 600 },
            button: { textTransform: 'none', fontWeight: 600 },
        },
        shape: {
            borderRadius: 12,
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    body: {
                        scrollbarWidth: 'thin',
                        backgroundColor: isDark ? '#0A0E1A' : '#F5F7FA',
                        color: isDark ? '#F1F5F9' : '#1E293B',
                        '&::-webkit-scrollbar': { width: '8px', height: '8px' },
                        '&::-webkit-scrollbar-track': { background: isDark ? '#111827' : '#E2E8F0' },
                        '&::-webkit-scrollbar-thumb': {
                            background: isDark ? '#374151' : '#94A3B8',
                            borderRadius: '4px',
                        },
                    },
                },
            },
            MuiButton: {
                styleOverrides: {
                    root: {
                        borderRadius: 10,
                        padding: '8px 20px',
                        fontSize: '0.875rem',
                    },
                    containedPrimary: {
                        background: 'linear-gradient(135deg, #6C63FF 0%, #8B83FF 100%)',
                        boxShadow: '0 4px 15px rgba(108, 99, 255, 0.3)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #5A52E0 0%, #7A73F0 100%)',
                            boxShadow: '0 6px 20px rgba(108, 99, 255, 0.4)',
                        },
                    },
                },
            },
            MuiCard: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        backgroundColor: isDark ? alpha('#111827', 0.8) : '#FFFFFF',
                        backdropFilter: isDark ? 'blur(20px)' : 'none',
                        border: isDark
                            ? '1px solid rgba(255, 255, 255, 0.05)'
                            : '1px solid rgba(0, 0, 0, 0.08)',
                        boxShadow: isDark
                            ? '0 8px 32px rgba(0, 0, 0, 0.3)'
                            : '0 2px 12px rgba(0, 0, 0, 0.08)',
                    },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                    },
                },
            },
            MuiChip: {
                styleOverrides: {
                    root: {
                        fontWeight: 600,
                        fontSize: '0.75rem',
                    },
                },
            },
            MuiDrawer: {
                styleOverrides: {
                    paper: {
                        backgroundColor: isDark ? '#0F1525' : '#FFFFFF',
                        borderRight: isDark
                            ? '1px solid rgba(255, 255, 255, 0.05)'
                            : '1px solid rgba(0, 0, 0, 0.08)',
                    },
                },
            },
            MuiAppBar: {
                styleOverrides: {
                    root: {
                        backgroundColor: isDark ? alpha('#0A0E1A', 0.8) : alpha('#FFFFFF', 0.9),
                        backdropFilter: 'blur(20px)',
                        borderBottom: isDark
                            ? '1px solid rgba(255, 255, 255, 0.05)'
                            : '1px solid rgba(0, 0, 0, 0.08)',
                        boxShadow: 'none',
                        color: isDark ? '#F1F5F9' : '#1E293B',
                    },
                },
            },
            MuiTableCell: {
                styleOverrides: {
                    root: {
                        borderBottom: isDark
                            ? '1px solid rgba(255, 255, 255, 0.05)'
                            : '1px solid rgba(0, 0, 0, 0.08)',
                    },
                    head: {
                        fontWeight: 700,
                        color: isDark ? '#94A3B8' : '#64748B',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                    },
                },
            },
        },
    });
}

const theme = getTheme('dark');
export default theme;
