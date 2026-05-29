import asyncio
from .socket_manager import manager

class AITaskManager:
    def __init__(self):
        # Queues act as safe, non-blocking buckets for our data
        self.transcription_queue = asyncio.Queue()
        self.translation_queue = asyncio.Queue()
        
    async def transcription_worker(self):
        """Worker 1: Pulls raw audio chunks, sends to Groq Whisper, gets Japanese text."""
        print("🤖 Transcription worker started...")
        while True:
            # This waits safely until something is added to the queue
            audio_data, room_id = await self.transcription_queue.get()
            
            try:
                # TODO: Send 'audio_data' to Groq Whisper API here
                print(f"Transcribing audio for room {room_id}...")
                
                # Mock result for testing our pipeline
                japanese_text = "みなさん、おはようございます。" 
                
                # Push the resulting text into the translation bucket
                await self.translation_queue.put((japanese_text, room_id))
            
            except Exception as e:
                print(f"Transcription Error: {e}")
            finally:
                self.transcription_queue.task_done()

    async def translation_worker(self):
        """Worker 2: Pulls Japanese text, translates it, generates TTS audio, and broadcasts."""
        print("🌍 Translation worker started...")
        while True:
            japanese_text, room_id = await self.translation_queue.get()
            
            try:
                # TODO: Send 'japanese_text' to Translation API here (e.g., Groq Llama 3)
                english_text = "Good morning, everyone."
                
                # TODO: Send 'english_text' to TTS API here (e.g., edge-tts) to get audio bytes
                
                # Broadcast the text payload via WebSocket
                # (Later, we will broadcast the audio bytes too)
                await manager.broadcast_to_language(english_text, room_id, "en")
                
            except Exception as e:
                print(f"Translation Error: {e}")
            finally:
                self.translation_queue.task_done()

# Create a single instance to be used across the app
ai_manager = AITaskManager()