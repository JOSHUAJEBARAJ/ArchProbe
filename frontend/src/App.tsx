import { useEffect, useRef, useState } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import './App.css'
import Whiteboard from './Whiteboard'

type ChatMessage = {
  id: string
  role: 'interviewer' | 'candidate'
  text: string
  kind?: 'wrap_up'
  diagramRevision?: number
}

function App() {
  const [hasStarted, setHasStarted] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [backendStatus, setBackendStatus] = useState('Not checked')
  const [microphoneStatus, setMicrophoneStatus] = useState('Not checked')
  const [isRecording, setIsRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [interviewId, setInterviewId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [candidateAnswer, setCandidateAnswer] = useState('')
  const [isResponding, setIsResponding] = useState(false)
  const [interviewError, setInterviewError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'ending' | 'finished' | 'error'
  >('idle')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const interviewSocketRef = useRef<WebSocket | null>(null)
  const waitingForReplyRef = useRef(false)
  const endingInterviewRef = useRef(false)
  const currentReplyIdRef = useRef<string | null>(null)
  const conversationRef = useRef<HTMLOListElement | null>(null)
  const followConversationRef = useRef(true)
  const diagramRef = useRef<readonly ExcalidrawElement[]>([])
  const diagramRevisionRef = useRef(0)

  useEffect(() => {
    const conversation = conversationRef.current
    if (conversation && followConversationRef.current) {
      conversation.scrollTop = conversation.scrollHeight
    }
  }, [messages, isResponding])
async function checkMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    })

    setMicrophoneStatus('Microphone access granted')

    stream.getTracks().forEach((track) => track.stop())
  } catch (error) {
    console.error(error)
    setMicrophoneStatus('Could not access the microphone')
  }
}
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

  function speakQuestion() {
  const question = new SpeechSynthesisUtterance(
    'How would your application handle a database failure?'
  )

  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(question)
}
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        console.log('Captured audio bytes:', event.data.size)
        setAudioUrl(URL.createObjectURL(event.data))
        setRecordedAudio(event.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        recorderRef.current = null
        setIsRecording(false)
      }

      recorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error(error)
      setMicrophoneStatus('Could not start recording')
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }

useEffect(() => {
  return () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
  }
}, [audioUrl])

  useEffect(() => {
    return () => {
      interviewSocketRef.current?.close()
    }
  }, [])

