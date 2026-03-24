"""
Celery tasks — Run 스케줄링, 중지, 모니터링 (SSH Agentless 방식)
"""
import logging
import json
import io
import zipfile
import posixpath
from datetime import datetime
import paramiko
import redis
import boto3
from botocore.exceptions import ClientError

from celery import shared_task
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app import models  # Import all models for SQLAlchemy relationship initialization
from app.models.run import Run, RunStatus
from app.models.server import Server, ServerStatus
from app.models.user import User
from app.models.project import Project
from app.config import settings
from app.utils.email import send_run_completed_email

logger = logging.getLogger(__name__)


def _get_db() -> Session:
    return SessionLocal()


def _notify_run_finished(db: Session, run: Run):
    """Run 완료 시 이메일 알림을 발송합니다 (notify_email=True 인 사용자만)."""
    try:
        if not run.created_by:
            return
        user = db.query(User).filter(User.id == run.created_by).first()
        if not user or not user.notify_email:
            return

        project = db.query(Project).filter(Project.id == run.project_id).first()
        project_name = project.name if project else ""
        run_name = run.name or str(run.id)[:8]

        send_run_completed_email(
            to_email=user.email,
            username=user.full_name or user.username,
            run_name=run_name,
            status=run.status.value,
            project_name=project_name,
        )
    except Exception as e:
        logger.error(f"Failed to send notification for run {run.id}: {e}")


def _get_s3():
    return boto3.client(
        "s3",
        endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name="us-east-1",
    )


def _exec_ssh_wait(ssh, cmd: str, timeout: int | None = None) -> tuple:
    """SSH 명령 실행 후 완료까지 대기합니다."""
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    exit_status = stdout.channel.recv_exit_status()
    return stdout.read().decode("utf-8"), stderr.read().decode("utf-8"), exit_status


def _is_ssh_reachable(server: Server, timeout: int = 15) -> bool:
    """서버 SSH 접속 가능 여부를 빠르게 확인합니다."""
    if not (server and server.ssh_host and server.ssh_user and server.ssh_password):
        return False

    probe = paramiko.SSHClient()
    probe.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        probe.connect(
            hostname=server.ssh_host,
            port=server.ssh_port,
            username=server.ssh_user,
            password=server.ssh_password,
            timeout=timeout,
        )
        return True
    except Exception as e:
        logger.warning(f"Server {server.name} SSH probe failed: {e}")
        return False
    finally:
        try:
            probe.close()
        except Exception:
            pass


