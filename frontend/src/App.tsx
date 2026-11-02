import { useState } from 'react'

function App() {
  const [hasStarted, setHasStarted] = useState(false)
  const [backendStatus, setBackendStatus] = useState('Not checked')

  async function checkBackend() {
    setBackendStatus('Checking...')

    try {
      const response = await fetch('http://127.0.0.1:8000/health')

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`)
      }

      const data = await response.json()
      setBackendStatus(`Backend status: ${data.status}`)
    } catch (error) {
      console.error(error)
      setBackendStatus('Could not reach the backend')
    }
  }

  return (
    <main>
      <h1>ArchProbe</h1>
      <p>Practice system design interviews with an AI interviewer.</p>
      <button
        type="button"
        onClick={() => setHasStarted(true)}
        disabled={hasStarted}
      >
        Start interview
      </button>
      {hasStarted && <p>Your interview is ready to begin.</p>}

      <button type="button" onClick={checkBackend}>
        Check backend
      </button>
      <p>{backendStatus}</p>
    </main>
  )
}

export default App
