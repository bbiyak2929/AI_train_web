"""
Auth API — 로그인 / 회원가입 / 토큰
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.schemas import (
    LoginRequest, RegisterRequest, TokenResponse, UserOut, NotificationUpdate,
)
from app.utils.auth import (
    hash_password, verify_password, create_access_token, get_current_user,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    # Check duplicates
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "Username already taken")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(400, "Email already registered")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
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
