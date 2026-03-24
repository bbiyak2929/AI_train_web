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


def _exec_ssh_wait(ssh, cmd: str) -> tuple:
    """SSH 명령 실행 후 완료까지 대기합니다."""
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    return stdout.read().decode("utf-8"), stderr.read().decode("utf-8"), exit_status


def _is_ssh_reachable(server: Server, timeout: int = 5) -> bool:
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
    MinIO에서 프로젝트 파일 목록을 조회하고, 원격 서버에 다운로드합니다.
    selected_files가 지정되면 해당 key의 파일만 다운로드합니다.
    다운로드된 경로를 반환합니다 (파일이 없으면 None).
    """
    s3 = _get_s3()
    prefix = f"projects/{project_id}/files/"

    try:
        # 페이지네이션 처리 (1000개 이상 파일 지원)
        objects = []
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=settings.MINIO_BUCKET_NAME, Prefix=prefix):
            objects.extend(page.get("Contents", []))
    except ClientError:
        logger.warning(f"Failed to list files from MinIO for project {project_id}")
        return None

    if not objects:
        return None

    # 선택된 파일만 필터링
    if selected_files:
        selected_set = set(selected_files)
        objects = [obj for obj in objects if obj["Key"] in selected_set]
        if not objects:
            return None

    remote_dir = f"/tmp/aitrain/{run_id}/data"

    # 리모트 디렉토리 생성 (완료 대기)
    _exec_ssh_wait(ssh, f"mkdir -p {remote_dir}")

    sftp = ssh.open_sftp()
    try:
        for obj in objects:
            key = obj["Key"]
            rel_path = key[len(prefix):]
            if not rel_path:
                continue

            # MinIO에서 파일 데이터 가져오기
            try:
                file_obj = s3.get_object(Bucket=settings.MINIO_BUCKET_NAME, Key=key)
                file_data = file_obj["Body"].read()
            except ClientError:
                logger.warning(f"Failed to download {key} from MinIO")
                continue

            # 원격 서버에 디렉터리 생성 후 파일 전송
            remote_path = f"{remote_dir}/{rel_path}"
            remote_subdir = "/".join(remote_path.split("/")[:-1])
            _exec_ssh_wait(ssh, f"mkdir -p {remote_subdir}")

            with sftp.file(remote_path, "wb") as f:
                f.write(file_data)

            logger.info(f"Uploaded {key} -> {remote_path}")

            # ZIP 파일은 원격 데이터 디렉터리로 자동 압축 해제합니다.
            if rel_path.lower().endswith(".zip"):
                try:
                    zf = zipfile.ZipFile(io.BytesIO(file_data))
                    extracted_count = 0
                    for member in zf.infolist():
                        if member.is_dir():
                            continue

                        member_path = member.filename.replace("\\", "/")
                        normalized = posixpath.normpath(member_path)
                        if normalized.startswith("../") or normalized.startswith("/"):
                            continue

                        target_path = f"{remote_dir}/{normalized}"
                        target_subdir = "/".join(target_path.split("/")[:-1])
                        _exec_ssh_wait(ssh, f"mkdir -p {target_subdir}")

                        with sftp.file(target_path, "wb") as ef:
                            ef.write(zf.read(member))
                        extracted_count += 1

                    logger.info(f"Extracted {extracted_count} files from {key}")
                except Exception as e:
                    logger.warning(f"Failed to extract zip {key}: {e}")

        # data.yaml이 하위 폴더에만 있는 경우 루트로 복사하여 기본 경로를 보장합니다.
        _exec_ssh_wait(
            ssh,
            (
                f"if [ ! -f {remote_dir}/data.yaml ]; then "
                f"found=$(find {remote_dir} -type f -name data.yaml | head -n 1); "
                f"if [ -n \"$found\" ]; then cp \"$found\" {remote_dir}/data.yaml; fi; "
                f"fi"
            )
        )
    finally:
        sftp.close()

    return remote_dir


@shared_task(name="app.worker.tasks.schedule_run", bind=True, max_retries=3)
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
                srv.status = ServerStatus.OFFLINE
            if online_candidates:
                db.commit()

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
                timeout=10
            )

            # 먼저 동일한 이름의 컨테이너가 있으면 삭제
            _exec_ssh_wait(ssh, f"docker rm -f {container_name}")

            # 데이터 소스 타입에 따라 볼륨 마운트 결정
            mount_path = run.container_mount_path or "/workspace/data"
            volume_flag = ""

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

            cmd = f"docker run -d --name {container_name} {gpu_flag} {volume_flag} {env_str} {run.docker_image} {run.command}"
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
            run.status = RunStatus.QUEUED
            run.retry_count += 1
            db.commit()
            raise self.retry(countdown=30)

    except Exception as e:
        logger.error(f"Error scheduling run {run_id}: {e}")
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