def _download_project_files(ssh, project_id: str, run_id: str, selected_files: list | None = None) -> str | None:
    """
    MinIO presigned URL을 생성하여 원격 서버에서 직접 다운로드합니다.
    Worker가 데이터를 중계하지 않으므로 대용량 파일도 빠르게 전송됩니다.
    """
    s3 = _get_s3()
    prefix = f"projects/{project_id}/files/"

    try:
        objects = []
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=settings.MINIO_BUCKET_NAME, Prefix=prefix):
            objects.extend(page.get("Contents", []))
    except ClientError:
        logger.warning(f"Failed to list files from MinIO for project {project_id}")
        return None

    if not objects:
        return None

    if selected_files:
        selected_set = set(selected_files)
        objects = [obj for obj in objects if obj["Key"] in selected_set]
        if not objects:
            return None

    remote_dir = f"/tmp/aitrain/{run_id}/data"
    _exec_ssh_wait(ssh, f"mkdir -p {remote_dir}")

    # 원격 서버에서 접근 가능한 MinIO 엔드포인트 결정
    if settings.MINIO_EXTERNAL_ENDPOINT:
        ext_endpoint = settings.MINIO_EXTERNAL_ENDPOINT
    else:
        # Docker 내부 주소 → 호스트 머신 IP로 자동 변환
        import socket
        try:
            # Docker 컨테이너에서 default gateway = 호스트 IP
            s_tmp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s_tmp.connect(("8.8.8.8", 80))
            host_ip = s_tmp.getsockname()[0]
            s_tmp.close()
        except Exception:
            host_ip = "host.docker.internal"
        minio_port = settings.MINIO_ENDPOINT.split(":")[-1] if ":" in settings.MINIO_ENDPOINT else "9000"
        ext_endpoint = f"http://{host_ip}:{minio_port}"
    logger.info(f"Using external MinIO endpoint: {ext_endpoint}")

    # presigned URL용 S3 클라이언트 (외부 접근 가능한 엔드포인트)
    s3_ext = boto3.client(
        "s3",
        endpoint_url=ext_endpoint,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name="us-east-1",
    )

    for obj in objects:
        key = obj["Key"]
        rel_path = key[len(prefix):]
        if not rel_path:
            continue

        size_mb = obj.get("Size", 0) / (1024 * 1024)

        # presigned URL 생성 (1시간 유효)
        try:
            url = s3_ext.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.MINIO_BUCKET_NAME, "Key": key},
                ExpiresIn=3600,
            )
        except Exception as e:
            logger.warning(f"Failed to generate presigned URL for {key}: {e}")
            continue

        remote_path = f"{remote_dir}/{rel_path}"
        remote_subdir = "/".join(remote_path.split("/")[:-1])
        _exec_ssh_wait(ssh, f"mkdir -p {remote_subdir}")

        # 원격 서버에서 직접 다운로드 (wget 사용)
        logger.info(f"Downloading {key} ({size_mb:.1f} MB) directly to remote server...")
        out, err, exit_code = _exec_ssh_wait(
            ssh,
            f"wget -q -O '{remote_path}' '{url}'",
            timeout=1800,  # 30분 타임아웃
        )
        if exit_code != 0:
            logger.warning(f"wget failed for {key} (exit={exit_code}): {err}")
            # wget 실패 시 SFTP 폴백
            logger.info(f"Falling back to SFTP upload for {key}")
            try:
                file_obj = s3.get_object(Bucket=settings.MINIO_BUCKET_NAME, Key=key)
                file_data = file_obj["Body"].read()
                sftp = ssh.open_sftp()
                try:
                    with sftp.file(remote_path, "wb") as f:
                        f.write(file_data)
                finally:
                    sftp.close()
            except Exception as e2:
                logger.warning(f"SFTP fallback also failed for {key}: {e2}")
                continue
        else:
            logger.info(f"Downloaded {key} -> {remote_path}")

        # ZIP 파일 자동 압축 해제
        if rel_path.lower().endswith(".zip"):
            try:
                out, err, exit_code = _exec_ssh_wait(
                    ssh,
                    f"cd {remote_dir} && unzip -o -q '{remote_path}' && rm -f '{remote_path}'",
                    timeout=600,
                )
                if exit_code == 0:
                    logger.info(f"Extracted zip on remote server: {remote_path}")
                else:
                    logger.warning(f"unzip failed (exit={exit_code}): {err}")
            except Exception as e:
                logger.warning(f"Failed to extract zip {key}: {e}")

    # data.yaml이 하위 폴더에만 있는 경우 루트로 복사
    _exec_ssh_wait(
        ssh,
        (
            f"if [ ! -f {remote_dir}/data.yaml ]; then "
            f"found=$(find {remote_dir} -type f -name data.yaml | head -n 1); "
            f"if [ -n \"$found\" ]; then cp \"$found\" {remote_dir}/data.yaml; fi; "
            f"fi"
        )
    )

    return remote_dir


