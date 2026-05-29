import { useState, useEffect, useRef } from 'react';

// TypeScript interface to match our backend Pydantic schema
interface GuestJoinResponse {
  status: string;
  user_id: number;
  church_name: string;
  is_live: boolean;
  room_id: number | null;
}

function App() {
  const [churchData, setChurchData] = useState<GuestJoinResponse | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  
  // We will hardcode this for testing. Later, this will be read from the URL.
  const TEST_QR_HASH = "test-hash-123"; 
  const TARGET_LANG = "en";
  
  const ws = useRef<WebSocket | null>(null);

  const handleScan = async () => {
    try {
      const response = await fetch(`/api/join/${TEST_QR_HASH}`, { method: 'POST' });
      if (!response.ok) throw new Error("Invalid QR Code - Did you run the seed endpoint?");
      
      const data: GuestJoinResponse = await response.json();
      setChurchData(data);
      
      // Save ID for persistence
      localStorage.setItem('kizuna_user_id', data.user_id.toString());
      
      // The Traffic Cop: If live, connect!
      if (data.is_live && data.room_id) {
         connectWebSocket(data.room_id);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const connectWebSocket = (roomId: number) => {
    ws.current = new WebSocket(`ws://localhost:8000/ws/stream/${roomId}/${TARGET_LANG}`);

    ws.current.onopen = () => setMessages((prev) => [...prev, "🟢 Connected to the live translation stream!"]);
    ws.current.onclose = () => setMessages((prev) => [...prev, "🔴 Service ended. Disconnected."]);
    
    ws.current.onmessage = (event) => {
      // In Phase 3, this will parse JSON. For now, we just print the raw string.
      setMessages((prev) => [...prev, event.data]);
    };
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => ws.current?.close();
  }, []);

  // UI STATE 1: Not Scanned Yet
  if (!churchData) {
     return (
       <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <h2>Welcome to Kizuna</h2>
          <button onClick={handleScan} style={{ padding: '0.75rem 1.5rem', cursor: 'pointer' }}>
            Simulate QR Scan ({TEST_QR_HASH})
          </button>
          {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
       </div>
     );
  }

  // UI STATE 2: Waiting Room
  if (!churchData.is_live) {
      return (
         <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
            <h2>{churchData.church_name}</h2>
            <p>The sermon has not started yet. Please take a seat, the translation will begin automatically.</p>
         </div>
      );
  }

  // UI STATE 3: Live Room
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h2>{churchData.church_name} - Live Feed</h2>
      <p style={{ color: '#666' }}>Guest ID: {churchData.user_id} | Channel: {TARGET_LANG.toUpperCase()}</p>

      <div style={{ background: '#f4f4f4', padding: '1rem', height: '400px', overflowY: 'auto', borderRadius: '8px' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ margin: '0.5rem 0', padding: '0.5rem', background: 'white', borderRadius: '4px' }}>
            {msg}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App;