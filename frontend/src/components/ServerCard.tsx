/**
 * ServerCard — 서버 상태 카드 (대시보드용)
 */
import React from 'react';
import { Card, CardContent, Box, Typography, LinearProgress, Chip, alpha, useTheme } from '@mui/material';
import { Dns as ServerIcon, Memory as GpuIcon } from '@mui/icons-material';
import type { ServerDashboardCard as ServerCardType } from '../types';

interface Props {
    server: ServerCardType;
    onClick?: () => void;
}

const statusColors: Record<string, string> = {
    online: '#00E676',
    offline: '#FF5252',
    maintenance: '#FFB74D',
};

export default function ServerCard({ server, onClick }: Props) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const statusColor = statusColors[server.status] || '#64748B';
    const gpuUsage = server.gpu_count > 0
        ? Math.round((server.active_runs / server.gpu_count) * 100)
        : 0;

    return (
        <Card
            onClick={onClick}
            sx={{
                cursor: onClick ? 'pointer' : 'default',
                position: 'relative',
                overflow: 'visible',
                transition: 'all 0.3s ease',
                '&:hover': onClick ? {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 12px 40px ${alpha(statusColor, 0.15)}`,
                    borderColor: alpha(statusColor, 0.3),
                } : {},
            }}
        >
            {/* Status indicator dot */}
            <Box sx={{
                position: 'absolute', top: 16, right: 16,
                width: 10, height: 10, borderRadius: '50%',
                backgroundColor: statusColor,
                boxShadow: `0 0 8px ${statusColor}`,
                animation: server.status === 'online' ? 'glow 2s infinite' : 'none',
                '@keyframes glow': {
                    '0%, 100%': { boxShadow: `0 0 4px ${statusColor}` },
                    '50%': { boxShadow: `0 0 12px ${statusColor}` },
                },
            }} />

            <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Box sx={{
                        width: 42, height: 42, borderRadius: 2,
                        background: `linear-gradient(135deg, ${alpha(statusColor, 0.2)}, ${alpha(statusColor, 0.05)})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <ServerIcon sx={{ color: statusColor, fontSize: 22 }} />
                    </Box>
                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isDark ? '#F1F5F9' : '#1E293B' }}>
                            {server.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {server.status.toUpperCase()}
                        </Typography>
                    </Box>
                </Box>

                {/* GPU Info */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <GpuIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {server.gpu_model || 'GPU'} × {server.gpu_count}
                    </Typography>
                </Box>

                {/* GPU Usage Bar */}
                <Box sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>GPU 사용률</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                            {gpuUsage}%
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={gpuUsage}
                        sx={{
                            height: 6, borderRadius: 3,
                            backgroundColor: alpha('#6C63FF', 0.1),
                            '& .MuiLinearProgress-bar': {
                                borderRadius: 3,
                                background: gpuUsage > 80
                                    ? 'linear-gradient(90deg, #FF5252, #FF8A80)'
                                    : 'linear-gradient(90deg, #6C63FF, #00D9FF)',
                            },
                        }}
                    />
                </Box>

                {/* Run Stats */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip
                        label={`실행 중: ${server.active_runs}`}
                        size="small"
                        sx={{
                            fontSize: '0.7rem',
                            backgroundColor: alpha('#6C63FF', 0.15),
                            color: 'primary.light',
                            fontWeight: 600,
                        }}
                    />
                    <Chip
                        label={`대기: ${server.queued_runs}`}
                        size="small"
                        sx={{
                            fontSize: '0.7rem',
                            backgroundColor: alpha('#FFB74D', 0.15),
                            color: '#FFB74D',
                            fontWeight: 600,
                        }}
                    />
                </Box>
            </CardContent>
        </Card>
    );
}