_LLM_TRAIN_SCRIPT = r'''#!/usr/bin/env python3
"""Auto-generated LLM SFT training script."""
import subprocess, sys, os, glob, json

# ── 1. Install required packages ─────────────────────
print("[SETUP] Installing required packages...", flush=True)
subprocess.check_call([
    sys.executable, "-m", "pip", "install", "-q",
    "trl>=0.9", "peft", "bitsandbytes", "datasets", "accelerate",
], stdout=sys.stderr)
print("[SETUP] Packages installed.", flush=True)

import torch
from datasets import load_dataset, Dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig, TrainingArguments
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer, SFTConfig

# ── 2. Auto-detect data files ────────────────────────
DATA_DIR = os.environ.get("DATA_DIR", "/workspace/data")
SUPPORTED_EXT = {".csv", ".json", ".jsonl", ".parquet", ".txt"}

def find_data_files(data_dir):
    files = {}
    for ext in SUPPORTED_EXT:
        found = glob.glob(os.path.join(data_dir, f"**/*{ext}"), recursive=True)
        if found:
            files[ext] = found
    return files

data_files = find_data_files(DATA_DIR)
if not data_files:
    print(f"[ERROR] No data files found in {DATA_DIR}. Supported: {SUPPORTED_EXT}", flush=True)
    sys.exit(1)

# Pick the first available data file (priority: jsonl > json > csv > parquet > txt)
priority = [".jsonl", ".json", ".csv", ".parquet", ".txt"]
data_file = None
for ext in priority:
    if ext in data_files:
        data_file = data_files[ext][0]
        break

print(f"[DATA] Using data file: {data_file}", flush=True)

# ── 3. Load dataset ──────────────────────────────────
ext = os.path.splitext(data_file)[1].lower()
if ext == ".jsonl":
    dataset = load_dataset("json", data_files=data_file, split="train")
elif ext == ".json":
    # Handle both array-of-objects and {"data": [...]} formats
    with open(data_file, "r", encoding="utf-8") as f:
        raw = json.load(f)
    if isinstance(raw, list):
        dataset = Dataset.from_list(raw)
    elif isinstance(raw, dict):
        # Find the first list value
        for v in raw.values():
            if isinstance(v, list):
                dataset = Dataset.from_list(v)
                break
        else:
            print("[ERROR] JSON file must contain an array of objects.", flush=True)
            sys.exit(1)
elif ext == ".csv":
    dataset = load_dataset("csv", data_files=data_file, split="train")
elif ext == ".parquet":
    dataset = load_dataset("parquet", data_files=data_file, split="train")
elif ext == ".txt":
    dataset = load_dataset("text", data_files=data_file, split="train")
else:
    print(f"[ERROR] Unsupported format: {ext}", flush=True)
    sys.exit(1)

print(f"[DATA] Loaded {len(dataset)} samples. Columns: {dataset.column_names}", flush=True)

# ── 4. Auto-format: instruction/input/output → text ──
TEXT_FIELD = os.environ.get("TEXT_FIELD", "text")
cols = dataset.column_names

if TEXT_FIELD not in cols:
    # Try to build 'text' from common column patterns
    if "instruction" in cols:
        def format_row(row):
            parts = []
            if row.get("instruction"):
                parts.append(f"### Instruction:\n{row['instruction']}")
            if row.get("input"):
                parts.append(f"### Input:\n{row['input']}")
            if row.get("output"):
                parts.append(f"### Response:\n{row['output']}")
            elif row.get("response"):
                parts.append(f"### Response:\n{row['response']}")
            return {"text": "\n\n".join(parts)}
        dataset = dataset.map(format_row)
        TEXT_FIELD = "text"
        print("[DATA] Auto-formatted instruction/input/output → text", flush=True)
    elif "prompt" in cols and ("completion" in cols or "response" in cols):
        resp_col = "completion" if "completion" in cols else "response"
        def format_row(row):
            return {"text": f"### Prompt:\n{row['prompt']}\n\n### Response:\n{row[resp_col]}"}
        dataset = dataset.map(format_row)
        TEXT_FIELD = "text"
        print("[DATA] Auto-formatted prompt/completion → text", flush=True)
    elif "question" in cols and "answer" in cols:
        def format_row(row):
            return {"text": f"### Question:\n{row['question']}\n\n### Answer:\n{row['answer']}"}
        dataset = dataset.map(format_row)
        TEXT_FIELD = "text"
        print("[DATA] Auto-formatted question/answer → text", flush=True)
    elif len(cols) == 1:
        TEXT_FIELD = cols[0]
        print(f"[DATA] Using single column '{TEXT_FIELD}' as text field", flush=True)
    else:
        print(f"[ERROR] Cannot find '{TEXT_FIELD}' column. Available: {cols}", flush=True)
        print("[HINT] Use columns: 'text', 'instruction/input/output', 'prompt/completion', or 'question/answer'", flush=True)
        sys.exit(1)

# ── 5. Parse training params from env ─────────────────
MODEL_NAME = os.environ.get("MODEL_NAME", "Qwen/Qwen2.5-1.5B")
NUM_EPOCHS = int(os.environ.get("NUM_EPOCHS", "3"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "4"))
LR = float(os.environ.get("LEARNING_RATE", "2e-4"))
MAX_SEQ_LEN = int(os.environ.get("MAX_SEQ_LENGTH", "2048"))
LORA_R = int(os.environ.get("LORA_R", "16"))
LORA_ALPHA = int(os.environ.get("LORA_ALPHA", "32"))
LORA_DROPOUT = float(os.environ.get("LORA_DROPOUT", "0.05"))
GRAD_ACCUM = int(os.environ.get("GRADIENT_ACCUMULATION_STEPS", "4"))
WARMUP_RATIO = float(os.environ.get("WARMUP_RATIO", "0.03"))
WEIGHT_DECAY = float(os.environ.get("WEIGHT_DECAY", "0.001"))
USE_4BIT = os.environ.get("LOAD_IN_4BIT", "true").lower() == "true"
USE_FP16 = os.environ.get("FP16", "true").lower() == "true"
USE_BF16 = os.environ.get("BF16", "false").lower() == "true"
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/workspace/output")

print(f"[CONFIG] Model: {MODEL_NAME}", flush=True)
print(f"[CONFIG] Epochs: {NUM_EPOCHS}, Batch: {BATCH_SIZE}, LR: {LR}", flush=True)
print(f"[CONFIG] LoRA r={LORA_R}, alpha={LORA_ALPHA}, 4bit={USE_4BIT}", flush=True)
print(f"[CONFIG] Max seq length: {MAX_SEQ_LEN}", flush=True)

# ── 6. Load model & tokenizer ────────────────────────
print(f"[MODEL] Loading {MODEL_NAME}...", flush=True)

bnb_config = None
if USE_4BIT:
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16 if USE_FP16 else torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

if USE_4BIT:
    model = prepare_model_for_kbit_training(model)

# ── 7. LoRA config ────────────────────────────────────
lora_config = LoraConfig(
    r=LORA_R,
    lora_alpha=LORA_ALPHA,
    lora_dropout=LORA_DROPOUT,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules="all-linear",
)

print("[MODEL] Model loaded. Starting training...", flush=True)

# ── 8. Training ──────────────────────────────────────
training_args = SFTConfig(
    output_dir=OUTPUT_DIR,
    num_train_epochs=NUM_EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=GRAD_ACCUM,
    learning_rate=LR,
    warmup_ratio=WARMUP_RATIO,
    weight_decay=WEIGHT_DECAY,
    fp16=USE_FP16 and not USE_BF16,
    bf16=USE_BF16,
    logging_steps=1,
    save_strategy="epoch",
    max_seq_length=MAX_SEQ_LEN,
    dataset_text_field=TEXT_FIELD,
    packing=False,
    report_to="none",
)

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    peft_config=lora_config,
    args=training_args,
    tokenizer=tokenizer,
)

trainer.train()

# ── 9. Save ──────────────────────────────────────────
print(f"[DONE] Saving model to {OUTPUT_DIR}...", flush=True)
trainer.save_model(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print("[DONE] Training complete!", flush=True)
'''


