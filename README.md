# AI Training Management Platform

AI 학습 실행을 중앙에서 관리하는 풀스택 플랫폼입니다.

## 🏗️ 아키텍처

```
[Browser] → [Nginx + React] → [FastAPI] → [Celery Worker] → [Runner Agent]
                                  ↕            ↕                   ↕
                              [PostgreSQL]  [Redis]           [Docker GPU]
                              [MinIO S3]
```

- **Web**: React 18 + TypeScript + MUI (다크 테마)
- **API**: FastAPI (REST + WebSocket)
- **Worker**: Celery (Redis broker)
- **Runner**: 학습 서버별 Agent (Docker 기반 실행)
- **Storage**: PostgreSQL (메타데이터), MinIO (아티팩트), Redis (큐/캐시)

## 🚀 빠른 시작

### 1. 환경 변수 설정
```bash
cp .env.example .env
# .env 파일을 열어 비밀번호와 키를 수정하세요
```

### 2. 중앙 서버 실행
```bash
docker-compose up -d
```

서비스가 모두 시작되면:
- **Web UI**: http://localhost
- **API Docs**: http://localhost:8000/docs
- **MinIO Console**: http://localhost:9001

### 3. 학습 서버에 Runner 배포
```bash
# 학습 서버에서 실행
docker-compose -f docker-compose.runner.yml up -d
```

## 📁 프로젝트 구조

```
├── docker-compose.yml          # 중앙 서버 (6 services)
├── docker-compose.runner.yml   # Runner Agent
├── .env.example                # 환경 변수 템플릿
├── backend/                    # FastAPI + Celery
│   ├── app/
│   │   ├── main.py             # FastAPI entry
│   │   ├── models/             # SQLAlchemy ORM
│   │   ├── schemas/            # Pydantic schemas
│   │   ├── api/                # API routes
│   │   ├── worker/             # Celery tasks
│   │   └── utils/              # Auth 등
│   └── Dockerfile
├── runner/                     # Runner Agent
│   ├── agent/
│   │   ├── main.py             # Agent API
│   │   ├── job_manager.py      # Docker 실행 관리
│   │   ├── log_collector.py    # 로그 수집
│   │   ├── resource_monitor.py # GPU 모니터링
│   │   └── uploader.py         # MinIO 업로드
│   └── Dockerfile
└── frontend/                   # React + TS + MUI
    ├── src/
    │   ├── pages/              # 페이지 컴포넌트
    │   ├── components/         # 재사용 컴포넌트
    │   ├── api/                # API client
    │   └── theme/              # MUI 테마
    ├── nginx.conf
    └── Dockerfile
```

## 🖥️ 주요 화면

| 화면 | 설명 |
|------|------|
| 대시보드 | 서버 상태, 최근 Run, 실패 알림 |
| 프로젝트 | 프로젝트 CRUD, 멤버 관리 |
| 실험 템플릿 | Docker 이미지, 파라미터 정의 |
| Run 상세 | Summary, 실시간 로그, 아티팩트 |
| 서버 관리 | Runner 상태, GPU 사용률 |

## 🔑 API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 (JWT) |
| GET | `/api/projects/` | 프로젝트 목록 |
| POST | `/api/projects/{id}/runs/` | Run 생성 |
| WS | `/ws/logs/{run_id}` | 실시간 로그 |
| GET | `/api/dashboard/stats` | 대시보드 통계 |
| POST | `/api/runners/register` | Runner 등록 |

## ⚙️ 설정

| 환경 변수 | 기본값 | 설명 |
|-----------|--------|------|
| `DATABASE_URL` | `postgresql://...` | DB 연결 |
| `REDIS_URL` | `redis://redis:6379/0` | Redis |
| `MINIO_ENDPOINT` | `minio:9000` | MinIO |
| `JWT_SECRET_KEY` | (변경 필수) | JWT 시크릿 |
| `RUNNER_TOKEN` | (변경 필수) | Runner 인증 |
| `GPU_ENABLED` | `false` | GPU 사용 여부 |

## 📝 라이선스

MIT