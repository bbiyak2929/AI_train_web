"""
Files API — 프로젝트별 파일 업로드 / 목록 / 삭제 / 다운로드 (MinIO)
"""
import io
import logging
import zipfile
from uuid import UUID
from typing import List, Optional
import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.utils.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/files", tags=["Files"])


def _get_s3():
    """MinIO S3 client를 생성합니다."""
    return boto3.client(
        "s3",
        endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name="us-east-1",
    )


def _ensure_bucket(s3):
    """버킷이 없으면 생성합니다."""
    try:
        s3.head_bucket(Bucket=settings.MINIO_BUCKET_NAME)
    except ClientError:
        s3.create_bucket(Bucket=settings.MINIO_BUCKET_NAME)


def _project_prefix(project_id: UUID, sub_path: str = "") -> str:
    """프로젝트 파일의 S3 prefix를 반환합니다."""
    base = f"projects/{project_id}/files"
    if sub_path:
        # 경로 조작 방지
        cleaned = sub_path.strip("/")
        if ".." in cleaned:
            raise HTTPException(400, "Invalid path")
        return f"{base}/{cleaned}"
    return f"{base}/"


@router.post("/upload")
async def upload_file(
    project_id: UUID,
    file: UploadFile = File(...),
    path: str = Query("", description="하위 폴더 경로 (예: data/train)"),
    current_user: User = Depends(get_current_user),
):
    """파일을 프로젝트 저장소에 업로드합니다."""
    if not file.filename:
        raise HTTPException(400, "Filename is required")

    s3 = _get_s3()
    _ensure_bucket(s3)

    # 안전한 파일명 처리
    filename = file.filename.replace("\\", "/").split("/")[-1]
    if ".." in filename:
        raise HTTPException(400, "Invalid filename")

    prefix = _project_prefix(project_id, path)
    if prefix.endswith("/"):
        key = f"{prefix}{filename}"
    else:
        key = f"{prefix}/{filename}"

    content = await file.read()
    s3.put_object(
        Bucket=settings.MINIO_BUCKET_NAME,
        Key=key,
        Body=content,
        ContentType=file.content_type or "application/octet-stream",
    )

    return {
        "filename": filename,
        "path": key,
        "size": len(content),
        "content_type": file.content_type,
    }


@router.post("/upload-multiple")
async def upload_multiple_files(
    project_id: UUID,
    files: List[UploadFile] = File(...),
    path: str = Query("", description="하위 폴더 경로"),
    current_user: User = Depends(get_current_user),
):
    """여러 파일을 한번에 업로드합니다."""
    s3 = _get_s3()
    _ensure_bucket(s3)

    results = []
    for f in files:
        if not f.filename:
            continue
        filename = f.filename.replace("\\", "/").split("/")[-1]
        if ".." in filename:
            continue

        prefix = _project_prefix(project_id, path)
        if prefix.endswith("/"):
            key = f"{prefix}{filename}"
        else:
            key = f"{prefix}/{filename}"

        content = await f.read()
        s3.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=key,
            Body=content,
            ContentType=f.content_type or "application/octet-stream",
        )
        results.append({
            "filename": filename,
            "path": key,
            "size": len(content),
            "content_type": f.content_type,
        })

    return results


@router.get("/")
def list_files(
    project_id: UUID,
    path: str = Query("", description="하위 폴더 경로"),
    current_user: User = Depends(get_current_user),
):
    """프로젝트의 파일 목록을 반환합니다. 폴더 구조를 포함합니다."""
    s3 = _get_s3()
    _ensure_bucket(s3)

    prefix = _project_prefix(project_id, path)
    if not prefix.endswith("/"):
        prefix += "/"

    try:
        response = s3.list_objects_v2(
            Bucket=settings.MINIO_BUCKET_NAME,
            Prefix=prefix,
        )
    except ClientError as e:
        raise HTTPException(500, f"Storage error: {e}")

    files = []
    for obj in response.get("Contents", []):
        key = obj["Key"]
        # prefix 이후의 상대경로
        rel_path = key[len(prefix):]
        if not rel_path:
            continue
        files.append({
            "key": key,
            "name": rel_path.split("/")[-1],
            "relative_path": rel_path,
            "size": obj["Size"],
            "last_modified": obj["LastModified"].isoformat(),
        })

    return files


@router.delete("/")
def delete_file(
    project_id: UUID,
    key: str = Query(..., description="삭제할 파일의 전체 key"),
    current_user: User = Depends(get_current_user),
):
    """파일을 삭제합니다."""
    # 프로젝트 범위 밖 접근 방지
    expected_prefix = f"projects/{project_id}/files"
    if not key.startswith(expected_prefix):
        raise HTTPException(403, "Access denied")

    s3 = _get_s3()
    try:
        s3.delete_object(Bucket=settings.MINIO_BUCKET_NAME, Key=key)
    except ClientError as e:
        raise HTTPException(500, f"Failed to delete: {e}")

    return {"deleted": key}


