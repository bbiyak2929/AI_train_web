/**
 * ProjectDetailPage — 프로젝트 상세 (실험 템플릿 + Run 목록 + 파일 관리)
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Grid, Card, CardContent, Button, Tabs, Tab,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Skeleton, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, alpha, IconButton, Tooltip,
    LinearProgress, Snackbar, Alert, Checkbox, Collapse, Switch,
} from '@mui/material';
import {
    Add, Science, PlayArrow, ArrowBack,
    CloudUpload, Delete, Download, InsertDriveFile, Folder,
    AutoAwesome, Settings, FolderZip, Storage, DataObject,
    Info, CreateNewFolder, ExpandMore, CheckBox, CheckBoxOutlineBlank,
    IndeterminateCheckBox, EditOutlined, TuneOutlined, Replay,
} from '@mui/icons-material';
import { projectsAPI, experimentsAPI, runsAPI, serversAPI, filesAPI } from '../api/client';
import RunStatusBadge from '../components/RunStatusBadge';
import type { Project, Experiment, RunListItem, Server, ProjectFile } from '../types';

/* ── Parameter & Preset Definitions ──────────────── */
interface ParamDef {
    key: string;
    label: string;
    description: string;
    type: 'number' | 'string' | 'select' | 'boolean';
    default: any;
    options?: { value: string; label: string }[];  // for 'select' type
    min?: number; max?: number; step?: number;       // for 'number' type
}

interface PresetModel {
    value: string;
    label: string;
    description?: string;
    downloads?: number;
    likes?: number;
    author?: string;
}
interface HuggingFaceModelApi {
    id: string;
    downloads?: number;
    likes?: number;
    private?: boolean;
    gated?: boolean | string;
}
interface ExperimentPreset {
    id: string;
    name: string;
    category: string;
    docker_image: string;
    entrypoint: string;
    param_style: 'argparse' | 'equals';
    default_params: Record<string, any>;
    params: ParamDef[];
    models: PresetModel[];
    description: string;
    icon: string;
}

/* ── YOLO 공통 파라미터 ──────────────────────────── */
const YOLO_COMMON_PARAMS: ParamDef[] = [
    { key: 'epochs', label: 'Epochs', description: '전체 데이터셋 반복 횟수. 높을수록 정확도 향상 가능하나 과적합 주의', type: 'number', default: 100, min: 1, max: 10000, step: 10 },
    { key: 'imgsz', label: '이미지 크기', description: '학습 이미지 해상도. 클수록 정확하지만 메모리/시간 증가', type: 'select', default: 640, options: [{ value: '320', label: '320px' }, { value: '416', label: '416px' }, { value: '512', label: '512px' }, { value: '640', label: '640px (권장)' }, { value: '800', label: '800px' }, { value: '1024', label: '1024px' }, { value: '1280', label: '1280px' }] },
    { key: 'batch', label: '배치 크기', description: 'GPU 한번에 처리할 이미지 수. GPU 메모리에 따라 조절', type: 'select', default: 16, options: [{ value: '-1', label: 'Auto (자동)' }, { value: '4', label: '4' }, { value: '8', label: '8' }, { value: '16', label: '16 (권장)' }, { value: '32', label: '32' }, { value: '64', label: '64' }] },
    { key: 'data', label: '데이터 경로', description: 'YAML 데이터셋 설정 파일 경로 (컨테이너 내부)', type: 'string', default: '/workspace/data/data.yaml' },
    { key: 'lr0', label: '초기 학습률', description: '학습 시작 시 learning rate. 높으면 빠르지만 불안정', type: 'number', default: 0.01, min: 0.0001, max: 1, step: 0.001 },
    { key: 'lrf', label: '최종 학습률', description: '코사인 스케줄링 최종 학습률 비율 (lr0 * lrf)', type: 'number', default: 0.01, min: 0.0001, max: 1, step: 0.001 },
    { key: 'momentum', label: '모멘텀', description: 'SGD 옵티마이저 모멘텀 값', type: 'number', default: 0.937, min: 0, max: 1, step: 0.01 },
    { key: 'weight_decay', label: 'Weight Decay', description: 'L2 정규화 강도. 과적합 방지에 도움', type: 'number', default: 0.0005, min: 0, max: 0.1, step: 0.0001 },
    { key: 'warmup_epochs', label: '워밍업 Epochs', description: '학습률을 천천히 올리는 초기 에폭 수', type: 'number', default: 3, min: 0, max: 30, step: 1 },
    { key: 'optimizer', label: '옵티마이저', description: '가중치 업데이트 알고리즘 선택', type: 'select', default: 'auto', options: [{ value: 'auto', label: 'Auto' }, { value: 'SGD', label: 'SGD' }, { value: 'Adam', label: 'Adam' }, { value: 'AdamW', label: 'AdamW' }] },
    { key: 'patience', label: 'Early Stopping', description: '검증 성능이 향상되지 않는 에폭 수 후 학습 중단 (0=비활성)', type: 'number', default: 100, min: 0, max: 500, step: 10 },
    { key: 'save_period', label: '저장 주기', description: '체크포인트 저장 에폭 간격 (-1=마지막만)', type: 'number', default: -1, min: -1, max: 100, step: 1 },
    { key: 'workers', label: '워커 수', description: '데이터 로딩 병렬 워커 수', type: 'number', default: 2, min: 0, max: 32, step: 1 },
    { key: 'device', label: '디바이스', description: '학습에 사용할 GPU 디바이스', type: 'select', default: '0', options: [{ value: '0', label: 'GPU 0' }, { value: '0,1', label: 'GPU 0,1' }, { value: '0,1,2,3', label: 'GPU 0,1,2,3' }, { value: 'cpu', label: 'CPU' }] },
    { key: 'augment', label: '데이터 증강', description: '학습 시 자동 데이터 증강 사용 여부', type: 'boolean', default: true },
    { key: 'cache', label: '데이터 캐시', description: '이미지를 RAM/디스크에 캐시하여 속도 향상', type: 'select', default: 'false', options: [{ value: 'false', label: '비활성' }, { value: 'true', label: 'RAM' }, { value: 'disk', label: 'Disk' }] },
    { key: 'pretrained', label: '사전학습 사용', description: 'COCO 사전학습 가중치 사용 여부', type: 'boolean', default: true },
    { key: 'cos_lr', label: '코사인 스케줄링', description: '코사인 학습률 감소 스케줄링 사용', type: 'boolean', default: false },
    { key: 'resume', label: '학습 재개', description: '마지막 체크포인트에서 학습 재개', type: 'boolean', default: false },
];

/* ── PyTorch/TensorFlow 공통 파라미터 ────────────── */
const PYTORCH_PARAMS: ParamDef[] = [
    { key: 'epochs', label: 'Epochs', description: '전체 학습 반복 횟수', type: 'number', default: 100, min: 1, max: 10000, step: 10 },
    { key: 'batch_size', label: '배치 크기', description: 'GPU 한번에 처리할 샘플 수', type: 'number', default: 32, min: 1, max: 512, step: 1 },
    { key: 'lr', label: '학습률', description: '옵티마이저 학습률 (learning rate)', type: 'number', default: 0.001, min: 0.000001, max: 1, step: 0.0001 },
    { key: 'weight_decay', label: 'Weight Decay', description: 'L2 정규화 강도', type: 'number', default: 0.0001, min: 0, max: 0.1, step: 0.0001 },
    { key: 'num_workers', label: '데이터 로더 워커', description: '데이터 로딩 병렬 프로세스 수', type: 'number', default: 4, min: 0, max: 32, step: 1 },
    { key: 'seed', label: '랜덤 시드', description: '재현 가능한 학습을 위한 시드 값', type: 'number', default: 42, min: 0, max: 99999, step: 1 },
];

const TF_PARAMS: ParamDef[] = [
    { key: 'epochs', label: 'Epochs', description: '전체 학습 반복 횟수', type: 'number', default: 100, min: 1, max: 10000, step: 10 },
    { key: 'batch_size', label: '배치 크기', description: 'GPU 한번에 처리할 샘플 수', type: 'number', default: 32, min: 1, max: 512, step: 1 },
    { key: 'learning_rate', label: '학습률', description: '옵티마이저 학습률', type: 'number', default: 0.001, min: 0.000001, max: 1, step: 0.0001 },
    { key: 'validation_split', label: '검증 비율', description: '학습 데이터 중 검증에 사용할 비율', type: 'number', default: 0.2, min: 0, max: 0.5, step: 0.05 },
];

/* ── LLM 파인튜닝 파라미터 ───────────────────────── */
const LLM_FINETUNE_PARAMS: ParamDef[] = [
    { key: 'num_train_epochs', label: 'Epochs', description: '전체 파인튜닝 반복 횟수', type: 'number', default: 3, min: 1, max: 100, step: 1 },
    { key: 'per_device_train_batch_size', label: '배치 크기', description: 'GPU당 학습 배치 크기', type: 'select', default: '4', options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '4', label: '4 (권장)' }, { value: '8', label: '8' }, { value: '16', label: '16' }] },
    { key: 'learning_rate', label: '학습률', description: 'LoRA 파인튜닝 학습률', type: 'number', default: 2e-4, min: 1e-6, max: 0.01, step: 1e-5 },
    { key: 'gradient_accumulation_steps', label: 'Gradient 누적', description: '유효 배치 크기를 키우기 위한 누적 스텝 수', type: 'select', default: '4', options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '4', label: '4 (권장)' }, { value: '8', label: '8' }, { value: '16', label: '16' }] },
    { key: 'max_seq_length', label: '최대 시퀀스 길이', description: '토큰 최대 길이. 길수록 메모리 많이 사용', type: 'select', default: '2048', options: [{ value: '512', label: '512' }, { value: '1024', label: '1024' }, { value: '2048', label: '2048 (권장)' }, { value: '4096', label: '4096' }, { value: '8192', label: '8192' }] },
    { key: 'lora_r', label: 'LoRA Rank', description: 'LoRA 어댑터의 rank. 높을수록 표현력 증가 / 메모리 증가', type: 'select', default: '16', options: [{ value: '8', label: '8 (경량)' }, { value: '16', label: '16 (권장)' }, { value: '32', label: '32' }, { value: '64', label: '64 (고성능)' }] },
    { key: 'lora_alpha', label: 'LoRA Alpha', description: 'LoRA 스케일링 팩터 (보통 rank의 2배)', type: 'number', default: 32, min: 1, max: 256, step: 1 },
    { key: 'lora_dropout', label: 'LoRA Dropout', description: 'LoRA 레이어 드롭아웃 비율', type: 'number', default: 0.05, min: 0, max: 0.5, step: 0.01 },
    { key: 'warmup_ratio', label: '워밍업 비율', description: '전체 스텝 중 학습률 워밍업 비율', type: 'number', default: 0.03, min: 0, max: 0.3, step: 0.01 },
    { key: 'weight_decay', label: 'Weight Decay', description: 'L2 정규화', type: 'number', default: 0.001, min: 0, max: 0.1, step: 0.001 },
    { key: 'fp16', label: 'FP16 혼합정밀도', description: '메모리 절약 및 속도 향상을 위한 16비트 학습', type: 'boolean', default: true },
    { key: 'bf16', label: 'BF16', description: 'Ampere+ GPU에서 BF16 사용 (FP16 대신)', type: 'boolean', default: false },
    { key: 'load_in_4bit', label: '4bit 양자화', description: 'QLoRA: 4bit 양자화로 메모리 대폭 절약', type: 'boolean', default: true },
    { key: 'dataset_text_field', label: '텍스트 필드', description: '데이터셋에서 학습에 사용할 텍스트 컬럼명', type: 'string', default: 'text' },
];

