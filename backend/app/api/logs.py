"""
WebSocket Log Streaming — 실시간 로그 중계
"""
import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
import redis.asyncio as aioredis

from app.config import settings

router = APIRouter(tags=["Logs"])
logger = logging.getLogger(__name__)


class LogConnectionManager:
    """WebSocket 연결 관리자 — Run별 로그 스트리밍"""

    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, run_id: str, websocket: WebSocket):
        await websocket.accept()
        if run_id not in self.active_connections:
            self.active_connections[run_id] = []
        self.active_connections[run_id].append(websocket)
        logger.info(f"WebSocket connected for run {run_id}")

    def disconnect(self, run_id: str, websocket: WebSocket):
        if run_id in self.active_connections:
            self.active_connections[run_id].remove(websocket)
            if not self.active_connections[run_id]:
                del self.active_connections[run_id]
        logger.info(f"WebSocket disconnected for run {run_id}")

    async def broadcast(self, run_id: str, message: str):
        if run_id in self.active_connections:
            dead = []
            for ws in self.active_connections[run_id]:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.active_connections[run_id].remove(ws)


manager = LogConnectionManager()


@router.websocket("/ws/logs/{run_id}")
async def websocket_logs(websocket: WebSocket, run_id: str):
    """
    Run의 실시간 로그를 WebSocket으로 스트리밍합니다.
    Redis Pub/Sub를 통해 Runner에서 발행한 로그를 수신합니다.
    """
    await manager.connect(run_id, websocket)

    try:
        # Subscribe to Redis channel for this run's logs
        redis_client = aioredis.from_url(settings.REDIS_URL)
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"logs:{run_id}")

        async def listen_redis():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    await websocket.send_text(data)

        async def listen_client():
            while True:
                try:
                    data = await websocket.receive_text()
                    # Client can send commands (e.g., "ping")
                    if data == "ping":
                        await websocket.send_text("pong")
                except WebSocketDisconnect:
                    break

        # Run both listeners concurrently
        await asyncio.gather(
            listen_redis(),
            listen_client(),
            return_exceptions=True,
        )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error for run {run_id}: {e}")
    finally:
        manager.disconnect(run_id, websocket)
        try:
            await pubsub.unsubscribe(f"logs:{run_id}")
            await redis_client.close()
        except Exception:
            pass
