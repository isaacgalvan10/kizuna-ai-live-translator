from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
from .database import engine, Base
from .socket_manager import manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP: Create all tables defined in models.py
    # Note: For MVP this is fine. For production, we will eventually use Alembic for migrations.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # SHUTDOWN: Close database connections gracefully
    await engine.dispose()

# Initialize FastAPI
app = FastAPI(lifespan=lifespan, title="Kizuna API")

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Kizuna Backend"}

@app.websocket("/ws/stream/{room_id}/{language}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, language: str):
    await manager.connect(websocket, room_id, language)
    try:
        while True:
            # For now, we just wait to receive messages (like audio chunks from the speaker)
            data = await websocket.receive_text()
            
            # In Phase 3, this is where we will route the audio to the AI API.
            # For now, let's just echo it back to test the connection.
            await manager.broadcast_to_language(f"Echo: {data}", room_id, language)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id, language)