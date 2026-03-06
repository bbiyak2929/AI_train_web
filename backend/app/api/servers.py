"""
Servers API — 서버 관리 (관리자)
"""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.server import Server, ServerStatus
from app.models.run import Run, RunStatus
from app.schemas.schemas import ServerCreate, ServerUpdate, ServerOut, ServerDashboardCard, ServerGpuStatus, GpuInfo
from app.utils.auth import get_current_user, get_current_superuser
import paramiko

router = APIRouter(prefix="/servers", tags=["Servers"])


@router.post("/", response_model=ServerOut, status_code=201)
def create_server(
    body: ServerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    if db.query(Server).filter(Server.name == body.name).first():
        raise HTTPException(400, "Server name already exists")

    # SSH 접속 테스트
    if body.ssh_host and body.ssh_user and body.ssh_password:
        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(
                hostname=body.ssh_host,
                port=body.ssh_port,
                username=body.ssh_user,
                password=body.ssh_password,
                timeout=5
            )
            # 서버 상태를 ONLINE으로
            body_dict = body.model_dump()
            ssh.close()
        except Exception as e:
            raise HTTPException(400, f"SSH Connection failed: {str(e)}")
    else:
        body_dict = body.model_dump()

    server = Server(**body_dict)
    server.status = ServerStatus.ONLINE if body.ssh_host else ServerStatus.OFFLINE
    
    db.add(server)
    db.commit()
    db.refresh(server)
    return server


@router.get("/", response_model=List[ServerOut])
def list_servers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Server).all()


@router.get("/dashboard", response_model=List[ServerDashboardCard])
def server_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    servers = db.query(Server).all()
    result = []
    for s in servers:
        active = db.query(Run).filter(
            Run.server_id == s.id,
            Run.status == RunStatus.RUNNING,
        ).count()
        queued = db.query(Run).filter(
            Run.server_id == s.id,
            Run.status == RunStatus.QUEUED,
        ).count()
        result.append(ServerDashboardCard(
            id=s.id,
            name=s.name,
            status=s.status,
            gpu_count=s.gpu_count,
            gpu_model=s.gpu_model,
            active_runs=active,
            queued_runs=queued,
        ))
    return result


@router.get("/{server_id}", response_model=ServerOut)
def get_server(
    server_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(404, "Server not found")
    return server


@router.patch("/{server_id}", response_model=ServerOut)
def update_server(
    server_id: UUID,
    body: ServerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(404, "Server not found")

    update_data = body.model_dump(exclude_unset=True)

    # SSH 정보가 업데이트 되었다면 테스트
    test_ssh = False
    if "ssh_host" in update_data or "ssh_user" in update_data or "ssh_password" in update_data:
        test_ssh = True
    
    for field, value in update_data.items():
        setattr(server, field, value)
        
    if test_ssh and server.ssh_host and server.ssh_user and server.ssh_password:
        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(
                hostname=server.ssh_host,
                port=server.ssh_port,
                username=server.ssh_user,
                password=server.ssh_password,
                timeout=5
            )
            server.status = ServerStatus.ONLINE
            ssh.close()
        except Exception as e:
            raise HTTPException(400, f"SSH Connection failed: {str(e)}")

    db.commit()
    db.refresh(server)
    return server


@router.delete("/{server_id}", status_code=204)
def delete_server(
    server_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(404, "Server not found")
    db.delete(server)
    db.commit()


@router.get("/{server_id}/gpu-status", response_model=ServerGpuStatus)
def get_gpu_status(
    server_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(404, "Server not found")

    if not server.ssh_host or not server.ssh_user or not server.ssh_password:
        raise HTTPException(400, "SSH 접속 정보가 없습니다")

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

        # nvidia-smi CSV query
        gpu_cmd = (
            "nvidia-smi --query-gpu=index,name,temperature.gpu,utilization.gpu,"
            "memory.used,memory.total,memory.free,power.draw,power.limit,fan.speed "
            "--format=csv,noheader,nounits"
        )
        _, stdout_gpu, stderr_gpu = ssh.exec_command(gpu_cmd, timeout=10)
        gpu_output = stdout_gpu.read().decode().strip()
        gpu_err = stderr_gpu.read().decode().strip()

        gpus = []
        if gpu_output and not gpu_err:
            for line in gpu_output.split("\n"):
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 10:
                    gpus.append(GpuInfo(
                        index=int(parts[0]),
                        name=parts[1],
                        temperature=f"{parts[2]}°C",
                        gpu_util=f"{parts[3]}%",
                        memory_used=f"{parts[4]} MiB",
                        memory_total=f"{parts[5]} MiB",
                        memory_free=f"{parts[6]} MiB",
                        power_draw=f"{parts[7]} W",
                        power_limit=f"{parts[8]} W",
                        fan_speed=f"{parts[9]}%",
                    ))

        # driver & cuda version
        _, stdout_ver, _ = ssh.exec_command(
            "nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1",
            timeout=10
        )
        driver_version = stdout_ver.read().decode().strip()

        _, stdout_cuda, _ = ssh.exec_command(
            "nvidia-smi | grep 'CUDA Version' | awk '{print $NF}'",
            timeout=10
        )
        cuda_version = stdout_cuda.read().decode().strip()

        # system info
        _, stdout_cpu, _ = ssh.exec_command(
            "top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}'",
            timeout=10
        )
        cpu_usage = stdout_cpu.read().decode().strip()

        _, stdout_mem, _ = ssh.exec_command(
            "free -h | awk '/^Mem:/{print $3,$2}'",
            timeout=10
        )
        mem_parts = stdout_mem.read().decode().strip().split()

        _, stdout_up, _ = ssh.exec_command("uptime -p", timeout=10)
        uptime = stdout_up.read().decode().strip()

        ssh.close()

        return ServerGpuStatus(
            server_id=server.id,
            server_name=server.name,
            driver_version=driver_version,
            cuda_version=cuda_version,
            gpus=gpus,
            cpu_usage=f"{cpu_usage}%" if cpu_usage else "N/A",
            memory_used=mem_parts[0] if len(mem_parts) >= 1 else "N/A",
            memory_total=mem_parts[1] if len(mem_parts) >= 2 else "N/A",
            uptime=uptime or "N/A",
        )

    except Exception as e:
        return ServerGpuStatus(
            server_id=server.id,
            server_name=server.name,
            error=f"서버 접속 실패: {str(e)}",
        )


@router.post("/{server_id}/reboot")
def reboot_server(
    server_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(404, "Server not found")

    if not server.ssh_host or not server.ssh_user or not server.ssh_password:
        raise HTTPException(400, "SSH 접속 정보가 없습니다")

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
        ssh.exec_command("sudo reboot", timeout=5)
        ssh.close()
    except Exception:
        pass

    server.status = ServerStatus.OFFLINE
    db.commit()
    return {"message": "재부팅 명령을 전송했습니다"}