def _is_llm_run(run: Run) -> bool:
    """LLM 파인튜닝 실행인지 판별합니다."""
    entrypoint = (run.command or "").lower()
    image = (run.docker_image or "").lower()
    return ("trl" in entrypoint or "sft" in entrypoint or
            "huggingface" in image or "transformers" in image or
            "llm" in image)


LLM_DOCKER_IMAGE = "pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime"


def _prepare_llm_run(ssh, run: Run, data_dir: str | None) -> tuple:
    """
    LLM 학습 Run에 대해 래퍼 스크립트를 업로드하고
    Docker 커맨드에 필요한 환경변수/볼륨/커맨드/이미지를 반환합니다.
    Returns: (extra_env_str, extra_volume_str, command_override, image_override)
    """
    run_id = str(run.id)
    script_dir = f"/tmp/aitrain/{run_id}/scripts"
    _exec_ssh_wait(ssh, f"mkdir -p {script_dir}")

    # Upload training script
    sftp = ssh.open_sftp()
    try:
        with sftp.file(f"{script_dir}/_train.py", "w") as f:
            f.write(_LLM_TRAIN_SCRIPT)
    finally:
        sftp.close()

    # Extract params from run to env vars
    params = run.params or {}
    env_map = {
        "model": "MODEL_NAME",
        "num_train_epochs": "NUM_EPOCHS",
        "per_device_train_batch_size": "BATCH_SIZE",
        "learning_rate": "LEARNING_RATE",
        "max_seq_length": "MAX_SEQ_LENGTH",
        "lora_r": "LORA_R",
        "lora_alpha": "LORA_ALPHA",
        "lora_dropout": "LORA_DROPOUT",
        "gradient_accumulation_steps": "GRADIENT_ACCUMULATION_STEPS",
        "warmup_ratio": "WARMUP_RATIO",
        "weight_decay": "WEIGHT_DECAY",
        "load_in_4bit": "LOAD_IN_4BIT",
        "fp16": "FP16",
        "bf16": "BF16",
        "dataset_text_field": "TEXT_FIELD",
    }

    env_parts = []
    for param_key, env_key in env_map.items():
        val = params.get(param_key)
        if val is not None:
            env_parts.append(f"-e {env_key}='{val}'")

    # Data dir env
    mount_path = run.container_mount_path or "/workspace/data"
    env_parts.append(f"-e DATA_DIR='{mount_path}'")

    extra_env = " ".join(env_parts)
    extra_volume = f"-v {script_dir}:/workspace/scripts"
    command = "python /workspace/scripts/_train.py"

    return extra_env, extra_volume, command, LLM_DOCKER_IMAGE


