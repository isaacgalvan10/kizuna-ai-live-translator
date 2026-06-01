import json
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, dict[str, list[WebSocket]]] = {}
        
        # A buffer to hold the translated history for the current live session
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

        # Send the historical context to the latecomer
        past_messages = self.history_buffer[room_id][language]
        if past_messages:
            # We send a specific JSON payload so the frontend knows it's the history dump
            payload = json.dumps({"type": "history", "data": past_messages})
            await websocket.send_text(payload)

    async def broadcast_to_language(self, original: str, translation: str, room_id: str, language: str):
        message_obj = {"original": original, "translation": translation}
        # 1. Save the new translation to the history buffer
        if room_id in self.history_buffer and language in self.history_buffer[room_id]:
            self.history_buffer[room_id][language].append(message_obj)
            
        # 2. Broadcast to all active listeners in JSON format
        if room_id in self.active_connections and language in self.active_connections[room_id]:
            active_clients = len(self.active_connections[room_id][language])
            print(f"📡 [BROADCASTING] Sending to {active_clients} active listeners in room {room_id} for lang {language}")
            
            payload = json.dumps({"type": "live_translation", "data": message_obj})
            for connection in self.active_connections[room_id][language]:
                try:
                    await connection.send_text(payload)
                except Exception as e:
                    print(f"⚠️ [SOCKET ERROR] Could not send to a client: {e}")
        else:
            print(f"⚠️ [NO LISTENERS] Translation saved to history, but nobody is actively connected to {language}")

    # Broadcast partial translations without saving them to history
    async def broadcast_interim(self, original: str, translation: str, room_id: str, language: str):
        if room_id in self.active_connections and language in self.active_connections[room_id]:
            payload = json.dumps({
                "type": "interim_translation", 
                "data": {"original": original, "translation": translation}
            })
            for connection in self.active_connections[room_id][language]:
                try:
                    await connection.send_text(payload)
                except Exception:
                    pass # Silently drop failed interim packets to maintain speed

manager = ConnectionManager()