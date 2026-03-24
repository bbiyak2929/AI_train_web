"""
Auth API — 로그인 / 회원가입 / 이메일 인증 / 토큰
"""
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.user import User
from app.schemas.schemas import (
    LoginRequest, RegisterRequest, TokenResponse, UserOut,
    NotificationUpdate, VerifyEmailRequest, ResendVerifyRequest,
)
from app.utils.auth import (
    hash_password, verify_password, create_access_token, get_current_user,
)
from app.utils.email import send_verification_email

router = APIRouter(prefix="/auth", tags=["Auth"])


def _generate_code() -> str:
    """6자리 숫자 인증코드를 생성합니다."""
    return f"{secrets.randbelow(900000) + 100000}"


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    # Check duplicates
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "Username already taken")

    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        if existing.email_verified:
            raise HTTPException(400, "Email already registered")
        # 미인증 계정이 있으면 삭제 후 재생성
        db.delete(existing)
        db.commit()

    code = _generate_code()
    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        is_active=False,
        email_verified=False,
        verify_code=code,
        verify_code_expires=datetime.utcnow() + timedelta(minutes=10),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 인증 이메일 발송
    send_verification_email(user.email, code)

    return user


@router.post("/verify-email")
def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)):
    """이메일 인증 코드를 확인하고 계정을 활성화합니다."""
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.email_verified:
        return {"message": "이미 인증된 계정입니다."}

    if not user.verify_code or not user.verify_code_expires:
        raise HTTPException(400, "인증 코드가 없습니다. 재발송을 요청해주세요.")

    if datetime.utcnow() > user.verify_code_expires:
        raise HTTPException(400, "인증 코드가 만료되었습니다. 재발송을 요청해주세요.")

    if user.verify_code != body.code:
        raise HTTPException(400, "인증 코드가 일치하지 않습니다.")

    user.email_verified = True
    user.is_active = True
    user.verify_code = None
    user.verify_code_expires = None
    db.commit()

    return {"message": "이메일 인증이 완료되었습니다! 로그인해주세요."}


@router.post("/resend-verify")
def resend_verify(body: ResendVerifyRequest, db: Session = Depends(get_db)):
    """인증 코드를 재발송합니다."""
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.email_verified:
        return {"message": "이미 인증된 계정입니다."}

    code = _generate_code()
    user.verify_code = code
    user.verify_code_expires = datetime.utcnow() + timedelta(minutes=10)
    db.commit()

    send_verification_email(user.email, code)
    return {"message": "인증 코드가 재발송되었습니다."}


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    # username 또는 email 모두 로그인 ID로 허용
    login_id = (body.username or "").strip()
    user = db.query(User).filter(
        or_(User.username == login_id, User.email == login_id)
    ).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    # Legacy superuser accounts may predate email verification rollout.
    # Auto-heal their flags on successful password verification.
    if user.is_superuser and (not user.email_verified or not user.is_active):
        user.email_verified = True
        user.is_active = True
        db.commit()
        db.refresh(user)

    if not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "이메일 인증이 필요합니다.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me/notifications", response_model=UserOut)
def update_notifications(
    body: NotificationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.notify_email = body.notify_email
    db.commit()
    db.refresh(current_user)
    return current_user