@shared_task(name="app.worker.tasks.schedule_run", bind=True, max_retries=5)
def schedule_run(self, run_id: str):
    """
    Run을 서버에서 백그라운드로 실행합니다. (SSH Docker run)
    """
    db = _get_db()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            return

        if run.status != RunStatus.QUEUED:
            return

        # 서버 미지정 시 자동 선택 (ONLINE + SSH 접속 가능 서버 우선)
        if not run.server_id:
            online_candidates = (
                db.query(Server)
                .filter(
                    Server.status == ServerStatus.ONLINE,
                    Server.ssh_host.isnot(None),
                    Server.ssh_user.isnot(None),
                    Server.ssh_password.isnot(None),
                )
                .order_by(Server.updated_at.desc())
                .all()
            )

            candidate = None
            for srv in online_candidates:
                if _is_ssh_reachable(srv):
                    candidate = srv
                    break
                # SSH 체크 실패해도 바로 OFFLINE으로 바꾸지 않음 (일시적 네트워크 문제일 수 있음)
                logger.warning(f"Server {srv.name} SSH probe failed during selection, skipping")

            # ONLINE 접속 가능 서버가 없으면, 전체 서버 중 SSH 접속 가능 서버로 폴백
            if candidate is None:
                all_candidates = (
                    db.query(Server)
                    .filter(
                        Server.ssh_host.isnot(None),
                        Server.ssh_user.isnot(None),
                        Server.ssh_password.isnot(None),
                    )
                    .order_by(Server.updated_at.desc())
                    .all()
                )
                for srv in all_candidates:
                    if _is_ssh_reachable(srv):
                        candidate = srv
                        break

            if not candidate:
                run.status = RunStatus.FAILED
                run.error_message = "No available server for auto selection"
                db.commit()
                return

            run.server_id = candidate.id
            db.commit()
            logger.info(f"Auto-selected server {candidate.name} ({candidate.id}) for run {run_id}")

        server = db.query(Server).filter(Server.id == run.server_id).first()
        if not server or not server.ssh_host:
            run.status = RunStatus.FAILED
            run.error_message = "Server not available or missing SSH credentials"
            db.commit()
            return

        run.status = RunStatus.SCHEDULED
        db.commit()

        # Build Docker command
        # GPU 지원 활성
        gpu_flag = "--gpus all" if settings.GPU_ENABLED else ""

        # Env vars
        env_str = " ".join([f"-e {k}='{v}'" for k, v in (run.env_vars or {}).items()])

        container_name = f"aitrain_run_{run_id}"

        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(
                hostname=server.ssh_host,
                port=server.ssh_port,
                username=server.ssh_user,
                password=server.ssh_password,
                timeout=20
            )

            # 먼저 동일한 이름의 컨테이너가 있으면 삭제
            _exec_ssh_wait(ssh, f"docker rm -f {container_name}")

            # 데이터 소스 타입에 따라 볼륨 마운트 결정
            mount_path = run.container_mount_path or "/workspace/data"
            volume_flag = ""
            data_dir = None

            data_source = run.data_source_type or "project_files"

            if data_source == "remote_path" and run.remote_data_path:
                # 원격 서버에 이미 존재하는 데이터 경로를 직접 마운트
                remote_path = run.remote_data_path.strip()
                # 경로 존재 여부 확인
                out, err, exit_code = _exec_ssh_wait(ssh, f"test -d {remote_path} && echo EXISTS")
                if "EXISTS" not in out:
                    raise Exception(f"Remote data path does not exist: {remote_path}")
                volume_flag = f"-v {remote_path}:{mount_path}"
                logger.info(f"Using remote data path: {remote_path} -> {mount_path}")

            elif data_source == "project_files":
                # MinIO에서 프로젝트 파일 다운로드 후 마운트
                data_dir = _download_project_files(ssh, str(run.project_id), run_id, run.selected_files)
                if data_dir:
                    volume_flag = f"-v {data_dir}:{mount_path}"

            # data_source == "none" 이면 볼륨 마운트 없음

            # LLM 학습인 경우 래퍼 스크립트 사용
            final_command = run.command
            docker_image = run.docker_image
            if _is_llm_run(run):
                llm_env, llm_vol, llm_cmd, llm_image = _prepare_llm_run(ssh, run, data_dir if data_source == "project_files" else None)
                env_str = f"{env_str} {llm_env}".strip()
                volume_flag = f"{volume_flag} {llm_vol}".strip()
                final_command = llm_cmd
                docker_image = llm_image

            cmd = f"docker run -d --name {container_name} --shm-size=4g {gpu_flag} {volume_flag} {env_str} {docker_image} {final_command}"
            logger.info(f"Executing: {cmd} on {server.name}")

            stdin, stdout, stderr = ssh.exec_command(cmd)
            exit_status = stdout.channel.recv_exit_status()

            if exit_status != 0:
                error_output = stderr.read().decode('utf-8')
                raise Exception(f"Docker run failed: {error_output}")

            run.status = RunStatus.RUNNING
            run.started_at = datetime.utcnow()
            db.commit()
            ssh.close()

            # 로그 스트리밍 태스크 비동기 시작
            stream_logs_task.delay(run_id, str(server.id), container_name)

        except Exception as e:
            logger.error(f"Failed to start run {run_id} via SSH: {e}")
            # SSH 연결 실패 시 서버 상태를 OFFLINE으로 내려 재시도에서 제외합니다.
            if server:
                server.status = ServerStatus.OFFLINE
            run.retry_count += 1

            # 최대 재시도 초과 시 FAILED 처리
            if self.request.retries >= self.max_retries:
                run.status = RunStatus.FAILED
                run.error_message = str(e)[:1000]
                run.finished_at = datetime.utcnow()
                db.commit()
                _notify_run_finished(db, run)
                logger.error(f"Run {run_id} permanently failed after {self.max_retries} retries")
                return

            run.status = RunStatus.QUEUED
            db.commit()
            raise self.retry(countdown=30)

    except Exception as e:
        logger.error(f"Error scheduling run {run_id}: {e}")
        # 예상치 못한 에러로도 FAILED 처리
        try:
            run = db.query(Run).filter(Run.id == run_id).first()
            if run and run.status not in (RunStatus.RUNNING, RunStatus.SUCCESS):
                run.status = RunStatus.FAILED
                run.error_message = str(e)[:1000]
                run.finished_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()


