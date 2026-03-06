"""
Files API — 프로젝트별 파일 업로드 / 목록 / 삭제 / 다운로드 (MinIO)
"""
import io
import logging
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
