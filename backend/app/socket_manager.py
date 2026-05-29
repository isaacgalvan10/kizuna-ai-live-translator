import json
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, dict[str, list[WebSocket]]] = {}
        
        # NEW: A buffer to hold the translated history for the current live session
        # Format: {"room_123": {"en": ["Welcome", "Today we talk about..."], "ja": [...]}}
        self.history_buffer: dict[str, dict[str, list[str]]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, language: str):
        await websocket.accept()
        
        # Setup connection trackers
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
            self.history_buffer[room_id] = {} # Initialize history for this room
            
        if language not in self.active_connections[room_id]:
            self.active_connections[room_id][language] = []
            self.history_buffer[room_id][language] = [] # Initialize language history
            
        self.active_connections[room_id][language].append(websocket)

        # THE MAGIC: Immediately send the historical context to the latecomer
        past_messages = self.history_buffer[room_id][language]
        if past_messages:
            # We send a specific JSON payload so the frontend knows it's the history dump
            payload = json.dumps({"type": "history", "data": past_messages})
            await websocket.send_text(payload)

    async def broadcast_to_language(self, message: str, room_id: str, language: str):
        # 1. Save the new translation to the history buffer
        if room_id in self.history_buffer and language in self.history_buffer[room_id]:
            self.history_buffer[room_id][language].append(message)
            
        # 2. Broadcast to all active listeners in JSON format
        if room_id in self.active_connections and language in self.active_connections[room_id]:
            payload = json.dumps({"type": "live_translation", "text": message})
            for connection in self.active_connections[room_id][language]:
                await connection.send_text(payload)

manager = ConnectionManager()