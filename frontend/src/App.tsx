import { useState, useEffect, useRef } from 'react';
import { PreacherDashboard } from './components/PreacherDashboard';

interface GuestJoinResponse {
  status: string;
  user_id: number;
  church_name: string;
  is_live: boolean;
  room_id: number | null;
}

interface TranslationMessage {
  original: string;
  translation: string;
}

function App() {
  const [viewMode, setViewMode] = useState<'select' | 'preacher' | 'guest'>('select');
  const [churchData, setChurchData] = useState<GuestJoinResponse | null>(null);
  const [messages, setMessages] = useState<TranslationMessage[]>([]);
  // State for the temporary, self-healing message
  const [interimMessage, setInterimMessage] = useState<TranslationMessage | null>(null);
  const [error, setError] = useState<string>('');
  
  const TEST_QR_HASH = "test-hash-123"; 
  const TARGET_LANG = "en";
  const ws = useRef<WebSocket | null>(null);
  
  // NEW: Refs for auto-scrolling
  const originalEndRef = useRef<HTMLDivElement | null>(null);
  const translationEndRef = useRef<HTMLDivElement | null>(null);

  // NEW: Auto-scroll effect
  useEffect(() => {
    originalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    translationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleGuestJoin = async () => {
    try {
      const response = await fetch(`/api/join/${TEST_QR_HASH}`, { method: 'POST' });
      if (!response.ok) throw new Error("Invalid QR Code - Did you seed the dev endpoint?");
      
      const data: GuestJoinResponse = await response.json();
      setChurchData(data);
      setViewMode('guest');
      
      localStorage.setItem('kizuna_user_id', data.user_id.toString());
      
      if (data.is_live && data.room_id) {
         connectGuestWebSocket(data.room_id);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const connectGuestWebSocket = (roomId: number) => {
    if (ws.current) ws.current.close();
    
    ws.current = new WebSocket(`ws://localhost:8000/ws/stream/${roomId}/${TARGET_LANG}`);
    ws.current.onopen = () => setMessages((prev) => [...prev, "🟢 Connected to the live translation stream!"]);
    ws.current.onclose = () => setMessages((prev) => [...prev, "🔴 Service ended. Disconnected."]);
    ws.current.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        if (payload.type === 'live_translation') {
          if (payload.data && payload.data.original !== undefined) {
            setMessages((prev) => [...prev, payload.data]);
            // Clear the interim message when the final one arrives
            setInterimMessage(null); 
          }
        } else if (payload.type === 'interim_translation') {
           // Update the temporary self-healing text
           if (payload.data && payload.data.original !== undefined) {
             setInterimMessage(payload.data);
           }
        } else if (payload.type === 'history') {
          const validHistory = payload.data.filter((msg: any) => msg && msg.original !== undefined);
          setMessages(validHistory);
        }
      } catch (e) {
        console.error("Received non-JSON message:", event.data);
      }
    };
  };

  useEffect(() => {
    return () => ws.current?.close();
  }, []);

  // UI STATE 1: Role Selection Portal
  if (viewMode === 'select') {
    return (
      <div style={{ padding: '3rem', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto' }}>
        <h2>Kizuna AI Hub</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
          <button onClick={() => setViewMode('preacher')} style={{ padding: '1rem', cursor: 'pointer', fontSize: '1rem' }}>
            Enter as Preacher (Broadcaster Mode)
          </button>
          <button onClick={handleGuestJoin} style={{ padding: '1rem', cursor: 'pointer', fontSize: '1rem' }}>
            Simulate Guest QR Scan (Listener Mode)
          </button>
        </div>
        {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
      </div>
    );
  }

  // UI STATE 2: Preacher Console layout
  if (viewMode === 'preacher') {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <button onClick={() => setViewMode('select')} style={{ marginBottom: '1rem' }}>← Back</button>
        <PreacherDashboard roomId="1" />
      </div>
    );
  }

  // UI STATE 3: Guest Listener View
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <button onClick={() => { ws.current?.close(); setViewMode('select'); }} style={{ marginBottom: '1rem' }}>← Exit Room</button>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>{churchData?.church_name} - Live Feed</h2>
        <span style={{ background: '#e6f4ea', color: '#137333', padding: '0.25rem 0.75rem', borderRadius: '16px', fontSize: '0.9rem', fontWeight: 'bold' }}>
          LIVE
        </span>
      </div>

      <div style={{ display: 'flex', gap: '2rem', height: '65vh' }}>
        
        {/* LEFT COLUMN: Original Japanese */}
        <div style={{ flex: 1, background: '#fafafa', border: '1px solid #e0e0e0', padding: '1.5rem', overflowY: 'auto', borderRadius: '8px', scrollBehavior: 'smooth' }}>
          <h4 style={{ margin: '0 0 1rem 0', color: '#666', borderBottom: '2px solid #ddd', paddingBottom: '0.5rem', position: 'sticky', top: 0, background: '#fafafa' }}>
            日本語 (Original)
          </h4>
          <div style={{ paddingBottom: '2rem' }}>
            {messages.map((msg, idx) => (
              <p key={`ja-${idx}`} style={{ lineHeight: '1.8', fontSize: '1.1rem', color: '#333', marginBottom: '1rem', background: '#fff', padding: '1rem', borderRadius: '8px', border: '1px solid #eee' }}>
                {msg?.original}
              </p>
            ))}
            {/* Render the fading interim Japanese text */}
            {interimMessage?.original && (
              <p style={{ lineHeight: '1.8', fontSize: '1.1rem', color: '#888', fontStyle: 'italic', marginBottom: '1rem', background: '#fff', padding: '1rem', borderRadius: '8px', border: '1px dashed #ccc', opacity: 0.7 }}>
                {interimMessage.original} <span className="blinking-cursor">...</span>
              </p>
            )}
            {/* Invisible anchor for auto-scrolling */}
            <div ref={originalEndRef} />
          </div>
        </div>

        {/* RIGHT COLUMN: Target Language Translation */}
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e0e0e0', padding: '1.5rem', overflowY: 'auto', borderRadius: '8px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', scrollBehavior: 'smooth' }}>
          <h4 style={{ margin: '0 0 1rem 0', color: '#007bff', borderBottom: '2px solid #b3d7ff', paddingBottom: '0.5rem', position: 'sticky', top: 0, background: '#fff' }}>
            {TARGET_LANG.toUpperCase()} (Translation)
          </h4>
          <div style={{ paddingBottom: '2rem' }}>
            {messages.map((msg, idx) => (
              <p key={`trans-${idx}`} style={{ lineHeight: '1.8', fontSize: '1.1rem', color: '#111', marginBottom: '1rem', background: '#f8f9fa', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #007bff' }}>
                {msg?.translation}
              </p>
            ))}
            {/* Render the fading interim Translated text */}
            {interimMessage?.translation && (
              <p style={{ lineHeight: '1.8', fontSize: '1.1rem', color: '#666', fontStyle: 'italic', marginBottom: '1rem', background: '#f8f9fa', padding: '1rem', borderRadius: '8px', borderLeft: '4px dashed #6c757d', opacity: 0.7 }}>
                {interimMessage.translation} <span className="blinking-cursor">...</span>
              </p>
            )}
            {/* Invisible anchor for auto-scrolling */}
            <div ref={translationEndRef} />
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;