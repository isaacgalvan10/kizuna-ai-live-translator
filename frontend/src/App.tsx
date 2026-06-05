import { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';

// Simple interface definitions
interface TranslationMessage {
  original: string;
  translation: string;
}

export default function App() {
  const navigate = useNavigate();

  // --- GLOBAL STATE ---
  const [roomInput, setRoomInput] = useState('church_central');
  const [targetLang, setTargetLang] = useState('en');
  const [messages, setMessages] = useState<TranslationMessage[]>([]);
  const [interimMessage, setInterimMessage] = useState<TranslationMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  
  // NEW: The trapdoor ref so the WebSocket can read the live state
  const audioEnabledRef = useRef(isAudioEnabled);
  useEffect(() => {
    audioEnabledRef.current = isAudioEnabled;
  }, [isAudioEnabled]);

  // --- REFS ---
  const ws = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const globalStream = useRef<MediaStream | null>(null);
  const originalContainerRef = useRef<HTMLDivElement | null>(null);
  const translationContainerRef = useRef<HTMLDivElement | null>(null);

  // The Smart Scroll
  const scrollToBottom = (container: HTMLDivElement | null) => {
    if (!container) return;
    
    // Check how far the user is from the bottom (allow a 100px buffer)
    const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
    
    if (isNearBottom) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Only trigger the scroll when the message array length changes (ignore interim updates)
  useEffect(() => {
    scrollToBottom(originalContainerRef.current);
    scrollToBottom(translationContainerRef.current);
  }, [messages.length]);

  // --- WEBSOCKET CONNECTION (LISTENER) ---
  const connectListenerWebSocket = (roomId: string, lang: string) => {
    if (ws.current) ws.current.close();

    const wsUrl = `ws://localhost:8000/ws/listen/${roomId}/${lang}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => console.log("📡 Connected to Live Translation Room");
    
    ws.current.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'live_translation') {
          if (payload.data && payload.data.original !== undefined) {
            setMessages((prev) => [...prev, payload.data]);
            setInterimMessage(null);
            
            // The Absolute Basics: Plain Text-to-Speech
            if (audioEnabledRef.current) {
              const synth = window.speechSynthesis;
              const utterance = new SpeechSynthesisUtterance(payload.data.translation);
              const voices = synth.getVoices();

              // 1. Map your language key to the proper BCP 47 tag
              const langMap: Record<string, string> = {
                'en': 'en-US',
                'ko': 'ko-KR',
                'zh-hans': 'zh-CN',
                'zh-hant': 'zh-TW'
              };
              const targetLang = langMap[lang] || lang;
              utterance.lang = targetLang; // Set fallback language string

              if (voices.length > 0) {
                // 2. Filter voices that strictly match your target language prefix (e.g., "en")
                const matchingLanguages = voices.filter(v => 
                  v.lang.toLowerCase().startsWith(targetLang.split('-')[0].toLowerCase())
                );

                if (matchingLanguages.length > 0) {
                  // 3. Look for a premium voice *inside* that specific language group
                  const preferredVoice = matchingLanguages.find(v => 
                    v.name.includes("Natural") || v.name.includes("Google")
                  );
                  
                  // Fallback to the first available voice of the correct language
                  utterance.voice = preferredVoice || matchingLanguages[0];
                }
              }
              
              synth.speak(utterance);
            }

          }
        } else if (payload.type === 'interim_translation') {
          if (payload.data && payload.data.original !== undefined) {
            setInterimMessage(payload.data);
          }
        } else if (payload.type === 'history') {
          const validHistory = payload.data.filter((msg: any) => msg && msg.original !== undefined);
          setMessages(validHistory);
        }
      } catch (e) {
        console.error("Malformed socket data:", e);
      }
    };

    ws.current.onclose = () => console.log("🔌 Disconnected from Room");
  };

  // --- AUDIO STREAMING ENGINE (PREACHER) ---
  const startAudioStreaming = async (roomId: string) => {
    try {
      const wsUrl = `ws://localhost:8000/ws/stream/${roomId}`;
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = async () => {
        console.log("🎙️ Audio Stream Socket Opened");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        globalStream.current = stream;

        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContext.current.createMediaStreamSource(stream);
        
        processor.current = audioContext.current.createScriptProcessor(4096, 1, 1);
        source.connect(processor.current);
        processor.current.connect(audioContext.current.destination);

        processor.current.onaudioprocess = (e) => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
            }
            ws.current.send(pcm16.buffer);
          }
        };
        setIsStreaming(true);
      };
    } catch (err) {
      console.error("Microphone access failed:", err);
    }
  };

  const stopAudioStreaming = () => {
    processor.current?.disconnect();
    audioContext.current?.close();
    globalStream.current?.getTracks().forEach(track => track.stop());
    ws.current?.close();
    setIsStreaming(false);
  };

  // --- ROUTING HANDLERS ---
  const handleJoinAsListener = () => {
    connectListenerWebSocket(roomInput, targetLang);
    navigate('/listener');
  };

  const handleJoinAsPreacher = () => {
    navigate('/preacher');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased font-sans">
      <Routes>
        
        {/* VIEW 1: LANDING / PORTAL SELECTOR */}
        <Route path="/" element={
          <div className="max-w-md mx-auto pt-24 px-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
              <div className="text-center mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight text-indigo-600 mb-2">絆 KIZUNA</h1>
                <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Real-time Translation Hub</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Church / Room ID</label>
                  <input 
                    type="text" 
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  {/* Left Column: Enter as Listener */}
                  <div className="space-y-3">
                    <span className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Listen In</span>
                    <select 
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    >
                      <option value="en">English (US)</option>
                      <option value="ko">한국어 (Korean)</option>
                      <option value="zh-hant">繁體中文 (Traditional Chinese)</option>
                      <option value="zh-hans">简体中文 (Chinese)</option>
                    </select>
                    <button 
                      onClick={handleJoinAsListener}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-indigo-100 text-sm"
                    >
                      Join Feed
                    </button>
                  </div>

                  {/* Right Column: Enter as Preacher */}
                  <div className="space-y-3 flex flex-col justify-between">
                    <div>
                      <span className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Broadcaster</span>
                      <p className="text-xs text-slate-400 leading-relaxed">Stream localized stage audio directly to Azure Translation arrays.</p>
                    </div>
                    <button 
                      onClick={handleJoinAsPreacher}
                      className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl transition-all shadow-md text-sm"
                    >
                      Dashboard
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        } />

        {/* VIEW 2: PREACHER DASHBOARD */}
        <Route path="/preacher" element={
          <div className="max-w-2xl mx-auto pt-16 px-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <button onClick={() => { stopAudioStreaming(); navigate('/'); }} className="text-sm font-medium text-slate-500 hover:text-slate-800 mb-2 block">← Return to Hub</button>
                  <h2 className="text-2xl font-bold text-slate-900">Preacher Broadcast Console</h2>
                  <p className="text-sm text-slate-400 font-mono">Channel: {roomInput}</p>
                </div>
                <div className={`h-3 w-3 rounded-full ${isStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              </div>

              <div className="p-8 bg-slate-50 rounded-xl border border-slate-100 text-center space-y-4">
                <p className="text-sm text-slate-600 max-w-sm mx-auto">
                  Ensure your physical inputs are correct. Toggling transmission begins immediate low-latency streaming to listening devices.
                </p>
                
                {!isStreaming ? (
                  <button 
                    onClick={() => startAudioStreaming(roomInput)}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-100 transition-all transform active:scale-95"
                  >
                    Start Live Sermon
                  </button>
                ) : (
                  <button 
                    onClick={stopAudioStreaming}
                    className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-lg shadow-rose-100 transition-all transform active:scale-95"
                  >
                    Mute / End Stream
                  </button>
                )}
              </div>
            </div>
          </div>
        } />

        {/* VIEW 3: GUEST LISTENER VIEW */}
        <Route path="/listener" element={
          <div className="max-w-6xl mx-auto p-6 lg:p-12 h-screen flex flex-col">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
              
              {/* Left Side: Navigation & Title */}
              <div>
                <button onClick={() => { ws.current?.close(); setMessages([]); setInterimMessage(null); navigate('/'); }} className="text-sm font-medium text-slate-500 hover:text-slate-800 mb-1 block transition-colors">
                  ← Change Language / Room
                </button>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight capitalize">{roomInput.replace('_', ' ')}</h2>
              </div>
              
              {/* Right Side: Status & Controls */}
              <div className="flex flex-col items-start sm:items-end gap-2">
                
                {/* Live Indicator */}
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full text-emerald-700 text-xs font-bold tracking-wide uppercase shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  Live Feed Established
                </div>
                {/* Text-to-Speech Audio Toggle */}
                <button
                  onClick={() => {
                    const newState = !isAudioEnabled;
                    setIsAudioEnabled(newState);
                    
                    // FIX: The Silent Primer (Unlocks the browser's audio engine)
                    if (newState) {
                      window.speechSynthesis.cancel(); // Clear any invisible stuck queues
                      const primer = new SpeechSynthesisUtterance("Audio enabled.");
                      primer.volume = 0.05; // Whisper quiet, just enough to unlock the browser
                      window.speechSynthesis.speak(primer);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase border transition-all shadow-sm ${
                    isAudioEnabled
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {isAudioEnabled ? (
                    <>
                      {/* Speaker ON Icon */}
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.536 8.464a5 5 0 010 7.072M17.657 6.343a8 8 0 010 11.314M18.364 5.636a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2.586l3.707 3.707a1 1 0 001.707-.707V5a1 1 0 00-1.707-.707L9.586 10H7a2 2 0 00-2 2z" /></svg>
                      Audio: ON
                    </>
                  ) : (
                    <>
                      {/* Speaker OFF (Muted) Icon */}
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                      Audio: OFF
                    </>
                  )}
                </button>

              </div>
            </div>

            {/* Split Screen Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden pb-6">
              
              {/* Japanese Original */}
              <div className="bg-slate-100/70 border border-slate-200/60 rounded-xl flex flex-col h-full overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-200/50 border-b border-slate-200 text-xs font-bold tracking-wider text-slate-500 uppercase shrink-0">
                  日本語 (Original)
                </div>
                <div ref={originalContainerRef} className="p-6 overflow-y-auto space-y-4 flex-1 scroll-smooth">
                  {messages.map((msg, idx) => (
                    <div key={`ja-${idx}`} className="bg-white p-4 rounded-xl border border-slate-200/50 shadow-xs text-slate-800 text-base leading-relaxed">
                      {msg?.original}
                    </div>
                  ))}
                  {interimMessage?.original && (
                    <div className="bg-white/60 p-4 rounded-xl border border-dashed border-slate-300 shadow-xs text-slate-400 text-base leading-relaxed italic opacity-80">
                      {interimMessage.original} <span className="blinking-cursor text-indigo-500 font-bold">...</span>
                    </div>
                  )}

                
                </div>
              </div>

              {/* Translation Output */}
              <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-full overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-indigo-50/50 border-b border-indigo-100 text-xs font-bold tracking-wider text-indigo-600 uppercase shrink-0">
                  {targetLang.toUpperCase()} (Translation)
                </div>
                <div ref={originalContainerRef} className="p-6 overflow-y-auto space-y-4 flex-1 scroll-smooth">
                  {messages.map((msg, idx) => (
                    <div key={`trans-${idx}`} className="bg-slate-50 p-4 rounded-xl border-l-4 border-indigo-500 text-slate-900 text-base leading-relaxed shadow-2xs">
                      {msg?.translation}
                    </div>
                  ))}
                  {interimMessage?.translation && (
                    <div className="bg-slate-50/50 p-4 rounded-xl border-l-4 border-dashed border-slate-400 text-slate-500 text-base leading-relaxed italic opacity-75">
                      {interimMessage.translation} <span className="blinking-cursor text-slate-400">...</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        } />

      </Routes>
    </div>
  );
}