import { useState, useEffect, useRef } from 'react'

function App() {
  const [messages, setMessages] = useState<string[]>([])
  const [input, setInput] = useState('')
  const ws = useRef<WebSocket | null>(null)

  // Hardcoded for testing: Room "123", Language "en"
  const ROOM_ID = "123"
  const TARGET_LANG = "en"

  useEffect(() => {
    // Connect to the FastAPI WebSocket endpoint
    ws.current = new WebSocket(`ws://localhost:8000/ws/stream/${ROOM_ID}/${TARGET_LANG}`)

    ws.current.onopen = () => {
      setMessages((prev) => [...prev, "🟢 Connected to server!"])
    }

    ws.current.onmessage = (event) => {
      // When the server broadcasts a message, add it to our list
      setMessages((prev) => [...prev, `Server: ${event.data}`])
    }

    ws.current.onclose = () => {
      setMessages((prev) => [...prev, "🔴 Disconnected."])
    }

    // Cleanup on unmount
    return () => {
      ws.current?.close()
    }
  }, [])

  const sendMessage = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && input) {
      ws.current.send(input)
      setMessages((prev) => [...prev, `You: ${input}`])
      setInput('')
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h2>Kizuna Stream Test (Room: {ROOM_ID} | Lang: {TARGET_LANG})</h2>
      
      <div style={{ marginBottom: '1rem' }}>
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a test message..."
          style={{ padding: '0.5rem', marginRight: '0.5rem', width: '300px' }}
        />
        <button onClick={sendMessage} style={{ padding: '0.5rem 1rem' }}>Send to Server</button>
      </div>

      <div style={{ background: '#f4f4f4', padding: '1rem', height: '300px', overflowY: 'auto' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ margin: '0.5rem 0' }}>{msg}</div>
        ))}
      </div>
    </div>
  )
}

export default App