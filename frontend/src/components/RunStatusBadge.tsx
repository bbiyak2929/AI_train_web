/**
 * RunStatusBadge — 상태별 색상 배지
 */
import React from 'react';
import { Chip } from '@mui/material';
import {
    HourglassEmpty, Schedule, PlayArrow, CheckCircle,
    Error, Stop, Timer,
} from '@mui/icons-material';
import type { RunStatus } from '../types';

const statusConfig: Record<RunStatus, {
    color: 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
    icon: React.ReactElement;
    label: string;
}> = {
    queued: { color: 'default', icon: <HourglassEmpty sx={{ fontSize: 16 }} />, label: 'Queued' },
    scheduled: { color: 'info', icon: <Schedule sx={{ fontSize: 16 }} />, label: 'Scheduled' },
    running: { color: 'primary', icon: <PlayArrow sx={{ fontSize: 16 }} />, label: 'Running' },
    success: { color: 'success', icon: <CheckCircle sx={{ fontSize: 16 }} />, label: 'Success' },
    failed: { color: 'error', icon: <Error sx={{ fontSize: 16 }} />, label: 'Failed' },
    stopped: { color: 'warning', icon: <Stop sx={{ fontSize: 16 }} />, label: 'Stopped' },
    timeout: { color: 'warning', icon: <Timer sx={{ fontSize: 16 }} />, label: 'Timeout' },
};

interface Props {
    status: RunStatus;
    size?: 'small' | 'medium';
}

export default function RunStatusBadge({ status, size = 'small' }: Props) {
    const config = statusConfig[status] || statusConfig.queued;
    return (
        <Chip
            icon={config.icon}
            label={config.label}
            color={config.color}
            size={size}
            variant="outlined"
            sx={{
                fontWeight: 600,
                '& .MuiChip-icon': { ml: 0.5 },
                animation: status === 'running' ? 'pulse 2s infinite' : 'none',
                '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.6 },
                },
            }}
        />
    );
}