@router.post("/rename")
def rename_file(
    project_id: UUID,
    key: str = Query(..., description="이름을 변경할 파일의 전체 key"),
    new_name: str = Query(..., description="새 파일 이름"),
    current_user: User = Depends(get_current_user),
):
    """파일 이름을 변경합니다 (S3 copy + delete)."""
    expected_prefix = f"projects/{project_id}/files"
    if not key.startswith(expected_prefix):
        raise HTTPException(403, "Access denied")

    # 새 이름 검증
    new_name = new_name.strip()
    if not new_name or ".." in new_name or "/" in new_name or "\\" in new_name:
        raise HTTPException(400, "Invalid filename")

    # 기존 key에서 디렉토리 부분 추출 후 새 이름으로 교체
    parts = key.rsplit("/", 1)
    new_key = f"{parts[0]}/{new_name}" if len(parts) > 1 else new_name

    if new_key == key:
        return {"key": key, "new_key": new_key}

    s3 = _get_s3()
    try:
        # 복사 후 삭제
        s3.copy_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            CopySource={"Bucket": settings.MINIO_BUCKET_NAME, "Key": key},
            Key=new_key,
        )
        s3.delete_object(Bucket=settings.MINIO_BUCKET_NAME, Key=key)
    except ClientError as e:
        raise HTTPException(500, f"Rename failed: {e}")

    return {"key": key, "new_key": new_key, "new_name": new_name}


@router.get("/download")
def download_file(
    project_id: UUID,
    key: str = Query(..., description="다운로드할 파일의 전체 key"),
    current_user: User = Depends(get_current_user),
):
    """파일을 다운로드합니다."""
    expected_prefix = f"projects/{project_id}/files"
    if not key.startswith(expected_prefix):
        raise HTTPException(403, "Access denied")

    s3 = _get_s3()
    try:
        response = s3.get_object(Bucket=settings.MINIO_BUCKET_NAME, Key=key)
    except ClientError:
        raise HTTPException(404, "File not found")

    filename = key.split("/")[-1]
    return StreamingResponse(
        response["Body"],
        media_type=response.get("ContentType", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/upload-folder")
async def upload_folder(
    project_id: UUID,
    file: UploadFile = File(...),
    path: str = Query("", description="하위 폴더 경로"),
    current_user: User = Depends(get_current_user),
):
    """
    ZIP 파일을 업로드하면 자동으로 압축 해제하여 폴더 구조를 유지한 채 저장합니다.
    데이터셋 폴더(images/, labels/ 등)를 통째로 업로드할 때 사용합니다.
    """
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "ZIP 파일만 업로드 가능합니다")

    content = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(400, "유효하지 않은 ZIP 파일입니다")

    s3 = _get_s3()
    _ensure_bucket(s3)

    results = []
    for info in zf.infolist():
        # 디렉토리 엔트리 스킵
        if info.is_dir():
            continue
        # 숨김 파일(__MACOSX 등) 스킵
        inner_path = info.filename
        if inner_path.startswith("__MACOSX") or "/.DS_Store" in inner_path or inner_path.endswith(".DS_Store"):
            continue
        if ".." in inner_path:
            continue

        # 안전한 경로 생성
        cleaned = inner_path.replace("\\", "/").lstrip("/")
        prefix = _project_prefix(project_id, path)
        if prefix.endswith("/"):
            key = f"{prefix}{cleaned}"
        else:
            key = f"{prefix}/{cleaned}"

        file_data = zf.read(info.filename)
        s3.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=key,
            Body=file_data,
            ContentType="application/octet-stream",
        )
        results.append({
            "filename": cleaned.split("/")[-1],
            "path": key,
            "size": len(file_data),
        })

    zf.close()
    return {"extracted_files": len(results), "files": results}


@router.post("/upload-with-path")
async def upload_files_with_paths(
    project_id: UUID,
    files: List[UploadFile] = File(...),
    paths: str = Query("", description="쉼표 구분 상대경로 목록 (webkitRelativePath)"),
    current_user: User = Depends(get_current_user),
):
    """
    폴더 업로드 시 각 파일의 상대 경로를 유지하여 저장합니다.
    프론트엔드에서 webkitdirectory를 사용할 때 호출됩니다.
    """
    s3 = _get_s3()
    _ensure_bucket(s3)

    path_list = [p.strip() for p in paths.split(",") if p.strip()] if paths else []
    results = []

    for i, f in enumerate(files):
        if not f.filename:
            continue

        # 상대경로가 있으면 그대로 사용, 없으면 파일명만
        if i < len(path_list) and path_list[i]:
            rel = path_list[i].replace("\\", "/")
        else:
            rel = f.filename.replace("\\", "/").split("/")[-1]

        if ".." in rel:
            continue

        cleaned = rel.lstrip("/")
        base_prefix = f"projects/{project_id}/files"
        key = f"{base_prefix}/{cleaned}"

        content = await f.read()
        s3.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=key,
            Body=content,
            ContentType=f.content_type or "application/octet-stream",
        )
        results.append({
            "filename": cleaned.split("/")[-1],
            "path": key,
            "relative_path": cleaned,
            "size": len(content),
        })

    return results
