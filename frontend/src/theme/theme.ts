import { createTheme, alpha } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'dark',
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
            default: '#0A0E1A',
            paper: '#111827',
        },
        text: {
            primary: '#F1F5F9',
            secondary: '#94A3B8',
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
                    '&::-webkit-scrollbar': { width: '8px', height: '8px' },
                    '&::-webkit-scrollbar-track': { background: '#111827' },
                    '&::-webkit-scrollbar-thumb': {
                        background: '#374151',
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
                    backgroundColor: alpha('#111827', 0.8),
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
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
                    backgroundColor: '#0F1525',
                    borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: alpha('#0A0E1A', 0.8),
                    backdropFilter: 'blur(20px)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    boxShadow: 'none',
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                },
                head: {
                    fontWeight: 700,
                    color: '#94A3B8',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                },
            },
        },
    },
});

export default theme;
