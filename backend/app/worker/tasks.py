"""
Celery tasks — Run 스케줄링, 중지, 모니터링 (SSH Agentless 방식)
"""
import logging
import json
from datetime import datetime
import paramiko
import redis
import boto3
from botocore.exceptions import ClientError

from celery import shared_task
from sqlalchemy.orm import Session

from app.database import SessionLocal
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


def _download_project_files(ssh, project_id: str, run_id: str) -> str | None:
    """
    MinIO에서 프로젝트 파일 목록을 조회하고, 원격 서버에 다운로드합니다.
    다운로드된 경로를 반환합니다 (파일이 없으면 None).
    """
    s3 = _get_s3()
    prefix = f"projects/{project_id}/files/"

    try:
        response = s3.list_objects_v2(
            Bucket=settings.MINIO_BUCKET_NAME,
            Prefix=prefix,
        )
    except ClientError:
        logger.warning(f"Failed to list files from MinIO for project {project_id}")
        return None

    objects = response.get("Contents", [])
    if not objects:
        return None

    remote_dir = f"/tmp/aitrain/{run_id}/data"

    # 리모트 디렉토리 생성
    ssh.exec_command(f"mkdir -p {remote_dir}")

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
        ssh.exec_command(f"mkdir -p {remote_subdir}")

        # SFTP로 파일 전송
        sftp = ssh.open_sftp()
        try:
            with sftp.file(remote_path, "wb") as f:
                f.write(file_data)
        finally:
            sftp.close()

        logger.info(f"Uploaded {key} -> {remote_path}")

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

        # 자동 서버 선택 지원안함 (웹 UI에서 선택 필수)
        if not run.server_id:
            logger.error("Auto server selection not implemented yet")
            run.status = RunStatus.FAILED
            run.error_message = "No server_id provided"
            db.commit()
            return

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
            ssh.exec_command(f"docker rm -f {container_name}")

            # 프로젝트 파일 다운로드 (데이터셋/모델 등)
            data_dir = _download_project_files(ssh, str(run.project_id), run_id)
            volume_flag = f"-v {data_dir}:/workspace/data" if data_dir else ""

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
        redis_client.publish(channel, "[SYSTEM] Connected to server for log streaming...\\n")

        # docker logs -f 를 실행하여 stdout을 지속적으로 읽음
        stdin, stdout, stderr = ssh.exec_command(f"docker logs -f {container_name}", get_pty=True)

        # stdout.readline() blocks until a line is printed or the stream is closed
        for line in iter(stdout.readline, ""):
            redis_client.publish(channel, line)

        redis_client.publish(channel, "\\n[SYSTEM] Log stream ended.\\n")
        ssh.close()
    except Exception as e:
        logger.error(f"Log streaming failed for run {run_id}: {e}")
        redis_client.publish(channel, f"\\n[SYSTEM ERROR] Log stream disconnected: {e}\\n")


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