@shared_task(name="app.worker.tasks.stream_logs")
def stream_logs_task(run_id: str, server_id: str, container_name: str):
    """지정된 장기 실행 SSH 세션을 열어 로그를 Redis에 Pub 합니다."""
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    channel = f"logs:{run_id}"
    history_key = f"logs_history:{run_id}"

    def _publish_and_store(message: str):
        redis_client.publish(channel, message)
        redis_client.rpush(history_key, message)
        redis_client.ltrim(history_key, -5000, -1)

    # DB 조회만 하고 커넥션은 닫음
    db = _get_db()
    try:
        server = db.query(Server).filter(Server.id == server_id).first()
        if not server:
            return

        # 접속 정보 복사
        ssh_host = server.ssh_host
        ssh_port = server.ssh_port
        ssh_user = server.ssh_user
        ssh_password = server.ssh_password
    finally:
        db.close()

    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(
            hostname=ssh_host,
            port=ssh_port,
            username=ssh_user,
            password=ssh_password,
            timeout=10
        )
        _publish_and_store("[SYSTEM] Connected to server for log streaming...\\n")

        # 이미 저장된 로그는 history API로 제공하므로, WebSocket은 신규 라인만 스트리밍
        stdin, stdout, stderr = ssh.exec_command(f"docker logs --tail 0 -f {container_name}", get_pty=True)

        # stdout.readline() blocks until a line is printed or the stream is closed
        for line in iter(stdout.readline, ""):
            _publish_and_store(line)

        _publish_and_store("\\n[SYSTEM] Log stream ended.\\n")
        ssh.close()
    except Exception as e:
        logger.error(f"Log streaming failed for run {run_id}: {e}")
        _publish_and_store(f"\\n[SYSTEM ERROR] Log stream disconnected: {e}\\n")


