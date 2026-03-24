"""
Celery application configuration
"""
from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "aitrain",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.worker.tasks.schedule_run": {"queue": "runs"},
        "app.worker.tasks.stop_run_task": {"queue": "runs"},
        "app.worker.tasks.stream_logs": {"queue": "runs"},
        "app.worker.tasks.monitor_run_status": {"queue": "health"},
    },
    beat_schedule={
        "monitor-running-containers": {
            "task": "app.worker.tasks.monitor_run_status",
            "schedule": 30.0,  # 30초마다 실행 중인 컨테이너 상태 확인
        },
    },
)

celery_app.autodiscover_tasks(["app.worker"])
