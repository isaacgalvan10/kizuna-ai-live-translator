from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # We store active connections categorized by Room ID and Target Language
        # Example format: {"room_123": {"en": [websocket1, websocket2], "ja": [websocket3]}}
        self.active_connections: dict[str, dict[str, list[WebSocket]]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, language: str):
        await websocket.accept()
        
        # Initialize the nested dictionaries if they don't exist
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
        if language not in self.active_connections[room_id]:
            self.active_connections[room_id][language] = []
            
        self.active_connections[room_id][language].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str, language: str):
        if room_id in self.active_connections and language in self.active_connections[room_id]:
            self.active_connections[room_id][language].remove(websocket)
            # Cleanup empty lists
            if not self.active_connections[room_id][language]:
                del self.active_connections[room_id][language]

    async def broadcast_to_language(self, message: str, room_id: str, language: str):
        """Sends the translated text to everyone in the room listening to that specific language."""
        if room_id in self.active_connections and language in self.active_connections[room_id]:
            for connection in self.active_connections[room_id][language]:
                await connection.send_text(message)

manager = ConnectionManager()