@shared_task(name="app.worker.tasks.stop_run_task")
def stop_run_task(run_id: str):
    """서버에 SSH 접속해서 docker stop 을 호출합니다."""
    db = _get_db()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run or not run.server_id:
            return

        server = db.query(Server).filter(Server.id == run.server_id).first()
        if not server:
            return

        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(
                hostname=server.ssh_host,
                port=server.ssh_port,
                username=server.ssh_user,
                password=server.ssh_password,
                timeout=10
            )
            container_name = f"aitrain_run_{run_id}"
            ssh.exec_command(f"docker stop -t 10 {container_name}")
            ssh.close()
        except Exception as e:
            logger.error(f"Failed to stop run {run_id}: {e}")

    finally:
        db.close()


@shared_task(name="app.worker.tasks.monitor_run_status")
def monitor_run_status():
    """주기적으로 RUNNING 중인 컨테이너 상태를 검사합니다."""
    db = _get_db()
    try:
        active_runs = db.query(Run).filter(Run.status == RunStatus.RUNNING).all()
        for run in active_runs:
            server = db.query(Server).filter(Server.id == run.server_id).first()
            if not server:
                continue

            try:
                ssh = paramiko.SSHClient()
                ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                ssh.connect(
                    hostname=server.ssh_host,
                    port=server.ssh_port,
                    username=server.ssh_user,
                    password=server.ssh_password,
                    timeout=10
                )
                container_name = f"aitrain_run_{run.id}"

                # inspect container status
                # Returns JSON array of the container state
                cmd = f"docker inspect -f '{{{{json .State}}}}' {container_name}"
                stdin, stdout, stderr = ssh.exec_command(cmd)
                output = stdout.read().decode('utf-8').strip()
                ssh.close()

                if not output:
                    # Container not found (maybe manually deleted)
                    run.status = RunStatus.FAILED
                    run.error_message = "Container deleted unexpectedly"
                    run.finished_at = datetime.utcnow()
                    db.commit()
                    _notify_run_finished(db, run)
                    continue

                state = json.loads(output)
                if state.get("Running") is False:
                    # Container stopped
                    exit_code = state.get("ExitCode", 1)
                    if exit_code == 0:
                        run.status = RunStatus.SUCCESS
                    else:
                        run.status = RunStatus.FAILED
                        run.error_message = state.get("Error") or f"Exited with code {exit_code}"
                    run.finished_at = datetime.utcnow()
                    _notify_run_finished(db, run)
                    db.commit()

            except Exception as e:
                logger.error(f"Failed to monitor run {run.id}: {e}")

    finally:
        db.close()
