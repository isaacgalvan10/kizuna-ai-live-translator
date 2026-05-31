import os
import asyncio
import azure.cognitiveservices.speech as speechsdk
from .socket_manager import manager

class AzureTranslationWorker:
    def __init__(self, room_id: str, loop: asyncio.AbstractEventLoop):
        self.room_id = room_id
        self.loop = loop
        
        self.speech_key = os.getenv("AZURE_SPEECH_KEY")
        self.speech_region = os.getenv("AZURE_SPEECH_REGION")
        
        # Configure Azure Speech Translation
        self.translation_config = speechsdk.translation.SpeechTranslationConfig(
            subscription=self.speech_key, 
            region=self.speech_region
        )
        
        # Set the source language to Japanese
        self.translation_config.speech_recognition_language = "ja-JP"
        
        # Add your MVP target languages
        self.translation_config.add_target_language("en")
        self.translation_config.add_target_language("ko")
        self.translation_config.add_target_language("zh-Hans") # Simplified Chinese

        # Use an audio stream layout so we can feed raw audio bytes manually over the network
        self.audio_format = speechsdk.audio.AudioStreamFormat(
            samples_per_second=16000, 
            bits_per_sample=16, 
            channels=1
        )
        self.push_stream = speechsdk.audio.PushAudioInputStream(stream_format=self.audio_format)
        self.audio_config = speechsdk.audio.AudioConfig(stream=self.push_stream)

        # Initialize the translator engine
        self.translator = speechsdk.translation.TranslationRecognizer(
            translation_config=self.translation_config, 
            audio_config=self.audio_config
        )
        
        # Connect internal Azure callbacks to our pipeline logic
        self._setup_callbacks()

    def _setup_callbacks(self):
        def handled_recognized_event(evt):
            if evt.result.reason == speechsdk.ResultReason.TranslatedSpeech:
                japanese_text = evt.result.text
                print(f"\n✅ [AZURE HEARD]: {japanese_text}")
                
                for lang, translated_text in evt.result.translations.items():
                    print(f"🌍 [AZURE TRANSLATED to {lang.upper()}]: {translated_text}")
                    import asyncio
                    asyncio.run_coroutine_threadsafe(
                        manager.broadcast_to_language(translated_text, self.room_id, lang),
                        self.loop
                    )

        # NEW: Catch Azure Errors!
        def handled_canceled_event(evt):
            print(f"\n❌ [AZURE CANCELED ERROR]: {evt.result.reason}")
            if evt.result.reason == speechsdk.ResultReason.Canceled:
                cancellation_details = evt.result.cancellation_details
                print(f"❌ [DETAILS]: {cancellation_details.reason}")
                if cancellation_details.reason == speechsdk.CancellationReason.Error:
                    print(f"❌ [ERROR DETAILS]: {cancellation_details.error_details}")
                    print("--> Check your AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in docker-compose.yml")

        self.translator.recognized.connect(handled_recognized_event)
        self.translator.canceled.connect(handled_canceled_event) # Connect the error listener
        self.translator.session_stopped.connect(lambda evt: print("\n🛑 [AZURE SESSION STOPPED]"))

    def start_continuous_translation(self):
        """Tells Azure to start listening to the stream in the background."""
        self.translator.start_continuous_recognition()

    def stop_continuous_translation(self):
        """Stops the engine and tears down the stream cleanly."""
        self.translator.stop_continuous_recognition()

    def write_audio_chunk(self, audio_bytes: bytes):
        """The frontend will send raw audio chunks to FastAPI, which gets passed here."""
        self.push_stream.write(audio_bytes)