const EXPERIMENT_PRESETS: ExperimentPreset[] = [
    {
        id: 'yolo26-detect', name: 'YOLO26 객체감지', category: 'Object Detection',
        docker_image: 'ultralytics/ultralytics:latest', entrypoint: 'yolo detect train',
        param_style: 'equals',
        default_params: { epochs: 100, imgsz: 640, batch: 16, data: '/workspace/data/data.yaml', workers: 1 },
        params: YOLO_COMMON_PARAMS,
        models: [
            { value: 'yolo26n.pt', label: 'YOLO26n (Nano)', description: '가장 빠르고 경량. 엣지 디바이스/실시간용' },
            { value: 'yolo26s.pt', label: 'YOLO26s (Small)', description: '속도-정확도 균형. 일반적 용도' },
            { value: 'yolo26m.pt', label: 'YOLO26m (Medium)', description: '중간 규모. 좋은 정확도' },
            { value: 'yolo26l.pt', label: 'YOLO26l (Large)', description: '높은 정확도. GPU 권장' },
            { value: 'yolo26x.pt', label: 'YOLO26x (XLarge)', description: '최고 정확도. 대형 GPU 필요' },
        ],
        description: 'YOLO26 최신 모델 객체감지 학습', icon: '🎯',
    },
    {
        id: 'yolo11-detect', name: 'YOLO11 객체감지', category: 'Object Detection',
        docker_image: 'ultralytics/ultralytics:latest', entrypoint: 'yolo detect train',
        param_style: 'equals',
        default_params: { epochs: 100, imgsz: 640, batch: 16, data: '/workspace/data/data.yaml', workers: 1 },
        params: YOLO_COMMON_PARAMS,
        models: [
            { value: 'yolo11n.pt', label: 'YOLO11n (Nano)', description: '초경량 실시간 감지' },
            { value: 'yolo11s.pt', label: 'YOLO11s (Small)', description: '속도-정확도 균형' },
            { value: 'yolo11m.pt', label: 'YOLO11m (Medium)', description: '범용 객체감지' },
            { value: 'yolo11l.pt', label: 'YOLO11l (Large)', description: '높은 정확도' },
            { value: 'yolo11x.pt', label: 'YOLO11x (XLarge)', description: '최고 정확도' },
        ],
        description: 'YOLO11 객체감지 학습', icon: '🔍',
    },
    {
        id: 'yolo-segment', name: 'YOLO 세그멘테이션', category: 'Segmentation',
        docker_image: 'ultralytics/ultralytics:latest', entrypoint: 'yolo segment train',
        param_style: 'equals',
        default_params: { epochs: 100, imgsz: 640, batch: 16, data: '/workspace/data/data.yaml' },
        params: YOLO_COMMON_PARAMS,
        models: [
            { value: 'yolo11n-seg.pt', label: 'YOLO11n-seg', description: '경량 인스턴스 세그멘테이션' },
            { value: 'yolo11s-seg.pt', label: 'YOLO11s-seg', description: '범용 세그멘테이션' },
            { value: 'yolo11m-seg.pt', label: 'YOLO11m-seg', description: '고정확도 세그멘테이션' },
        ],
        description: 'YOLO 인스턴스 세그멘테이션', icon: '🖼️',
    },
    {
        id: 'yolo-classify', name: 'YOLO 분류', category: 'Classification',
        docker_image: 'ultralytics/ultralytics:latest', entrypoint: 'yolo classify train',
        param_style: 'equals',
        default_params: { epochs: 100, imgsz: 224, batch: 64, data: '/workspace/data', workers: 2 },
        params: YOLO_COMMON_PARAMS,
        models: [
            { value: 'yolo11n-cls.pt', label: 'YOLO11n-cls', description: '초경량 이미지 분류' },
            { value: 'yolo11s-cls.pt', label: 'YOLO11s-cls', description: '범용 이미지 분류' },
            { value: 'yolo11m-cls.pt', label: 'YOLO11m-cls', description: '고정확도 이미지 분류' },
        ],
        description: 'YOLO 이미지 분류', icon: '🏷️',
    },
    {
        id: 'yolo-pose', name: 'YOLO 포즈추정', category: 'Pose Estimation',
        docker_image: 'ultralytics/ultralytics:latest', entrypoint: 'yolo pose train',
        param_style: 'equals',
        default_params: { epochs: 100, imgsz: 640, batch: 16, data: '/workspace/data/data.yaml', workers: 2 },
        params: YOLO_COMMON_PARAMS,
        models: [
            { value: 'yolo11n-pose.pt', label: 'YOLO11n-pose', description: '경량 키포인트 추정' },
            { value: 'yolo11s-pose.pt', label: 'YOLO11s-pose', description: '범용 포즈 추정' },
            { value: 'yolo11m-pose.pt', label: 'YOLO11m-pose', description: '고정확도 포즈 추정' },
        ],
        description: 'YOLO 포즈(키포인트) 추정', icon: '🤸',
    },
    /* ── LLM 파인튜닝 프리셋 ─────────────────────── */
    {
        id: 'llm-sft', name: 'LLM 파인튜닝 (SFT)', category: 'LLM',
        docker_image: 'pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime',
        entrypoint: 'python -m trl.scripts.sft',
        param_style: 'argparse',
        default_params: { num_train_epochs: 3, per_device_train_batch_size: 4, learning_rate: 2e-4, lora_r: 16, lora_alpha: 32, max_seq_length: 2048, load_in_4bit: true, fp16: true },
        params: LLM_FINETUNE_PARAMS,
        models: [
            { value: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B Instruct', description: '최신 고성능 대형 모델. 4x80GB+ 권장' },
            { value: 'meta-llama/Llama-3.2-11B-Vision-Instruct', label: 'Llama 3.2 11B Vision', description: '멀티모달(이미지+텍스트) Instruct 모델' },
            { value: 'meta-llama/Llama-3.2-90B-Vision-Instruct', label: 'Llama 3.2 90B Vision', description: '초대형 멀티모달 모델. 대규모 GPU 필요' },
            { value: 'meta-llama/Llama-3.2-1B', label: 'Llama 3.2 1B', description: '경량 LLM. 8GB VRAM으로 파인튜닝 가능' },
            { value: 'meta-llama/Llama-3.2-3B', label: 'Llama 3.2 3B', description: '소형 LLM. 12GB VRAM 권장' },
            { value: 'meta-llama/Llama-3.1-8B', label: 'Llama 3.1 8B', description: '범용 LLM. 24GB VRAM 권장' },
            { value: 'meta-llama/Llama-3.1-70B-Instruct', label: 'Llama 3.1 70B', description: '고정확도 범용 모델. 멀티 GPU 권장' },
            { value: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B Instruct', description: '지시형 튜닝된 7B 모델. 범용 작업 적합' },
            { value: 'mistralai/Mistral-7B-v0.3', label: 'Mistral 7B v0.3', description: '고효율 7B 모델. 24GB VRAM' },
            { value: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B Instruct', description: 'MoE 기반 고성능 모델. 멀티 GPU 권장' },
            { value: 'mistralai/Mixtral-8x22B-Instruct-v0.1', label: 'Mixtral 8x22B Instruct', description: '대형 MoE 모델. 연구/서빙급 하드웨어' },
            { value: 'google/gemma-2-27b', label: 'Gemma 2 27B', description: 'Google 대형 모델. 고성능 추론/튜닝' },
            { value: 'google/gemma-2-2b', label: 'Gemma 2 2B', description: 'Google 경량 LLM. 12GB VRAM' },
            { value: 'google/gemma-2-9b', label: 'Gemma 2 9B', description: 'Google 범용 LLM. 24GB VRAM' },
            { value: 'Qwen/Qwen2.5-14B-Instruct', label: 'Qwen 2.5 14B', description: '중대형 범용 모델. 40GB급 권장' },
            { value: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen 2.5 32B', description: '고성능 장문/코딩 대응 모델' },
            { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B', description: '초대형 고성능 모델. 멀티 GPU 필요' },
            { value: 'Qwen/Qwen2.5-7B', label: 'Qwen 2.5 7B', description: 'Alibaba 범용 LLM. 24GB VRAM' },
            { value: 'Qwen/Qwen2.5-1.5B', label: 'Qwen 2.5 1.5B', description: 'Alibaba 경량 LLM. 8GB VRAM' },
            { value: 'Qwen/Qwen2.5-Coder-7B-Instruct', label: 'Qwen2.5 Coder 7B', description: '코드 생성/수정 특화 모델' },
            { value: 'Qwen/Qwen2.5-Coder-14B-Instruct', label: 'Qwen2.5 Coder 14B', description: '코딩 성능 강화 중대형 모델' },
            { value: 'microsoft/Phi-3.5-mini-instruct', label: 'Phi 3.5 Mini', description: '소형 고효율 Instruct 모델' },
            { value: 'microsoft/Phi-3-medium-128k-instruct', label: 'Phi 3 Medium 128k', description: '장문 컨텍스트(128k) 지원' },
            { value: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', label: 'DeepSeek R1 Distill 7B', description: '추론 강화 distilled 모델' },
            { value: 'deepseek-ai/deepseek-llm-7b-chat', label: 'DeepSeek LLM 7B Chat', description: '대화형 범용 모델' },
            { value: 'tiiuae/Falcon3-10B-Instruct', label: 'Falcon 3 10B', description: '중형 인스트럭션 튜닝 모델' },
            { value: 'allenai/OLMo-2-13B-Instruct', label: 'OLMo 2 13B', description: '오픈 연구 친화 모델' },
            { value: 'ibm-granite/granite-3.1-8b-instruct', label: 'Granite 3.1 8B', description: '기업용 인스트럭션 계열' },
            { value: 'NousResearch/Hermes-3-Llama-3.1-8B', label: 'Hermes 3 8B', description: '대화 품질 개선 튜닝 모델' },
        ],
        description: 'HuggingFace 모델 LoRA/QLoRA 파인튜닝 (CSV, JSON, JSONL, TXT 지원)', icon: '🤖',
    },
    {
        id: 'llm-custom', name: 'LLM 커스텀 학습', category: 'LLM',
        docker_image: 'pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime',
        entrypoint: 'python train.py',
        param_style: 'argparse',
        default_params: { num_train_epochs: 3, per_device_train_batch_size: 4, learning_rate: 2e-4 },
        params: LLM_FINETUNE_PARAMS,
        models: [
            { value: '', label: '커스텀 모델 (직접 입력)', description: 'HuggingFace 모델 ID 또는 로컬 경로' },
        ],
        description: '커스텀 스크립트로 LLM 학습 (CSV, JSON, JSONL, TXT 지원)', icon: '🧪',
    },
    /* ── 범용 프리셋 ─────────────────────────────── */
    {
        id: 'pytorch-custom', name: 'PyTorch 커스텀', category: 'Custom',
        docker_image: 'pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime', entrypoint: 'python train.py',
        param_style: 'argparse',
        default_params: { epochs: 100, batch_size: 32, lr: 0.001 },
        params: PYTORCH_PARAMS,
        models: [],
        description: 'PyTorch 커스텀 학습 스크립트', icon: '🔥',
    },
    {
        id: 'tensorflow-custom', name: 'TensorFlow 커스텀', category: 'Custom',
        docker_image: 'tensorflow/tensorflow:2.15.0-gpu', entrypoint: 'python train.py',
        param_style: 'argparse',
        default_params: { epochs: 100, batch_size: 32, learning_rate: 0.001 },
        params: TF_PARAMS,
        models: [],
        description: 'TensorFlow 커스텀 학습 스크립트', icon: '🧠',
    },
    {
        id: 'custom', name: '직접 입력', category: 'Custom',
        docker_image: '', entrypoint: '', param_style: 'argparse',
        default_params: {}, params: [],
        models: [],
        description: '직접 Docker 이미지와 명령어 입력', icon: '⚙️',
    },
];

const detectYoloFamily = (value?: string): string | undefined => {
    if (!value) return undefined;
    const match = value.toLowerCase().match(/(yolo\d+)/);
    return match?.[1];
};

const getExperimentPreset = (exp: Experiment): ExperimentPreset | undefined => {
    const candidates = EXPERIMENT_PRESETS.filter((p: ExperimentPreset) =>
        p.docker_image === exp.docker_image && p.entrypoint === exp.entrypoint
    );
    if (candidates.length <= 1) return candidates[0];

    const model = typeof exp.default_params?.model === 'string' ? exp.default_params.model : '';
    if (model) {
        const exactMatch = candidates.find((p: ExperimentPreset) => p.models.some((m: PresetModel) => m.value === model));
        if (exactMatch) return exactMatch;

        const modelFamily = detectYoloFamily(model);
        if (modelFamily) {
            const familyMatch = candidates.find((p: ExperimentPreset) => {
                const presetFamily = detectYoloFamily(p.id) || p.models.map((m: PresetModel) => detectYoloFamily(m.value)).find(Boolean);
                return presetFamily === modelFamily;
            });
            if (familyMatch) return familyMatch;
        }
    }

    const nameFamily = detectYoloFamily(exp.name);
    if (nameFamily) {
        const byNameFamily = candidates.find((p: ExperimentPreset) => {
            const presetFamily = detectYoloFamily(p.id) || p.models.map((m: PresetModel) => detectYoloFamily(m.value)).find(Boolean);
            return presetFamily === nameFamily;
        });
        if (byNameFamily) return byNameFamily;
    }

    return candidates[0];
};

export default function ProjectDetailPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const [project, setProject] = useState<Project | null>(null);
    const [experiments, setExperiments] = useState<Experiment[]>([]);
    const [runs, setRuns] = useState<RunListItem[]>([]);
    const [servers, setServers] = useState<Server[]>([]);
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(true);

    // Experiment create dialog
    const [expDialog, setExpDialog] = useState(false);
    const [expForm, setExpForm] = useState({
        name: '', description: '', docker_image: '', entrypoint: '', version: '',
        param_style: 'argparse' as string, model: '', default_params: {} as Record<string, any>,
    });
    const [selectedPreset, setSelectedPreset] = useState<string>('');
    const [customModel, setCustomModel] = useState('');
    const [paramsText, setParamsText] = useState('{}');
    const [expRenameDialog, setExpRenameDialog] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });
    const [expRenameValue, setExpRenameValue] = useState('');

    const handleSelectPreset = (presetId: string) => {
        setSelectedPreset(presetId);
        const preset = EXPERIMENT_PRESETS.find(p => p.id === presetId);
        if (!preset) return;
        const modelsForPreset = preset.category === 'LLM' && hfApiModels.length > 0 ? hfApiModels : preset.models;
        const firstModel = modelsForPreset.length > 0 ? modelsForPreset[0].value : '';
        const params = { ...preset.default_params, ...(firstModel ? { model: firstModel } : {}) };
        setExpForm({
            name: preset.name,
            description: preset.description,
            docker_image: preset.docker_image,
            entrypoint: preset.entrypoint,
            param_style: preset.param_style,
            version: '',
            model: firstModel,
            default_params: params,
        });
        setParamsText(JSON.stringify(params, null, 2));
        setCustomModel('');
    };

    const handleModelChange = (modelValue: string) => {
        if (modelValue === '__custom__') {
            const params = { ...expForm.default_params, model: customModel || '' };
            setExpForm((f: typeof expForm) => ({ ...f, model: '', default_params: params }));
            setParamsText(JSON.stringify(params, null, 2));
        } else {
            const params = { ...expForm.default_params, model: modelValue };
            setExpForm((f: typeof expForm) => ({ ...f, model: modelValue, default_params: params }));
            setParamsText(JSON.stringify(params, null, 2));
            setCustomModel('');
        }
    };

    // Run create dialog
    const [runDialog, setRunDialog] = useState(false);
    const [selectedExp, setSelectedExp] = useState<string>('');
    const [runName, setRunName] = useState('');
    const [runParams, setRunParams] = useState('{}');
    const [selectedServer, setSelectedServer] = useState<string>('');
    const [dataSourceType, setDataSourceType] = useState<'project_files' | 'remote_path' | 'none'>('project_files');
    const [remoteDataPath, setRemoteDataPath] = useState('');
    const [containerMountPath, setContainerMountPath] = useState('/workspace/data');
    const [selectedFileKeys, setSelectedFileKeys] = useState<string[]>([]);
    const [filePickerOpen, setFilePickerOpen] = useState(false);
    // Run 파라미터 개별 관리
    const [runParamValues, setRunParamValues] = useState<Record<string, any>>({});
    const [runParamEnabled, setRunParamEnabled] = useState<Record<string, boolean>>({});
    const [runParamsOpen, setRunParamsOpen] = useState(true);
    const [runAdvancedOpen, setRunAdvancedOpen] = useState(false);
    const [hfModelId, setHfModelId] = useState('');
    const [hfApiModels, setHfApiModels] = useState<PresetModel[]>([]);
    const [hfApiLoading, setHfApiLoading] = useState(false);
    const [hfApiLoaded, setHfApiLoaded] = useState(false);
    const [hfModelQuery, setHfModelQuery] = useState('');
    const [hfOrgFilter, setHfOrgFilter] = useState('all');
    const [hfMinDownloads, setHfMinDownloads] = useState(0);
    const [hfMinLikes, setHfMinLikes] = useState(0);

    // File management state
    const [files, setFiles] = useState<ProjectFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const zipInputRef = useRef<HTMLInputElement>(null);

    const fetchFiles = useCallback(async () => {
        if (!projectId) return;
        try {
            const res = await filesAPI.list(projectId);
            setFiles(res.data);
        } catch (err) {
            console.error(err);
        }
    }, [projectId]);

    const handleFileUpload = async (fileList: FileList | File[]) => {
        if (!projectId) return;
        setUploading(true);
        try {
            const arr = Array.from(fileList);
            if (arr.length === 1) {
                await filesAPI.upload(projectId, arr[0]);
            } else {
                await filesAPI.uploadMultiple(projectId, arr);
            }
            setSnackbar({ open: true, message: `${arr.length}개 파일 업로드 완료`, severity: 'success' });
            fetchFiles();
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: '파일 업로드 실패', severity: 'error' });
        }
        setUploading(false);
    };

    const handleDeleteFile = async (key: string) => {
        if (!projectId) return;
        try {
            await filesAPI.delete(projectId, key);
            setSnackbar({ open: true, message: '파일 삭제 완료', severity: 'success' });
            fetchFiles();
        } catch (err) {
            setSnackbar({ open: true, message: '파일 삭제 실패', severity: 'error' });
        }
    };

    const [renameDialog, setRenameDialog] = useState<{ open: boolean; key: string; name: string }>({ open: false, key: '', name: '' });
    const [renameValue, setRenameValue] = useState('');

    const handleRenameFile = async () => {
        if (!projectId || !renameDialog.key || !renameValue.trim()) return;
        try {
            await filesAPI.rename(projectId, renameDialog.key, renameValue.trim());
            setSnackbar({ open: true, message: '파일 이름 변경 완료', severity: 'success' });
            setRenameDialog({ open: false, key: '', name: '' });
            fetchFiles();
        } catch (err) {
            setSnackbar({ open: true, message: '파일 이름 변경 실패', severity: 'error' });
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files);
        }
    };

    const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!projectId || !e.target.files || e.target.files.length === 0) return;
        setUploading(true);
        try {
            const fileList = Array.from(e.target.files) as File[];
            const paths = fileList.map((f) => (f as any).webkitRelativePath || f.name);
            await filesAPI.uploadWithPaths(projectId, fileList, paths);
            setSnackbar({ open: true, message: `폴더 업로드 완료 (${fileList.length}개 파일)`, severity: 'success' });
            fetchFiles();
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: '폴더 업로드 실패', severity: 'error' });
        }
        setUploading(false);
        e.target.value = '';
    };

    const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!projectId || !e.target.files || e.target.files.length === 0) return;
        const zipFile = e.target.files[0];
        if (!zipFile.name.toLowerCase().endsWith('.zip')) {
            setSnackbar({ open: true, message: 'ZIP 파일만 업로드 가능합니다', severity: 'error' });
            return;
        }
        setUploading(true);
        try {
            const res = await filesAPI.uploadFolder(projectId, zipFile);
            setSnackbar({ open: true, message: `ZIP 압축 해제 완료 (${res.data.extracted_files}개 파일)`, severity: 'success' });
            fetchFiles();
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: 'ZIP 업로드 실패', severity: 'error' });
        }
        setUploading(false);
        e.target.value = '';
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const fetchData = async () => {
        if (!projectId) return;
        try {
            const [projRes, expRes, runsRes, srvRes] = await Promise.all([
                projectsAPI.get(projectId),
                experimentsAPI.list(projectId),
                runsAPI.list(projectId),
                serversAPI.list(),
            ]);
            setProject(projRes.data);
            setExperiments(expRes.data);
            setRuns(runsRes.data);
            setServers(srvRes.data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    const fetchHuggingFaceModels = async () => {
        if (hfApiLoading || hfApiLoaded) return;
        setHfApiLoading(true);
        try {
            const tags = ['text-generation', 'text2text-generation', 'conversational'];
            const responses = await Promise.all(
                tags.map((tag: string) =>
                    fetch(`https://huggingface.co/api/models?pipeline_tag=${encodeURIComponent(tag)}&sort=downloads&direction=-1&limit=50&full=false`)
                )
            );

            const payloads = await Promise.all(
                responses.map(async (res: Response) => {
                    if (!res.ok) return [] as HuggingFaceModelApi[];
                    const data = await res.json();
                    return Array.isArray(data) ? data as HuggingFaceModelApi[] : [];
                })
            );

            const merged = payloads.flat();
            const deduped = new Map<string, HuggingFaceModelApi>();
            merged.forEach((m: HuggingFaceModelApi) => {
                if (!m?.id) return;
                if (m.private) return;
                if (m.gated) return;
                if (!deduped.has(m.id)) deduped.set(m.id, m);
            });

            const models = Array.from(deduped.values())
                .sort((a: HuggingFaceModelApi, b: HuggingFaceModelApi) => (b.downloads || 0) - (a.downloads || 0))
                .slice(0, 80)
                .map((m: HuggingFaceModelApi) => ({
                    value: m.id,
                    label: m.id,
                    description: `downloads ${m.downloads || 0} / likes ${m.likes || 0}`,
                    downloads: m.downloads || 0,
                    likes: m.likes || 0,
                    author: m.id.includes('/') ? m.id.split('/')[0] : 'other',
                }));

            setHfApiModels(models);
        } catch (err) {
            console.error('Failed to fetch HuggingFace models:', err);
        } finally {
            setHfApiLoaded(true);
            setHfApiLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [projectId]);

    useEffect(() => {
        if (expDialog || runDialog) fetchHuggingFaceModels();
    }, [expDialog, runDialog]);

    useEffect(() => {
        if (tab === 2) fetchFiles();
    }, [tab, fetchFiles]);

    const hfQuickOrgs = useMemo(() => {
        const source = hfApiModels.length > 0 ? hfApiModels : EXPERIMENT_PRESETS.find((p: ExperimentPreset) => p.id === 'llm-sft')?.models || [];
        const counts = new Map<string, number>();
        source.forEach((m: PresetModel) => {
            const org = m.author || (m.value.includes('/') ? m.value.split('/')[0] : 'other');
            if (!org) return;
            counts.set(org, (counts.get(org) || 0) + 1);
        });
        return Array.from(counts.entries())
            .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
            .slice(0, 10)
            .map((entry: [string, number]) => entry[0]);
    }, [hfApiModels]);

    const applyLlmModelFilters = useCallback((models: PresetModel[], usingApiModels: boolean): PresetModel[] => {
        const q = hfModelQuery.trim().toLowerCase();
        return models.filter((m: PresetModel) => {
            const org = m.author || (m.value.includes('/') ? m.value.split('/')[0] : 'other');
            const haystack = `${m.value} ${m.label} ${m.description || ''} ${org}`.toLowerCase();

            if (q && !haystack.includes(q)) return false;
            if (hfOrgFilter !== 'all' && org.toLowerCase() !== hfOrgFilter.toLowerCase()) return false;

            // downloads/likes 필터는 HuggingFace API 결과에만 적용
            if (usingApiModels) {
                if ((m.downloads || 0) < hfMinDownloads) return false;
                if ((m.likes || 0) < hfMinLikes) return false;
            }
            return true;
        });
    }, [hfModelQuery, hfOrgFilter, hfMinDownloads, hfMinLikes]);

    const resetLlmFilters = () => {
        setHfModelQuery('');
        setHfOrgFilter('all');
        setHfMinDownloads(0);
        setHfMinLikes(0);
    };

    const handleCreateExperiment = async () => {
        if (!projectId) return;
        let parsedParams = expForm.default_params;
        try { parsedParams = JSON.parse(paramsText); } catch {}
        try {
            await experimentsAPI.create(projectId, {
                name: expForm.name,
                description: expForm.description,
                docker_image: expForm.docker_image,
                entrypoint: expForm.entrypoint,
                default_params: parsedParams,
                default_env: {},
                param_style: expForm.param_style,
                version: expForm.version,
            });
            setExpDialog(false);
            setExpForm({
                name: '', description: '', docker_image: '', entrypoint: '', version: '',
                param_style: 'argparse', model: '', default_params: {},
            });
            setParamsText('{}');
            setSelectedPreset('');
            setCustomModel('');
            fetchData();
            setSnackbar({ open: true, message: '실험 템플릿 생성 완료', severity: 'success' });
        } catch (err: any) {
            console.error(err);
            const message = err?.response?.data?.detail || '실험 템플릿 생성 실패';
            setSnackbar({ open: true, message, severity: 'error' });
        }
    };

    const handleRenameExperiment = async () => {
        if (!projectId || !expRenameDialog.id || !expRenameValue.trim()) return;
        try {
            await experimentsAPI.update(projectId, expRenameDialog.id, { name: expRenameValue.trim() });
            setExpRenameDialog({ open: false, id: '', name: '' });
            setExpRenameValue('');
            setSnackbar({ open: true, message: '실험 템플릿 이름 변경 완료', severity: 'success' });
            fetchData();
        } catch (err: any) {
            console.error(err);
            const message = err?.response?.data?.detail || '실험 템플릿 이름 변경 실패';
            setSnackbar({ open: true, message, severity: 'error' });
        }
    };

    // 실험 선택 시 프리셋 파라미터로 초기화
    const initRunParams = (expId: string) => {
        const exp = experiments.find((e: Experiment) => e.id === expId);
        if (!exp) return;
        // 프리셋 매칭: docker/entrypoint + 모델/이름 힌트를 함께 사용
        const preset = getExperimentPreset(exp);
        if (preset && preset.params.length > 0) {
            const vals: Record<string, any> = {};
            const enabled: Record<string, boolean> = {};
            // 실험 기본 파라미터에 있는 것은 활성화
            const expDefaults = exp.default_params || {};
            preset.params.forEach((pd: ParamDef) => {
                vals[pd.key] = pd.key in expDefaults ? expDefaults[pd.key] : pd.default;
                // 기본 파라미터에 있거나 필수 파라미터(epochs, batch 등)는 기본 활성화
                const isBasic = ['epochs', 'imgsz', 'batch', 'data', 'batch_size', 'lr', 'learning_rate',
                    'num_train_epochs', 'per_device_train_batch_size', 'max_seq_length', 'lora_r'].includes(pd.key);
                enabled[pd.key] = pd.key in expDefaults || isBasic;
            });
            // model 파라미터는 별도 처리
            if (expDefaults.model) {
                vals['model'] = expDefaults.model;
                enabled['model'] = true;
            }
            setRunParamValues(vals);
            setRunParamEnabled(enabled);
            setRunParams(JSON.stringify(expDefaults, null, 2));
        } else {
            // 프리셋 없으면 실험 기본 파라미터 사용
            setRunParamValues(exp.default_params || {});
            setRunParamEnabled({});
            setRunParams(JSON.stringify(exp.default_params || {}, null, 2));
        }
        setHfModelId(exp.default_params?.model || '');
    };

    const getRunPreset = (): ExperimentPreset | undefined => {
        const exp = experiments.find((e: Experiment) => e.id === selectedExp);
        if (!exp) return undefined;
        return getExperimentPreset(exp);
    };

    const buildRunParamsJson = (): Record<string, any> => {
        const preset = getRunPreset();
        if (!preset || preset.params.length === 0) {
            try { return JSON.parse(runParams); } catch { return {}; }
        }
        const result: Record<string, any> = {};
        preset.params.forEach((pd: ParamDef) => {
            if (runParamEnabled[pd.key]) {
                let val = runParamValues[pd.key];
                // select 타입이면 원래 타입으로 변환
                if (pd.type === 'select' && typeof val === 'string') {
                    const num = Number(val);
                    if (!isNaN(num) && val !== '' && val !== 'true' && val !== 'false') val = num;
                    else if (val === 'true') val = true;
                    else if (val === 'false') val = false;
                }
                result[pd.key] = val;
            }
        });
        // model은 별도 처리
        if (runParamEnabled['model'] || hfModelId) {
            result['model'] = hfModelId || runParamValues['model'];
        }
        return result;
    };

    const handleCreateRun = async () => {
        if (!projectId || !selectedExp) return;
        try {
            const params = buildRunParamsJson();

            await runsAPI.create(projectId, {
                experiment_id: selectedExp,
                name: runName || undefined,
                params,
                server_id: selectedServer || undefined,
                data_source_type: dataSourceType,
                remote_data_path: dataSourceType === 'remote_path' ? remoteDataPath : undefined,
                container_mount_path: containerMountPath,
                selected_files: dataSourceType === 'project_files' && selectedFileKeys.length > 0 && selectedFileKeys.length < files.length ? selectedFileKeys : undefined,
            });
            setRunDialog(false);
            setRunName('');
            setRunParams('{}');
            setSelectedExp('');
            setSelectedServer('');
            setDataSourceType('project_files');
            setRemoteDataPath('');
            setContainerMountPath('/workspace/data');
            setSelectedFileKeys([]);
            setFilePickerOpen(false);
            setRunParamValues({});
            setRunParamEnabled({});
            setHfModelId('');
            fetchData();
        } catch (err) { console.error(err); }
    };

    const handleDeleteRun = async (runId: string) => {
        if (!projectId) return;
        if (!window.confirm('이 실행 기록을 삭제할까요?')) return;
        try {
            await runsAPI.delete(projectId, runId);
            setSnackbar({ open: true, message: '실행 기록 삭제 완료', severity: 'success' });
            fetchData();
        } catch (err: any) {
            console.error(err);
            const message = err?.response?.data?.detail || '실행 기록 삭제 실패';
            setSnackbar({ open: true, message, severity: 'error' });
        }
    };

    const handleRetryRun = async (runId: string) => {
        if (!projectId) return;
        try {
            await runsAPI.retry(projectId, runId);
            setSnackbar({ open: true, message: '재실행을 요청했습니다', severity: 'success' });
            fetchData();
        } catch (err: any) {
            console.error(err);
            const message = err?.response?.data?.detail || '재실행 요청 실패';
            setSnackbar({ open: true, message, severity: 'error' });
        }
    };

    const openRunDialog = (expId?: string) => {
        if (expId) {
            setSelectedExp(expId);
            initRunParams(expId);
        }
        fetchFiles();
        setRunDialog(true);
    };

    const formatTime = (t?: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const sortedExperiments = [...experiments].sort((a: Experiment, b: Experiment) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (loading) {
        return <Box><Skeleton height={40} width={200} /><Skeleton height={300} sx={{ mt: 2 }} /></Box>;
    }

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                <IconButton onClick={() => navigate('/projects')} sx={{ color: 'text.secondary' }}>
                    <ArrowBack />
                </IconButton>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {project?.name || 'Project'}
                    </Typography>
                    {project?.description && (
                        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                            {project.description}
                        </Typography>
                    )}
                </Box>
                <Button variant="contained" startIcon={<PlayArrow />} onClick={() => openRunDialog()} disabled={experiments.length === 0}>
                    Run 실행
                </Button>
            </Box>

            {/* Tabs */}
            <Tabs value={tab} onChange={(_: React.SyntheticEvent, v: number) => setTab(v)} sx={{ mb: 3 }}>
                <Tab label={`실험 템플릿 (${experiments.length})`} />
                <Tab label={`실행 기록 (${runs.length})`} />
                <Tab label={`파일 관리 (${files.length})`} />
            </Tabs>

            {/* Experiments Tab */}
            {tab === 0 && (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                        <Button startIcon={<Add />} variant="outlined" size="small" onClick={() => setExpDialog(true)}>
                            새 실험 템플릿
                        </Button>
                    </Box>
                    <Grid container spacing={2}>
                        {experiments.length === 0 ? (
                            <Grid item xs={12}>
                                <Card sx={{ textAlign: 'center' }}>
                                    <CardContent sx={{ py: 5 }}>
                                        <Science sx={{ fontSize: 44, color: 'action.disabled', mb: 1 }} />
                                        <Typography color="text.secondary">실험 템플릿이 없습니다</Typography>
                                        <Button startIcon={<Add />} sx={{ mt: 2 }} onClick={() => setExpDialog(true)}>
                                            만들기
                                        </Button>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ) : (
                            sortedExperiments.map((exp: Experiment) => (
                                <Grid item xs={12} sm={6} md={4} key={exp.id}>
                                    <Card sx={{
                                        transition: 'all 0.3s',
                                        '&:hover': { transform: 'translateY(-2px)', borderColor: alpha('#00D9FF', 0.3) },
                                    }}>
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                                                <Box sx={{
                                                    width: 38, height: 38, borderRadius: 2,
                                                    background: alpha('#00D9FF', 0.1),
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <Science sx={{ color: '#00D9FF', fontSize: 20 }} />
                                                </Box>
                                                <Box>
                                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{exp.name}</Typography>
                                                    {exp.version && <Chip label={`v${exp.version}`} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />}
                                                </Box>
                                                <Box sx={{ ml: 'auto' }}>
                                                    <Tooltip title="템플릿 이름 변경">
                                                        <IconButton size="small" onClick={() => { setExpRenameDialog({ open: true, id: exp.id, name: exp.name }); setExpRenameValue(exp.name); }}>
                                                            <EditOutlined fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </Box>
                                            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.8 }}>
                                                생성: {formatTime(exp.created_at)}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                                                🐳 {exp.docker_image}
                                            </Typography>
                                            {exp.default_params?.model && (
                                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                                                    🧠 {exp.default_params.model}
                                                </Typography>
                                            )}
                                            {exp.entrypoint && (
                                                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 1.5, fontFamily: 'monospace' }}>
                                                    $ {exp.entrypoint}
                                                </Typography>
                                            )}
                                            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 1.5, fontFamily: 'monospace' }}>
                                                ID {exp.id.slice(0, 8)}
                                            </Typography>
                                            <Button size="small" variant="outlined" startIcon={<PlayArrow />}
                                                onClick={() => openRunDialog(exp.id)} fullWidth>
                                                이 템플릿으로 실행
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))
                        )}
                    </Grid>
                </>
            )}

            {/* Runs Tab */}
            {tab === 1 && (
                <TableContainer component={Paper} sx={{ backgroundColor: (theme: any) => alpha(theme.palette.background.paper, 0.8) }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>이름</TableCell>
                                <TableCell>상태</TableCell>
                                <TableCell>이미지</TableCell>
                                <TableCell>시작</TableCell>
                                <TableCell>종료</TableCell>
                                <TableCell align="right">작업</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {runs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}>
                                        <Typography color="text.secondary">실행 기록이 없습니다</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                runs.map((run: RunListItem) => (
                                    <TableRow key={run.id} hover sx={{ cursor: 'pointer' }}
                                        onClick={() => navigate(`/projects/${projectId}/runs/${run.id}`)}
                                    >
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {run.name || run.id.slice(0, 8)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell><RunStatusBadge status={run.status} /></TableCell>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                                                {run.docker_image?.split('/').pop() || '-'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell><Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatTime(run.started_at)}</Typography></TableCell>
                                        <TableCell><Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatTime(run.finished_at)}</Typography></TableCell>
                                        <TableCell align="right" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                            {['failed', 'timeout', 'stopped'].includes(run.status) && (
                                                <Tooltip title="같은 설정으로 재실행">
                                                    <IconButton size="small" sx={{ color: 'primary.main' }} onClick={() => handleRetryRun(run.id)}>
                                                        <Replay fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            <Tooltip title="실행 기록 삭제">
                                                <IconButton size="small" sx={{ color: 'error.main' }} onClick={() => handleDeleteRun(run.id)}>
                                                    <Delete fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Files Tab */}
            {tab === 2 && (
                <Box>
                    {/* Hidden file inputs */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        multiple
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            if (e.target.files && e.target.files.length > 0) {
                                handleFileUpload(e.target.files);
                                e.target.value = '';
                            }
                        }}
                    />
                    <input
                        type="file"
                        ref={folderInputRef}
                        style={{ display: 'none' }}
                        {...{ webkitdirectory: '', directory: '', multiple: true } as any}
                        onChange={handleFolderUpload}
                    />
                    <input
                        type="file"
                        ref={zipInputRef}
                        style={{ display: 'none' }}
                        accept=".zip"
                        onChange={handleZipUpload}
                    />

                    {/* Upload progress */}
                    {uploading && <LinearProgress sx={{ mb: 2 }} />}

                    {/* Drag & Drop Zone */}
                    <Box
                        onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        sx={{
                            border: `2px dashed ${dragOver ? '#00D9FF' : ''}`,
                            borderColor: dragOver ? '#00D9FF' : 'divider',
                            borderRadius: 2,
                            p: 4,
                            mb: 2,
                            textAlign: 'center',
                            backgroundColor: dragOver ? alpha('#00D9FF', 0.05) : 'transparent',
                            transition: 'all 0.2s',
                            cursor: 'pointer',
                        }}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <CloudUpload sx={{ fontSize: 48, color: dragOver ? '#00D9FF' : 'text.disabled', mb: 1 }} />
                        <Typography sx={{ color: 'text.secondary', mb: 0.5 }}>
                            파일을 드래그하거나 클릭하여 업로드
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                            데이터셋, 모델 파일, 스크립트 등
                        </Typography>
                    </Box>

                    {/* Folder / ZIP Upload Buttons */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                        <Button
                            variant="outlined" size="small" startIcon={<CreateNewFolder />}
                            onClick={() => folderInputRef.current?.click()}
                        >
                            폴더 업로드
                        </Button>
                        <Button
                            variant="outlined" size="small" startIcon={<FolderZip />}
                            onClick={() => zipInputRef.current?.click()}
                        >
                            ZIP 업로드 (자동 압축해제)
                        </Button>
                    </Box>

                    {/* File list */}
                    {files.length === 0 ? (
                        <Card sx={{ textAlign: 'center' }}>
                            <CardContent sx={{ py: 5 }}>
                                <Folder sx={{ fontSize: 44, color: 'action.disabled', mb: 1 }} />
                                <Typography color="text.secondary">업로드된 파일이 없습니다</Typography>
                                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                    Run 실행 시 /workspace/data 경로에 자동으로 마운트됩니다
                                </Typography>
                            </CardContent>
                        </Card>
                    ) : (
                        <TableContainer component={Paper} sx={{ backgroundColor: (theme: any) => alpha(theme.palette.background.paper, 0.8) }}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>파일</TableCell>
                                        <TableCell>크기</TableCell>
                                        <TableCell>수정일</TableCell>
                                        <TableCell align="right">작업</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {files.map((file: ProjectFile) => (
                                        <TableRow key={file.key} hover>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <InsertDriveFile sx={{ fontSize: 18, color: 'text.secondary' }} />
                                                    <Box>
                                                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                            {file.name}
                                                        </Typography>
                                                        {file.relative_path !== file.name && (
                                                            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                                                {file.relative_path}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                    {formatBytes(file.size)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                    {new Date(file.last_modified).toLocaleString('ko-KR', {
                                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="이름 변경">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => {
                                                            setRenameDialog({ open: true, key: file.key, name: file.name });
                                                            setRenameValue(file.name);
                                                        }}
                                                        sx={{ color: 'text.secondary' }}
                                                    >
                                                        <EditOutlined fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="다운로드">
                                                    <IconButton
                                                        size="small"
                                                        component="a"
                                                        href={projectId ? filesAPI.downloadUrl(projectId, file.key) : '#'}
                                                        sx={{ color: 'text.secondary' }}
                                                    >
                                                        <Download fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="삭제">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleDeleteFile(file.key)}
                                                        sx={{ color: 'error.main' }}
                                                    >
                                                        <Delete fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 2 }}>
                        💡 업로드한 파일은 Run 실행 시 컨테이너의 <code>/workspace/data</code> 경로에 자동 마운트됩니다
                    </Typography>
                </Box>
            )}

            {/* Experiment Create Dialog */}
            <Dialog open={expDialog} onClose={() => setExpDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AutoAwesome sx={{ color: '#6C63FF' }} />
                        새 실험 템플릿
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {/* Preset Selector */}
                    <Typography variant="subtitle2" sx={{ mt: 1, mb: 1.5, fontWeight: 600, color: 'text.secondary' }}>
                        📋 프리셋 선택
                    </Typography>
                    <Grid container spacing={1} sx={{ mb: 3 }}>
                        {EXPERIMENT_PRESETS.map((preset) => (
                            <Grid item xs={6} sm={4} md={3} key={preset.id}>
                                <Card
                                    onClick={() => handleSelectPreset(preset.id)}
                                    sx={{
                                        cursor: 'pointer', textAlign: 'center', p: 1.5,
                                        border: 2,
                                        borderColor: selectedPreset === preset.id ? '#6C63FF' : 'divider',
                                        backgroundColor: selectedPreset === preset.id ? alpha('#6C63FF', 0.08) : 'transparent',
                                        transition: 'all 0.2s',
                                        '&:hover': { borderColor: alpha('#6C63FF', 0.5), transform: 'translateY(-1px)' },
                                    }}
                                >
                                    <Typography sx={{ fontSize: '1.5rem', mb: 0.5 }}>{preset.icon}</Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', lineHeight: 1.2 }}>
                                        {preset.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>
                                        {preset.category}
                                    </Typography>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>

                    {/* Model Selection (if preset has models) */}
                    {(() => {
                        const preset = EXPERIMENT_PRESETS.find(p => p.id === selectedPreset);
                        if (!preset) return null;
                        const isLLM = preset.category === 'LLM';
                        const usingApiModels = isLLM && hfApiModels.length > 0;
                        const rawModelsForPreset = usingApiModels ? hfApiModels : preset.models;
                        if (!isLLM && rawModelsForPreset.length === 0) return null;
                        const modelsForPreset = isLLM ? applyLlmModelFilters(rawModelsForPreset, usingApiModels) : rawModelsForPreset;
                        return (
                            <>
                                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.secondary' }}>
                                    🧠 학습 모델 선택
                                </Typography>
                                {isLLM && (
                                    <>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                                            {hfApiLoading ? 'HuggingFace 모델 목록 불러오는 중...' : (hfApiModels.length > 0 ? 'HuggingFace 공개 API 기준 인기 모델' : '프리셋 모델 목록 사용 중')}
                                        </Typography>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="모델 검색"
                                            value={hfModelQuery}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHfModelQuery(e.target.value)}
                                            placeholder="예: Qwen, llama, coder"
                                            sx={{ mb: 1 }}
                                        />
                                        <Grid container spacing={1} sx={{ mb: 1 }}>
                                            <Grid item xs={6}>
                                                <TextField
                                                    fullWidth
                                                    select
                                                    size="small"
                                                    label="최소 다운로드"
                                                    value={String(hfMinDownloads)}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHfMinDownloads(Number(e.target.value))}
                                                    SelectProps={{ native: true }}
                                                >
                                                    <option value="0">제한 없음</option>
                                                    <option value="10000">10k+</option>
                                                    <option value="100000">100k+</option>
                                                    <option value="500000">500k+</option>
                                                    <option value="1000000">1M+</option>
                                                </TextField>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <TextField
                                                    fullWidth
                                                    select
                                                    size="small"
                                                    label="최소 좋아요"
                                                    value={String(hfMinLikes)}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHfMinLikes(Number(e.target.value))}
                                                    SelectProps={{ native: true }}
                                                >
                                                    <option value="0">제한 없음</option>
                                                    <option value="50">50+</option>
                                                    <option value="100">100+</option>
                                                    <option value="500">500+</option>
                                                    <option value="1000">1k+</option>
                                                </TextField>
                                            </Grid>
                                        </Grid>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.7, mb: 1.2 }}>
                                            <Chip
                                                size="small"
                                                label="ALL"
                                                variant={hfOrgFilter === 'all' ? 'filled' : 'outlined'}
                                                onClick={() => setHfOrgFilter('all')}
                                            />
                                            {hfQuickOrgs.map((org: string) => (
                                                <Chip
                                                    key={org}
                                                    size="small"
                                                    label={org}
                                                    variant={hfOrgFilter === org ? 'filled' : 'outlined'}
                                                    onClick={() => setHfOrgFilter(org)}
                                                />
                                            ))}
                                            <Button size="small" onClick={resetLlmFilters}>필터 초기화</Button>
                                        </Box>
                                        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 1 }}>
                                            필터 결과: {modelsForPreset.length}개
                                        </Typography>
                                    </>
                                )}
                                <TextField
                                    fullWidth select label="모델" sx={{ mb: 1.5 }}
                                    value={expForm.model || '__custom__'}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleModelChange(e.target.value)}
                                    SelectProps={{ native: true }}
                                >
                                    {modelsForPreset.map((m: PresetModel) => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                    <option value="__custom__">직접 입력 (커스텀 모델)</option>
                                </TextField>
                                {(expForm.model === '' || !modelsForPreset.find((m: PresetModel) => m.value === expForm.model)) && (
                                    <TextField
                                        fullWidth label="커스텀 모델 경로" sx={{ mb: 1.5 }}
                                        placeholder="/workspace/data/my_model.pt 또는 모델명"
                                        value={customModel}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            setCustomModel(e.target.value);
                                            const params = { ...expForm.default_params, model: e.target.value };
                                            setExpForm((f: typeof expForm) => ({ ...f, default_params: params }));
                                            setParamsText(JSON.stringify(params, null, 2));
                                        }}
                                        helperText="프로젝트 파일에 업로드한 .pt 파일은 /workspace/data/ 경로로 접근 가능"
                                    />
                                )}
                            </>
                        );
                    })()}

                    {/* Form Fields */}
                    <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.secondary' }}>
                        <Settings sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                        상세 설정
                    </Typography>
                    <TextField fullWidth label="템플릿 이름" value={expForm.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpForm({ ...expForm, name: e.target.value })}
                        sx={{ mb: 2 }} required />
                    <TextField fullWidth label="설명" value={expForm.description}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpForm({ ...expForm, description: e.target.value })}
                        sx={{ mb: 2 }} multiline rows={2} />
                    <TextField fullWidth label="Docker 이미지" value={expForm.docker_image}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpForm({ ...expForm, docker_image: e.target.value })}
                        sx={{ mb: 2 }} required placeholder="ultralytics/ultralytics:latest" />
                    <TextField fullWidth label="Entrypoint (실행 명령)" value={expForm.entrypoint}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpForm({ ...expForm, entrypoint: e.target.value })}
                        sx={{ mb: 2 }} placeholder="yolo detect train" />
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={6}>
                            <TextField fullWidth label="파라미터 형식" select value={expForm.param_style}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpForm({ ...expForm, param_style: e.target.value })}
                                SelectProps={{ native: true }}
                                helperText={expForm.param_style === 'equals' ? 'key=value (YOLO 스타일)' : '--key=value (Python argparse)'}
                            >
                                <option value="argparse">argparse (--key=value)</option>
                                <option value="equals">YOLO식 (key=value)</option>
                            </TextField>
                        </Grid>
                        <Grid item xs={6}>
                            <TextField fullWidth label="버전" value={expForm.version}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpForm({ ...expForm, version: e.target.value })} placeholder="1.0" />
                        </Grid>
                    </Grid>
                    <TextField fullWidth label="기본 파라미터 (JSON)" multiline rows={3}
                        value={paramsText}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParamsText(e.target.value)}
                        error={(() => { try { JSON.parse(paramsText); return false; } catch { return true; } })()}
                        helperText={(() => { try { JSON.parse(paramsText); return ''; } catch { return '유효하지 않은 JSON 형식입니다'; } })()}
                        sx={{ fontFamily: 'monospace', '& textarea': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setExpDialog(false); setSelectedPreset(''); }} color="inherit">취소</Button>
                    <Button variant="contained" onClick={handleCreateExperiment}
                        disabled={!expForm.name || !expForm.docker_image}>생성</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={expRenameDialog.open} onClose={() => setExpRenameDialog({ open: false, id: '', name: '' })} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>실험 템플릿 이름 변경</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        label="새 템플릿 이름"
                        value={expRenameValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpRenameValue(e.target.value)}
                        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') handleRenameExperiment(); }}
                        sx={{ mt: 1 }}
                        size="small"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExpRenameDialog({ open: false, id: '', name: '' })} color="inherit">취소</Button>
                    <Button
                        onClick={handleRenameExperiment}
                        variant="contained"
                        disabled={!expRenameValue.trim() || expRenameValue.trim() === expRenameDialog.name}
                    >
                        변경
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Run Create Dialog */}
            <Dialog open={runDialog} onClose={() => setRunDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PlayArrow sx={{ color: '#00D9FF' }} /> Run 실행
                </DialogTitle>
                <DialogContent>
                    {/* 기본 정보 */}
                    <TextField fullWidth label="Run 이름 (선택)" value={runName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRunName(e.target.value)} sx={{ mt: 1, mb: 2 }} size="small" />
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={7}>
                            <TextField fullWidth label="실험 템플릿" select value={selectedExp}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSelectedExp(e.target.value); initRunParams(e.target.value); }}
                                required SelectProps={{ native: true }} size="small"
                            >
                                <option value="">선택하세요</option>
                                {experiments.map((exp: Experiment) => <option key={exp.id} value={exp.id}>{exp.name}</option>)}
                            </TextField>
                        </Grid>
                        <Grid item xs={5}>
                            <TextField fullWidth label="서버" select value={selectedServer}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedServer(e.target.value)}
                                SelectProps={{ native: true }} size="small"
                            >
                                <option value="">자동 선택</option>
                                {servers.map((s: Server) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </TextField>
                        </Grid>
                    </Grid>

                    {/* 모델 선택 (LLM/YOLO 프리셋일 때) */}
                    {(() => {
                        const preset = getRunPreset();
                        if (!preset) return null;
                        const isLLM = preset.category === 'LLM';
                        const usingApiModels = isLLM && hfApiModels.length > 0;
                        const rawModelsForRun = usingApiModels ? hfApiModels : preset.models;
                        if (!isLLM && rawModelsForRun.length === 0) return null;
                        const modelsForRun = isLLM ? applyLlmModelFilters(rawModelsForRun, usingApiModels) : rawModelsForRun;
                        return (
                            <Box sx={{ mb: 2, p: 2, borderRadius: 2, backgroundColor: alpha('#6C63FF', 0.06), border: 1, borderColor: alpha('#6C63FF', 0.15) }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {isLLM ? '🤖' : '🧠'} 모델 선택
                                </Typography>
                                {isLLM && (
                                    <>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                                            {hfApiLoading ? 'HuggingFace 모델 목록 불러오는 중...' : (hfApiModels.length > 0 ? 'HuggingFace 공개 API 기준 인기 모델' : '프리셋 모델 목록 사용 중')}
                                        </Typography>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="모델 검색"
                                            value={hfModelQuery}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHfModelQuery(e.target.value)}
                                            placeholder="예: Qwen, llama, coder"
                                            sx={{ mb: 1 }}
                                        />
                                        <Grid container spacing={1} sx={{ mb: 1 }}>
                                            <Grid item xs={6}>
                                                <TextField
                                                    fullWidth
                                                    select
                                                    size="small"
                                                    label="최소 다운로드"
                                                    value={String(hfMinDownloads)}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHfMinDownloads(Number(e.target.value))}
                                                    SelectProps={{ native: true }}
                                                >
                                                    <option value="0">제한 없음</option>
                                                    <option value="10000">10k+</option>
                                                    <option value="100000">100k+</option>
                                                    <option value="500000">500k+</option>
                                                    <option value="1000000">1M+</option>
                                                </TextField>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <TextField
                                                    fullWidth
                                                    select
                                                    size="small"
                                                    label="최소 좋아요"
                                                    value={String(hfMinLikes)}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHfMinLikes(Number(e.target.value))}
                                                    SelectProps={{ native: true }}
                                                >
                                                    <option value="0">제한 없음</option>
                                                    <option value="50">50+</option>
                                                    <option value="100">100+</option>
                                                    <option value="500">500+</option>
                                                    <option value="1000">1k+</option>
                                                </TextField>
                                            </Grid>
                                        </Grid>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.7, mb: 1.2 }}>
                                            <Chip
                                                size="small"
                                                label="ALL"
                                                variant={hfOrgFilter === 'all' ? 'filled' : 'outlined'}
                                                onClick={() => setHfOrgFilter('all')}
                                            />
                                            {hfQuickOrgs.map((org: string) => (
                                                <Chip
                                                    key={org}
                                                    size="small"
                                                    label={org}
                                                    variant={hfOrgFilter === org ? 'filled' : 'outlined'}
                                                    onClick={() => setHfOrgFilter(org)}
                                                />
                                            ))}
                                            <Button size="small" onClick={resetLlmFilters}>필터 초기화</Button>
                                        </Box>
                                        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 1 }}>
                                            필터 결과: {modelsForRun.length}개
                                        </Typography>
                                    </>
                                )}
                                <Grid container spacing={1}>
                                    {modelsForRun.map((m: PresetModel) => (
                                        <Grid item xs={12} sm={6} key={m.value}>
                                            <Card
                                                onClick={() => { setHfModelId(m.value); setRunParamValues((prev: Record<string, any>) => ({ ...prev, model: m.value })); setRunParamEnabled((prev: Record<string, boolean>) => ({ ...prev, model: true })); }}
                                                sx={{
                                                    cursor: 'pointer', p: 1.2,
                                                    border: 2, borderColor: hfModelId === m.value ? '#6C63FF' : 'divider',
                                                    backgroundColor: hfModelId === m.value ? alpha('#6C63FF', 0.08) : 'transparent',
                                                    transition: 'all 0.2s',
                                                    '&:hover': { borderColor: alpha('#6C63FF', 0.5), transform: 'translateY(-1px)' },
                                                }}
                                            >
                                                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>{m.label}</Typography>
                                                {m.description && <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.3 }}>{m.description}</Typography>}
                                            </Card>
                                        </Grid>
                                    ))}
                                </Grid>
                                {/* 커스텀 모델 입력 */}
                                <TextField
                                    fullWidth size="small" sx={{ mt: 1.5 }}
                                    label={isLLM ? 'HuggingFace 모델 ID 또는 경로' : '커스텀 모델 경로'}
                                    placeholder={isLLM ? 'meta-llama/Llama-3.1-8B 또는 /workspace/data/model' : '/workspace/data/model.pt'}
                                    value={hfModelId}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        setHfModelId(e.target.value);
                                        setRunParamValues((prev: Record<string, any>) => ({ ...prev, model: e.target.value }));
                                        setRunParamEnabled((prev: Record<string, boolean>) => ({ ...prev, model: true }));
                                    }}
                                    helperText={isLLM ? 'HuggingFace Hub 모델 ID를 입력하거나, 프로젝트 파일에 업로드한 모델 경로를 입력하세요' : '프로젝트 파일에 업로드한 .pt 파일은 /workspace/data/ 경로로 접근 가능'}
                                />
                            </Box>
                        );
                    })()}

                    {/* 파라미터 설정 */}
                    {(() => {
                        const preset = getRunPreset();
                        if (!preset || preset.params.length === 0) {
                            // 프리셋 없으면 JSON 입력
                            return (
                                <TextField fullWidth label="파라미터 (JSON)" value={runParams}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRunParams(e.target.value)} multiline rows={3}
                                    placeholder='{"epochs": 100, "batch_size": 32}'
                                    sx={{ mb: 2, fontFamily: 'monospace', '& textarea': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                                />
                            );
                        }
                        // 기본 파라미터 (항상 표시)
                        const basicKeys = ['epochs', 'imgsz', 'batch', 'data', 'batch_size', 'lr', 'learning_rate',
                            'num_train_epochs', 'per_device_train_batch_size', 'max_seq_length', 'lora_r', 'lora_alpha'];
                        const basicParams = preset.params.filter((pd: ParamDef) => basicKeys.includes(pd.key));
                        const advancedParams = preset.params.filter((pd: ParamDef) => !basicKeys.includes(pd.key));

                        const renderParam = (pd: ParamDef) => {
                            const enabled = runParamEnabled[pd.key] ?? false;
                            const val = runParamValues[pd.key] ?? pd.default;
                            return (
                                <Box key={pd.key} sx={{
                                    display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.8, px: 1,
                                    borderRadius: 1, mb: 0.5,
                                    backgroundColor: enabled ? alpha('#00D9FF', 0.04) : 'transparent',
                                    transition: 'background-color 0.15s',
                                    '&:hover': { backgroundColor: alpha('#00D9FF', 0.06) },
                                }}>
                                    <Checkbox size="small" checked={enabled} sx={{ p: 0, mt: 0.5 }}
                                        onChange={(_: React.ChangeEvent<HTMLInputElement>, checked: boolean) =>
                                            setRunParamEnabled((prev: Record<string, boolean>) => ({ ...prev, [pd.key]: checked }))}
                                    />
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem', color: enabled ? 'text.primary' : 'text.disabled' }}>
                                                {pd.key}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                                {pd.label}
                                            </Typography>
                                        </Box>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5, lineHeight: 1.3 }}>
                                            {pd.description}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ width: 160, flexShrink: 0 }}>
                                        {pd.type === 'select' ? (
                                            <>
                                                <TextField size="small" fullWidth disabled={!enabled}
                                                    value={String(val ?? '')}
                                                    inputProps={{ list: `param-options-${pd.key}` }}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                        setRunParamValues((prev: Record<string, any>) => ({ ...prev, [pd.key]: e.target.value }))}
                                                />
                                                <datalist id={`param-options-${pd.key}`}>
                                                    {pd.options?.map((o: { value: string; label: string }) => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </datalist>
                                            </>
                                        ) : pd.type === 'boolean' ? (
                                            <Switch size="small" disabled={!enabled}
                                                checked={Boolean(val)}
                                                onChange={(_: React.ChangeEvent<HTMLInputElement>, checked: boolean) =>
                                                    setRunParamValues((prev: Record<string, any>) => ({ ...prev, [pd.key]: checked }))}
                                            />
                                        ) : (
                                            <TextField size="small" fullWidth disabled={!enabled}
                                                type="number" value={val}
                                                inputProps={{ min: pd.min, max: pd.max, step: pd.step }}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                    const v = e.target.value === '' ? '' : Number(e.target.value);
                                                    setRunParamValues((prev: Record<string, any>) => ({ ...prev, [pd.key]: v }));
                                                }}
                                            />
                                        )}
                                    </Box>
                                </Box>
                            );
                        };

                        return (
                            <Box sx={{ mb: 2 }}>
                                {/* 기본 파라미터 */}
                                <Box
                                    onClick={() => setRunParamsOpen(!runParamsOpen)}
                                    sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', mb: 1, py: 0.5 }}
                                >
                                    <TuneOutlined sx={{ fontSize: 18, color: '#00D9FF' }} />
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
                                        학습 파라미터
                                    </Typography>
                                    <Chip label={`${Object.values(runParamEnabled).filter(Boolean).length}개 활성`} size="small"
                                        sx={{ height: 22, fontSize: '0.7rem' }} />
                                    <ExpandMore sx={{ fontSize: 18, transform: runParamsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                </Box>
                                <Collapse in={runParamsOpen}>
                                    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1, mb: 1 }}>
                                        {basicParams.map(renderParam)}
                                    </Box>
                                    {/* 고급 파라미터 */}
                                    {advancedParams.length > 0 && (
                                        <>
                                            <Box
                                                onClick={() => setRunAdvancedOpen(!runAdvancedOpen)}
                                                sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', py: 0.5, mb: 0.5 }}
                                            >
                                                <Settings sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                <Typography variant="caption" sx={{ fontWeight: 600, flex: 1, color: 'text.secondary' }}>
                                                    고급 설정 ({advancedParams.length}개)
                                                </Typography>
                                                <ExpandMore sx={{ fontSize: 16, color: 'text.secondary', transform: runAdvancedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                            </Box>
                                            <Collapse in={runAdvancedOpen}>
                                                <Box sx={{ border: 1, borderColor: alpha('#ff9800', 0.2), borderRadius: 2, p: 1 }}>
                                                    {advancedParams.map(renderParam)}
                                                </Box>
                                            </Collapse>
                                        </>
                                    )}
                                </Collapse>
                            </Box>
                        );
                    })()}

                    {/* 데이터 소스 선택 */}
                    <Typography variant="subtitle2" sx={{ mt: 1, mb: 1.5, fontWeight: 600, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <DataObject sx={{ fontSize: 16 }} />
                        학습 데이터 소스
                    </Typography>
                    <Grid container spacing={1} sx={{ mb: 2 }}>
                        {([
                            { value: 'project_files' as const, label: '프로젝트 파일', icon: <CloudUpload fontSize="small" />, desc: '업로드된 파일을 서버로 전송' },
                            { value: 'remote_path' as const, label: '서버 경로 지정', icon: <Storage fontSize="small" />, desc: '서버에 이미 있는 데이터 사용' },
                            { value: 'none' as const, label: '데이터 없음', icon: <Science fontSize="small" />, desc: '데이터 마운트 없이 실행' },
                        ] as const).map((opt) => (
                            <Grid item xs={4} key={opt.value}>
                                <Card onClick={() => setDataSourceType(opt.value)}
                                    sx={{
                                        cursor: 'pointer', p: 1.5, textAlign: 'center', border: 2,
                                        borderColor: dataSourceType === opt.value ? '#00D9FF' : 'divider',
                                        backgroundColor: dataSourceType === opt.value ? alpha('#00D9FF', 0.08) : 'transparent',
                                        transition: 'all 0.2s', '&:hover': { borderColor: alpha('#00D9FF', 0.5) },
                                    }}
                                >
                                    <Box sx={{ color: dataSourceType === opt.value ? '#00D9FF' : 'text.secondary', mb: 0.5 }}>{opt.icon}</Box>
                                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{opt.label}</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>{opt.desc}</Typography>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>

                    {/* 프로젝트 파일 선택 */}
                    {dataSourceType === 'project_files' && (
                        <Box sx={{ p: 2, mb: 2, borderRadius: 2, backgroundColor: alpha('#2196f3', 0.08), border: 1, borderColor: alpha('#2196f3', 0.2) }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Info sx={{ fontSize: 18, color: 'info.main' }} />
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'info.main' }}>프로젝트 파일 ({files.length}개)</Typography>
                            </Box>
                            {files.length > 0 ? (
                                <>
                                    <Box onClick={() => setFilePickerOpen(!filePickerOpen)}
                                        sx={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            p: 1.2, borderRadius: 1.5, cursor: 'pointer',
                                            border: '1px solid', borderColor: selectedFileKeys.length > 0 ? 'primary.main' : alpha('#fff', 0.15),
                                            backgroundColor: selectedFileKeys.length > 0 ? alpha('#2196f3', 0.06) : alpha('#fff', 0.03),
                                            transition: 'all 0.2s', '&:hover': { borderColor: 'primary.main', backgroundColor: alpha('#2196f3', 0.08) },
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {selectedFileKeys.length === 0 ? <CheckBoxOutlineBlank sx={{ fontSize: 20, color: 'text.disabled' }} />
                                                : selectedFileKeys.length === files.length ? <CheckBox sx={{ fontSize: 20, color: 'primary.main' }} />
                                                : <IndeterminateCheckBox sx={{ fontSize: 20, color: 'primary.main' }} />}
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {selectedFileKeys.length === 0 ? '학습에 사용할 파일을 선택하세요'
                                                    : selectedFileKeys.length === files.length ? `전체 ${files.length}개 파일 선택됨`
                                                    : `${selectedFileKeys.length}개 / ${files.length}개 파일 선택됨`}
                                            </Typography>
                                        </Box>
                                        <ExpandMore sx={{ fontSize: 20, color: 'text.secondary', transform: filePickerOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                    </Box>
                                    <Collapse in={filePickerOpen}>
                                        <Box sx={{ mt: 1, borderRadius: 1.5, border: '1px solid', borderColor: alpha('#2196f3', 0.15), backgroundColor: alpha('#2196f3', 0.03), overflow: 'hidden' }}>
                                            <Box onClick={() => { selectedFileKeys.length === files.length ? setSelectedFileKeys([]) : setSelectedFileKeys(files.map((f: ProjectFile) => f.key)); }}
                                                sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, cursor: 'pointer', borderBottom: '1px solid', borderColor: alpha('#2196f3', 0.1), '&:hover': { backgroundColor: alpha('#2196f3', 0.08) } }}
                                            >
                                                <Checkbox size="small" checked={selectedFileKeys.length === files.length} indeterminate={selectedFileKeys.length > 0 && selectedFileKeys.length < files.length} sx={{ p: 0 }} />
                                                <Typography variant="caption" sx={{ fontWeight: 600 }}>전체 선택 ({files.length}개)</Typography>
                                            </Box>
                                            <Box sx={{ maxHeight: 180, overflow: 'auto' }}>
                                                {files.map((f: ProjectFile) => {
                                                    const isSel = selectedFileKeys.includes(f.key);
                                                    return (
                                                        <Box key={f.key} onClick={() => isSel ? setSelectedFileKeys(selectedFileKeys.filter((k: string) => k !== f.key)) : setSelectedFileKeys([...selectedFileKeys, f.key])}
                                                            sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.6, cursor: 'pointer', backgroundColor: isSel ? alpha('#2196f3', 0.06) : 'transparent', '&:hover': { backgroundColor: alpha('#2196f3', 0.1) }, transition: 'background-color 0.15s' }}
                                                        >
                                                            <Checkbox size="small" checked={isSel} sx={{ p: 0 }} />
                                                            <InsertDriveFile sx={{ fontSize: 16, color: isSel ? 'primary.main' : 'text.disabled' }} />
                                                            <Typography variant="caption" sx={{ flex: 1, fontFamily: 'monospace', color: isSel ? 'text.primary' : 'text.secondary' }}>{f.relative_path}</Typography>
                                                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>{formatBytes(f.size)}</Typography>
                                                        </Box>
                                                    );
                                                })}
                                            </Box>
                                        </Box>
                                    </Collapse>
                                    <Typography variant="caption" sx={{ color: 'text.disabled', mt: 1, display: 'block' }}>
                                        {selectedFileKeys.length === 0 ? '파일을 선택하지 않으면 모든 파일이 전송됩니다'
                                            : selectedFileKeys.length < files.length ? `선택된 ${selectedFileKeys.length}개 파일만 서버에 전송됩니다`
                                            : '모든 파일이 SFTP로 서버에 전송되어 컨테이너에 마운트됩니다'}
                                    </Typography>
                                    {getRunPreset()?.category === 'LLM' && (
                                        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1.5, backgroundColor: alpha('#6C63FF', 0.06), border: `1px solid ${alpha('#6C63FF', 0.12)}` }}>
                                            <Typography variant="caption" sx={{ fontWeight: 600, color: '#6C63FF', display: 'block', mb: 0.5 }}>
                                                LLM 학습 데이터 포맷 안내
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                                                CSV, JSON, JSONL, TXT, Parquet 지원{'\n'}
                                                컬럼: <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'text.primary' }}>text</Typography> (단일 텍스트) 또는{' '}
                                                <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'text.primary' }}>instruction/input/output</Typography> 또는{' '}
                                                <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'text.primary' }}>prompt/completion</Typography>{'\n'}
                                                자동 감지되므로 파일만 업로드하면 됩니다
                                            </Typography>
                                        </Box>
                                    )}
                                </>
                            ) : (
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mb: 1 }}>업로드된 파일이 없습니다. 파일 관리 탭에서 학습 데이터를 먼저 업로드하세요.</Typography>
                                    <Button size="small" variant="outlined" onClick={() => { setRunDialog(false); setTab(2); }}>파일 관리로 이동</Button>
                                </Box>
                            )}
                        </Box>
                    )}

                    {/* 원격 경로 입력 */}
                    {dataSourceType === 'remote_path' && (
                        <Box sx={{ p: 2, mb: 2, borderRadius: 2, backgroundColor: alpha('#ff9800', 0.08), border: 1, borderColor: alpha('#ff9800', 0.2) }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                <Storage sx={{ fontSize: 18, color: 'warning.main' }} />
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.main' }}>원격 서버 데이터 경로</Typography>
                            </Box>
                            <TextField fullWidth label="서버 내 데이터 경로" value={remoteDataPath}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemoteDataPath(e.target.value)}
                                placeholder="/data/datasets/coco128" sx={{ mb: 1 }} size="small"
                                helperText="학습 서버에 이미 존재하는 데이터셋 경로를 입력하세요"
                            />
                        </Box>
                    )}

                    {/* 마운트 경로 */}
                    {dataSourceType !== 'none' && (
                        <TextField fullWidth label="컨테이너 마운트 경로" value={containerMountPath}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContainerMountPath(e.target.value)}
                            sx={{ mb: 2 }} size="small"
                            helperText="학습 코드에서 이 경로로 데이터에 접근합니다 (예: data=/workspace/data/data.yaml)"
                        />
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setRunDialog(false)} color="inherit">취소</Button>
                    <Button variant="contained" startIcon={<PlayArrow />} onClick={handleCreateRun}
                        disabled={!selectedExp || (dataSourceType === 'remote_path' && !remoteDataPath)}>
                        실행
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            {/* 파일 이름 변경 다이얼로그 */}
            <Dialog open={renameDialog.open} onClose={() => setRenameDialog({ open: false, key: '', name: '' })} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>파일 이름 변경</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        label="새 파일 이름"
                        value={renameValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
                        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') handleRenameFile(); }}
                        sx={{ mt: 1 }}
                        size="small"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRenameDialog({ open: false, key: '', name: '' })} color="inherit">취소</Button>
                    <Button onClick={handleRenameFile} variant="contained" disabled={!renameValue.trim() || renameValue.trim() === renameDialog.name}>변경</Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} variant="filled">
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
