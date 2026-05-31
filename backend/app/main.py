import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from contextlib import asynccontextmanager
from .database import engine, Base, get_db
from .socket_manager import manager
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from .models import Church, Room, User
from .schemas import GuestJoinResponse
from .ai_worker import ai_manager
from .azure_worker import AzureTranslationWorker

@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP: Create all tables defined in models.py
    # Note: For MVP this is fine. For production, we will eventually use Alembic for migrations.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # SHUTDOWN: Close database connections gracefully
    await engine.dispose()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP: Boot up the background workers
    transcription_task = asyncio.create_task(ai_manager.transcription_worker())
    translation_task = asyncio.create_task(ai_manager.translation_worker())
    
    # STARTUP: Create Database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    yield  # The app runs here
    
    # SHUTDOWN: Cancel background tasks and close DB
    transcription_task.cancel()
    translation_task.cancel()
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


@app.post("/api/join/{qr_code_hash}", response_model=GuestJoinResponse)
async def silent_guest_login(qr_code_hash: str, db: AsyncSession = Depends(get_db)):
    """
    1. Validates the QR code.
    2. Creates a silent guest user account.
    3. Returns the Church state (Live vs. Waiting) and session details.
    """
    
    # 1. Look up the church by the QR hash
    query = select(Church).where(Church.qr_code_hash == qr_code_hash)
    result = await db.execute(query)
    church = result.scalar_one_or_none()

    if not church:
        raise HTTPException(status_code=404, detail="Invalid QR code. Church not found.")

    # 2. Check if there is an active room
    room_query = select(Room).where(Room.church_id == church.id, Room.is_live == True)
    room_result = await db.execute(room_query)
    active_room = room_result.scalar_one_or_none()

    # Determine state based on if an active room exists
    is_live = active_room is not None
    room_id = active_room.id if active_room else None

    # 3. Create the Silent Guest User
    # Notice we don't require an email or password
    new_guest = User(is_guest=True)
    db.add(new_guest)
    
    # We commit the transaction to save the user, and refresh to get their auto-generated ID
    await db.commit()
    await db.refresh(new_guest)

    # 4. Return the structured payload
    return GuestJoinResponse(
        status="success",
        user_id=new_guest.id,
        church_name=church.name,
        is_live=is_live,
        room_id=room_id
    )


# TEMPORARY: Add this to main.py just for testing
@app.post("/api/dev/seed")
async def seed_test_data(db: AsyncSession = Depends(get_db)):
    church = Church(name="Kizuna Test Church", qr_code_hash="test-hash-123")
    db.add(church)
    await db.commit()
    await db.refresh(church)
    
    # Create an active room for this church
    room = Room(church_id=church.id, is_live=True)
    db.add(room)
    await db.commit()
    
    return {"message": "Test church and live room created!", "qr_hash": church.qr_code_hash}

# A dictionary to ensure we only have one active Azure stream per room
active_azure_workers: dict[str, AzureTranslationWorker] = {}

@app.websocket("/ws/publish/{room_id}")
async def publish_audio(websocket: WebSocket, room_id: str):
    """
    This endpoint is strictly for the Church Admin/Preacher.
    It receives raw microphone audio bytes and sends them to Azure.
    """
    await websocket.accept()
    
    # Grab the current FastAPI event loop
    loop = asyncio.get_running_loop()
    
    # Initialize the worker and start the Azure translation engine
    worker = AzureTranslationWorker(room_id, loop)
    active_azure_workers[room_id] = worker
    worker.start_continuous_translation()
    
    try:
        while True:
            # We are receiving BYTES now, not text
            audio_chunk = await websocket.receive_bytes()
            worker.write_audio_chunk(audio_chunk)
            
    except WebSocketDisconnect:
        # Clean up the engine when the preacher stops broadcasting
        worker.stop_continuous_translation()
        if room_id in active_azure_workers:
            del active_azure_workers[room_id]