async function startInterview() {
  if (isCreatingSession || (hasStarted && connectionStatus !== 'finished' && connectionStatus !== 'error')) {
    return
  }

  setIsCreatingSession(true)
  setInterviewError('')

  try {
    if (interviewId) {
      const previousSocket = interviewSocketRef.current
      if (previousSocket) {
        previousSocket.onopen = null
        previousSocket.onmessage = null
        previousSocket.onerror = null
        previousSocket.onclose = null
        previousSocket.close(1000, 'Starting a new interview')
      }
      interviewSocketRef.current = null

      const cleanup = await fetch(
        `http://127.0.0.1:8000/interviews/${interviewId}/finish`,
        { method: 'POST' }
      )
      if (!cleanup.ok && cleanup.status !== 404) {
        throw new Error('Could not close the previous session. Please retry.')
      }
    }

    const response = await fetch('http://127.0.0.1:8000/interviews', {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(`Could not create interview: ${response.status}`)
    }

    const session = await response.json()
    setInterviewId(session.id)
    diagramRevisionRef.current = 0
    console.log('Created interview:', session)
    setHasStarted(true)
    setConnectionStatus('idle')
    setMessages([])
    setCandidateAnswer('')
    setIsResponding(false)
    waitingForReplyRef.current = false
    endingInterviewRef.current = false
    currentReplyIdRef.current = null
  } catch (error) {
    console.error(error)
    setConnectionStatus('error')
    setInterviewError(error instanceof Error ? error.message : 'Could not create an interview. Please retry.')
  } finally {
    setIsCreatingSession(false)
  }
}
  async function checkInterview() {
    if (!interviewId) {
      return
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/interviews/${interviewId}`
      )

      if (!response.ok) {
        throw new Error(`Could not retrieve interview: ${response.status}`)
      }

      const session = await response.json()
      console.log('Retrieved interview:', session)
    } catch (error) {
      console.error(error)
    }
  }

  async function connectInterviewer() {
    if (
      isCreatingSession ||
      !interviewId ||
      connectionStatus === 'connecting' ||
      connectionStatus === 'connected' ||
      connectionStatus === 'ending' ||
      connectionStatus === 'finished'
    ) {
      return
    }

    setConnectionStatus('connecting')
    followConversationRef.current = true
    setInterviewError('')
    setMessages([])
    setIsResponding(true)
    waitingForReplyRef.current = true

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/interviews/${interviewId}/start`,
        { method: 'POST' }
      )

      if (!response.ok) {
        throw new Error(`Could not start interviewer: ${response.status}`)
      }

      const session = await response.json()
      console.log('Interviewer connected:', session)

      const replyId = crypto.randomUUID()
      currentReplyIdRef.current = replyId
      setMessages([{ id: replyId, role: 'interviewer', text: '' }])

      const socket = new WebSocket(
        `ws://127.0.0.1:8000/interviews/${session.id}/ws`
      )
      interviewSocketRef.current = socket

      socket.onopen = () => {
        setConnectionStatus('connected')
      }

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        console.log('Interviewer message:', message)

        if (message.type === 'delta') {
          const replyId = currentReplyIdRef.current
          setMessages((previous) => previous.map((entry) => (
            entry.id === replyId
              ? { ...entry, text: entry.text + message.text }
              : entry
          )))
        } else if (message.type === 'turn_completed') {
          if (!endingInterviewRef.current) {
            waitingForReplyRef.current = false
            setIsResponding(false)
          }
          setCandidateAnswer('')
        } else if (message.type === 'wrap_up_started') {
          const replyId = crypto.randomUUID()
          currentReplyIdRef.current = replyId
          setMessages((previous) => [
            ...previous,
            { id: replyId, role: 'interviewer', text: '', kind: 'wrap_up' },
          ])
          setIsResponding(true)
        } else if (message.type === 'session_finished') {
          endingInterviewRef.current = true
          waitingForReplyRef.current = false
          setIsResponding(false)
          setConnectionStatus('finished')
          setInterviewError('')
        } else if (message.type === 'error') {
          setInterviewError(message.message)
          waitingForReplyRef.current = false
          setIsResponding(false)
        }
      }

      socket.onerror = () => {
        setConnectionStatus('error')
        waitingForReplyRef.current = false
        setIsResponding(false)
        setInterviewError('Could not connect to the interviewer. Use New interview to retry.')
      }

      socket.onclose = (event) => {
        console.log('Interviewer disconnected:', event.code)
        waitingForReplyRef.current = false
        setIsResponding(false)

        if (endingInterviewRef.current && event.wasClean && event.code === 1000) {
          setConnectionStatus('finished')
          setInterviewError('')
          return
        }

        setConnectionStatus('error')
        setInterviewError((previous) => previous || 'The interview connection closed. Use New interview to retry.')
      }
    } catch (error) {
      console.error(error)
      setConnectionStatus('error')
      waitingForReplyRef.current = false
      setIsResponding(false)
      setInterviewError('Could not start the interviewer. Please try again.')
    }
  }

  function sendAnswer() {
    const socket = interviewSocketRef.current
    const answer = candidateAnswer.trim()

    if (
      !answer ||
      connectionStatus !== 'connected' ||
      socket?.readyState !== WebSocket.OPEN ||
      waitingForReplyRef.current
    ) {
      return
    }

    // A ref blocks a second click immediately, before React renders the disabled button.
    waitingForReplyRef.current = true

    try {
      const revision = diagramRevisionRef.current + 1
      const message = {
        type: 'answer',
        text: answer,
        diagram: {
          revision,
          elements: diagramRef.current.filter(
            (element) => !element.isDeleted
          ),
        },
      }

      socket.send(JSON.stringify(message))
      diagramRevisionRef.current = revision
      followConversationRef.current = true
      const replyId = crypto.randomUUID()
      const answerId = crypto.randomUUID()
      currentReplyIdRef.current = replyId
      setMessages((previous) => [
        ...previous,
        {
          id: answerId,
          role: 'candidate',
          text: answer,
          diagramRevision: revision,
        },
        { id: replyId, role: 'interviewer', text: '' },
      ])
      setInterviewError('')
      setIsResponding(true)
    } catch (error) {
      console.error(error)
      waitingForReplyRef.current = false
      setIsResponding(false)
      setInterviewError('Your answer could not be sent. Your draft has been kept.')
    }
  }

  function endInterview() {
    const socket = interviewSocketRef.current

    if (connectionStatus !== 'connected' || socket?.readyState !== WebSocket.OPEN) {
      return
    }

    endingInterviewRef.current = true
    waitingForReplyRef.current = true
    setConnectionStatus('ending')
    setIsResponding(true)
    setInterviewError('')
    try {
      socket.send(JSON.stringify({ type: 'finish' }))
    } catch (error) {
      console.error(error)
      endingInterviewRef.current = false
      waitingForReplyRef.current = false
      setIsResponding(false)
      setConnectionStatus('error')
      setInterviewError('Could not request the wrap-up. Use New interview to retry.')
    }
  }

  const statusLabel = {
    idle: hasStarted ? 'Ready to connect' : 'Not started',
    connecting: 'Connecting',
    connected: isResponding ? 'Interviewer responding' : 'Your turn',
    ending: 'Preparing wrap-up',
    finished: 'Session finished',
    error: 'Connection interrupted',
  }[connectionStatus]

  return (
    <main className="app">
      <header>
        <h1>ArchProbe</h1>
        <p>CI/CD design interview practice</p>
      </header>

      <div className="session-controls">
        <button
          type="button"
          onClick={startInterview}
          disabled={isCreatingSession || (hasStarted && connectionStatus !== 'finished' && connectionStatus !== 'error')}
        >
          {isCreatingSession ? 'Creating…' : hasStarted ? 'New interview' : 'Create interview'}
        </button>
        <button
          type="button"
          onClick={connectInterviewer}
          disabled={
            isCreatingSession ||
            !interviewId ||
            connectionStatus === 'connecting' ||
            connectionStatus === 'connected' ||
            connectionStatus === 'ending' ||
            connectionStatus === 'finished'
          }
        >
          Connect interviewer
        </button>
        <button
          type="button"
          onClick={endInterview}
          disabled={connectionStatus !== 'connected'}
        >
          End interview
        </button>
      </div>
      <p className="session-status" role="status">Status: {statusLabel}</p>
      <section>
        <h2>Architecture diagram</h2>
        <Whiteboard
          onDiagramChange={(elements) => {
            diagramRef.current = elements
          }}
        />
      </section>

      <section aria-label="Interview conversation">
        <h2>Conversation</h2>
        <ol
          className="conversation"
          ref={conversationRef}
          onScroll={(event) => {
            const list = event.currentTarget
            followConversationRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80
          }}
        >
          {messages.length === 0 && (
            <li className="empty-message">Create an interview and connect to start.</li>
          )}
          {messages.map((message, index) => (
            <li key={message.id} className={`message message-${message.role}`}>
              <strong>{message.kind === 'wrap_up' ? 'Wrap-up' : message.role === 'interviewer' ? 'Interviewer' : 'You'}</strong>
              {message.diagramRevision !== undefined && (
                <small> · Diagram revision {message.diagramRevision}</small>
              )}
              <p>
                {message.text || (
                  isResponding && index === messages.length - 1
                    ? 'Waiting for a response…'
                    : 'No response received.'
                )}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {interviewError && <p className="error" role="alert">{interviewError}</p>}
      {connectionStatus === 'finished' && <p role="status">Interview finished.</p>}

      <form className="answer-form" onSubmit={(event) => {
        event.preventDefault()
        sendAnswer()
      }}>
        <label htmlFor="candidate-answer">Your answer</label>
        <textarea
          id="candidate-answer"
          value={candidateAnswer}
          onChange={(event) => setCandidateAnswer(event.target.value)}
          disabled={connectionStatus !== 'connected' || isResponding}
          placeholder="Type your answer or ask a clarifying question."
          rows={4}
        />
        <div className="answer-actions">
          <button
            type="submit"
            disabled={connectionStatus !== 'connected' || isResponding || !candidateAnswer.trim()}
          >
            Send answer
          </button>
          {isResponding && <span role="status">Interviewer is responding…</span>}
        </div>
      </form>

      <details className="test-controls">
        <summary>Test controls</summary>
        <div className="test-section">
          <h2>Backend</h2>
          <div className="button-row">
            <button type="button" onClick={checkBackend}>Check backend</button>
            <button type="button" onClick={checkInterview} disabled={!interviewId}>
              Check interview
            </button>
          </div>
          <p role="status">{backendStatus}</p>
        </div>
        <div className="test-section">
          <h2>Audio</h2>
          <p>These tests are separate from the interview.</p>
          <div className="button-row">
            <button type="button" onClick={speakQuestion}>Test speaker</button>
            <button type="button" onClick={checkMicrophone}>Check microphone</button>
            <button type="button" onClick={startRecording} disabled={isRecording}>
              Start recording
            </button>
            <button type="button" onClick={stopRecording} disabled={!isRecording}>
              Stop recording
            </button>
          </div>
          <p role="status">{isRecording ? 'Recording…' : microphoneStatus}</p>
          {recordedAudio && <p>Recording captured: {recordedAudio.size} bytes</p>}
          {audioUrl && <audio controls src={audioUrl} />}
        </div>
      </details>
    </main>
  )
}

export default App
