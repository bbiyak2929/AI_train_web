"""
Email notification utility — SMTP를 통한 이메일 발송
"""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, html_body: str):
    """HTML 이메일을 SMTP로 발송합니다."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP credentials not configured, skipping email")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def send_verification_email(to_email: str, code: str):
    """이메일 인증 코드를 발송합니다."""
    subject = "🔐 AI Training Platform — 이메일 인증 코드"

    html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto;
                background: #111827; border-radius: 12px; overflow: hidden; border: 1px solid #1F2937;">
        <div style="background: linear-gradient(135deg, #6C63FF, #00D9FF); padding: 24px 28px;">
            <h2 style="margin: 0; color: #fff; font-size: 18px;">AI Training Platform</h2>
            <p style="margin: 6px 0 0; color: rgba(255,255,255,0.85); font-size: 13px;">이메일 인증</p>
        </div>
        <div style="padding: 28px; text-align: center;">
            <p style="color: #E2E8F0; font-size: 15px; margin: 0 0 24px;">
                회원가입을 완료하려면 아래 인증 코드를 입력해주세요.
            </p>
            <div style="background: #1F2937; border-radius: 12px; padding: 24px; margin-bottom: 20px;
                        display: inline-block; min-width: 200px;">
                <p style="color: #64748B; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 2px;">
                    인증 코드
                </p>
                <p style="color: #00D9FF; font-size: 36px; font-weight: 700; margin: 0;
                          letter-spacing: 8px; font-family: monospace;">
                    {code}
                </p>
            </div>
            <p style="color: #64748B; font-size: 12px; margin: 16px 0 0;">
                이 코드는 10분간 유효합니다.
            </p>
        </div>
        <div style="background: #0D1117; padding: 14px 28px; text-align: center;">
            <p style="color: #475569; font-size: 11px; margin: 0;">
                본인이 요청하지 않았다면 이 이메일을 무시해주세요.
            </p>
        </div>
    </div>
    """

    return send_email(to_email, subject, html)


def send_run_completed_email(to_email: str, username: str, run_name: str, status: str, project_name: str = ""):
    """Run 완료 알림 이메일을 보냅니다."""
    is_success = status == "success"
    status_kr = "성공 ✅" if is_success else "실패 ❌"
    status_color = "#10B981" if is_success else "#EF4444"
    status_emoji = "🎉" if is_success else "⚠️"

    subject = f"{status_emoji} [{project_name or 'AI Training'}] Run '{run_name}' {status_kr}"

    html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto;
                background: #111827; border-radius: 12px; overflow: hidden; border: 1px solid #1F2937;">
        <div style="background: linear-gradient(135deg, #6C63FF, #00D9FF); padding: 24px 28px;">
            <h2 style="margin: 0; color: #fff; font-size: 18px;">AI Training Platform</h2>
            <p style="margin: 6px 0 0; color: rgba(255,255,255,0.85); font-size: 13px;">학습 완료 알림</p>
        </div>
        <div style="padding: 28px;">
            <p style="color: #E2E8F0; font-size: 15px; margin: 0 0 20px;">
                안녕하세요 <strong>{username}</strong>님,
            </p>
            <div style="background: #1F2937; border-radius: 8px; padding: 18px; margin-bottom: 20px;
                        border-left: 4px solid {status_color};">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="color: #94A3B8; font-size: 13px; padding: 4px 0;">Run</td>
                        <td style="color: #F1F5F9; font-size: 13px; font-weight: 600; text-align: right;">{run_name}</td>
                    </tr>
                    {"<tr><td style='color: #94A3B8; font-size: 13px; padding: 4px 0;'>프로젝트</td><td style='color: #F1F5F9; font-size: 13px; text-align: right;'>" + project_name + "</td></tr>" if project_name else ""}
                    <tr>
                        <td style="color: #94A3B8; font-size: 13px; padding: 4px 0;">결과</td>
                        <td style="color: {status_color}; font-size: 14px; font-weight: 700; text-align: right;">{status_kr}</td>
                    </tr>
                </table>
            </div>
            <p style="color: #64748B; font-size: 12px; margin: 16px 0 0;">
                웹 대시보드에서 상세 결과를 확인할 수 있습니다.
            </p>
        </div>
        <div style="background: #0D1117; padding: 14px 28px; text-align: center;">
            <p style="color: #475569; font-size: 11px; margin: 0;">
                이 알림은 이메일 알림에 동의하신 분께만 발송됩니다.
            </p>
        </div>
    </div>
    """

    return send_email(to_email, subject, html)
