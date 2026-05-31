import { useState, useEffect, useRef } from 'react';
import { PreacherDashboard } from './components/PreacherDashboard';

interface GuestJoinResponse {
  status: string;
  user_id: number;
  church_name: string;
  is_live: boolean;
  room_id: number | null;
}

function App() {
  const [viewMode, setViewMode] = useState<'select' | 'preacher' | 'guest'>('select');
  const [churchData, setChurchData] = useState<GuestJoinResponse | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  
  const TEST_QR_HASH = "test-hash-123"; 
  const TARGET_LANG = "en";
  const ws = useRef<WebSocket | null>(null);

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
      // Catch backend json broadcast signals
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'live_translation') {
          setMessages((prev) => [...prev, payload.text]);
        }
      } catch {
        setMessages((prev) => [...prev, event.data]);
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
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <button onClick={() => { ws.current?.close(); setViewMode('select'); }} style={{ marginBottom: '1rem' }}>← Exit Room</button>
      <h2>{churchData?.church_name} - Live Feed</h2>
      <p style={{ color: '#666' }}>Target Channel: {TARGET_LANG.toUpperCase()}</p>

      <div style={{ background: '#f4f4f4', padding: '1rem', height: '400px', overflowY: 'auto', borderRadius: '8px' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ margin: '0.5rem 0', padding: '0.5rem', background: 'white', borderRadius: '4px' }}>
            {msg}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;