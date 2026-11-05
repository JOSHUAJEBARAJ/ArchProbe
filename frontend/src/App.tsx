import { useEffect, useRef, useState } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import './App.css'
import Whiteboard from './Whiteboard'
import SavedDiagram from './SavedDiagram'
import type { SavedDiagramSnapshot } from './SavedDiagram'
import FeedbackText from './FeedbackText'
import type { FeedbackEvidence } from './FeedbackText'

type ChatMessage = {
  id: string
  role: 'interviewer' | 'candidate'
  text: string
  kind?: 'wrap_up'
  diagramRevision?: number
}

export type SavedMessage = {
  id: number
  role: 'interviewer' | 'candidate'
  text: string
  created_at: string
  diagram: SavedDiagramSnapshot | null
}

type SavedInterview = {
  id: string
  state: 'ready' | 'active' | 'finished' | 'interrupted'
  created_at: string
}

type SavedFeedback = {
  id: number
  interview_id: string
  message_id: number
  text: string
  created_at: string
  evidence: FeedbackEvidence[]
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
  const [savedMessages, setSavedMessages] = useState<SavedMessage[]>([])
  const [savedFeedback, setSavedFeedback] = useState<SavedFeedback | null>(null)
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [viewedDiagramMessageId, setViewedDiagramMessageId] = useState<number | null>(null)
  const [savedInterviews, setSavedInterviews] = useState<SavedInterview[]>([])
  const [deletingInterviewId, setDeletingInterviewId] = useState<string | null>(null)
  const [savedInterviewsError, setSavedInterviewsError] = useState('')
  const [viewedInterviewId, setViewedInterviewId] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')
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
  const historyRequestRef = useRef(0)
  const interviewListRequestRef = useRef(0)
  const deletingInterviewRef = useRef<string | null>(null)
  const viewedInterviewRef = useRef<string | null>(null)
  const savedDiagramSectionRef = useRef<HTMLElement | null>(null)
  const viewedDiagramMessage = savedMessages.find(
    (message) => message.id === viewedDiagramMessageId
  )

  useEffect(() => {
    const conversation = conversationRef.current
    if (conversation && followConversationRef.current) {
      conversation.scrollTop = conversation.scrollHeight
    }
  }, [messages, isResponding])

  useEffect(() => {
    if (viewedDiagramMessageId !== null) {
      savedDiagramSectionRef.current?.scrollIntoView({ block: 'start' })
    }
  }, [viewedDiagramMessageId])

  function openSavedDiagram(messageId: number) {
    setViewedDiagramMessageId(messageId)
    if (viewedDiagramMessageId === messageId) {
      savedDiagramSectionRef.current?.scrollIntoView({ block: 'start' })
    }
  }
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
  if (deletingInterviewRef.current || isCreatingSession || (hasStarted && connectionStatus !== 'finished' && connectionStatus !== 'error')) {
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

  async function loadSavedInterviews() {
    if (deletingInterviewRef.current) {
      return
    }
    const requestId = ++interviewListRequestRef.current
    setSavedInterviewsError('')
    try {
      const response = await fetch('http://127.0.0.1:8000/interviews')

      if (!response.ok) {
        throw new Error(`Could not load interviews: ${response.status}`)
      }

      const interviews: SavedInterview[] = await response.json()
      if (requestId === interviewListRequestRef.current) {
        setSavedInterviews(interviews)
      }
    } catch (error) {
      console.error(error)
      if (requestId === interviewListRequestRef.current) {
        setSavedInterviewsError('Could not load saved interviews.')
      }
    }
  }

  async function deleteSavedInterview(id: string) {
    if (deletingInterviewRef.current || isCreatingSession) {
      return
    }
    deletingInterviewRef.current = id
    setDeletingInterviewId(id)
    ++interviewListRequestRef.current
    setSavedInterviewsError('')

    try {
      const response = await fetch(`http://127.0.0.1:8000/interviews/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        throw new Error(
          typeof errorBody?.detail === 'string'
            ? errorBody.detail
            : `Could not delete interview: ${response.status}`
        )
      }

      setSavedInterviews((previous) => previous.filter((item) => item.id !== id))
      if (viewedInterviewRef.current === id) {
        ++historyRequestRef.current
        viewedInterviewRef.current = null
        setViewedInterviewId(null)
        setSavedMessages([])
        setSavedFeedback(null)
        setIsLoadingFeedback(false)
        setFeedbackError('')
        setViewedDiagramMessageId(null)
        setHistoryError('')
        setIsLoadingHistory(false)
      }
      if (interviewId === id) {
        setInterviewId(null)
        setHasStarted(false)
        setConnectionStatus('idle')
        setMessages([])
        setCandidateAnswer('')
        setInterviewError('')
        setIsResponding(false)
        waitingForReplyRef.current = false
        endingInterviewRef.current = false
        currentReplyIdRef.current = null
        interviewSocketRef.current = null
      }
    } catch (error) {
      console.error(error)
      setSavedInterviewsError(error instanceof Error ? error.message : 'Could not delete interview.')
    } finally {
      deletingInterviewRef.current = null
      setDeletingInterviewId(null)
    }
  }

  async function loadSavedFeedback(id: string, requestId: number) {
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/interviews/${id}/feedback`
      )
      if (!response.ok) {
        throw new Error(`Could not load feedback: ${response.status}`)
      }
      const feedback: SavedFeedback | null = await response.json()
      if (requestId === historyRequestRef.current) {
        setSavedFeedback(feedback)
      }
    } catch (error) {
      console.error(error)
      if (requestId === historyRequestRef.current) {
        setFeedbackError('Could not load final feedback. Reload this conversation to try again.')
      }
    } finally {
      if (requestId === historyRequestRef.current) {
        setIsLoadingFeedback(false)
      }
    }
  }

  async function loadSavedMessages(id: string) {
    if (deletingInterviewRef.current === id) {
      return
    }
    const requestId = ++historyRequestRef.current
    viewedInterviewRef.current = id
    setViewedInterviewId(id)
    setSavedMessages([])
    setSavedFeedback(null)
    setIsLoadingFeedback(true)
    setFeedbackError('')
    setViewedDiagramMessageId(null)
    setIsLoadingHistory(true)
    setHistoryError('')
    void loadSavedFeedback(id, requestId)

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/interviews/${id}/messages`
      )

      if (!response.ok) {
        throw new Error(`Could not load messages: ${response.status}`)
      }

      const loadedMessages: SavedMessage[] = await response.json()
      if (requestId !== historyRequestRef.current) {
        return
      }
      setSavedMessages(loadedMessages)
    } catch (error) {
      console.error(error)
      if (requestId === historyRequestRef.current) {
        setHistoryError('Could not load saved messages. Please try again.')
      }
    } finally {
      if (requestId === historyRequestRef.current) {
        setIsLoadingHistory(false)
      }
    }
  }

  async function connectInterviewer() {
    if (
      deletingInterviewRef.current ||
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
          disabled={deletingInterviewId !== null || isCreatingSession || (hasStarted && connectionStatus !== 'finished' && connectionStatus !== 'error')}
        >
          {isCreatingSession ? 'Creating…' : hasStarted ? 'New interview' : 'Create interview'}
        </button>
        <button
          type="button"
          onClick={connectInterviewer}
          disabled={
            deletingInterviewId !== null ||
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

      <section aria-label="Saved interviews">
        <h2>Saved interviews</h2>

        <button type="button" onClick={loadSavedInterviews} disabled={deletingInterviewId !== null}>
          Load saved interviews
        </button>
        <p>Deleting an interview permanently removes its messages and diagram snapshots.</p>
        {savedInterviewsError && <p className="error" role="alert">{savedInterviewsError}</p>}

        <ul>
          {savedInterviews.map((interview) => (
            <li key={interview.id}>
              {interview.created_at} — {interview.state}
              <br />
              {interview.id}
              {' '}
              <button
                type="button"
                onClick={() => loadSavedMessages(interview.id)}
                disabled={deletingInterviewId === interview.id}
              >
                View conversation
              </button>
              {' '}
              <button
                type="button"
                onClick={() => deleteSavedInterview(interview.id)}
                disabled={
                  deletingInterviewId !== null ||
                  isCreatingSession ||
                  interview.state === 'active' ||
                  (interview.id === interviewId && (
                    connectionStatus === 'connecting' ||
                    connectionStatus === 'connected' ||
                    connectionStatus === 'ending'
                  ))
                }
              >
                {deletingInterviewId === interview.id ? 'Deleting…' : 'Delete interview'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Saved conversation">
        <h2>Saved conversation</h2>
        {viewedInterviewId && <p>Interview: {viewedInterviewId}</p>}

        {isLoadingHistory ? (
          <p role="status">Loading saved messages…</p>
        ) : historyError ? (
          <p className="error" role="alert">{historyError}</p>
        ) : !viewedInterviewId ? (
          <p>Choose an interview to view its saved conversation.</p>
        ) : savedMessages.length === 0 ? (
          <p>No saved messages for this interview.</p>
        ) : (
          <ol>
            {savedMessages.map((message) => (
              <li key={message.id} id={`saved-message-${message.id}`}>
                <strong>
                  {savedFeedback?.message_id === message.id
                    ? 'Final feedback'
                    : message.role === 'candidate' ? 'You' : 'Interviewer'}
                </strong>
                {message.role === 'candidate' && <small> · Answer {message.id}</small>}
                <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
                {message.diagram && (
                  <button
                    type="button"
                    onClick={() => openSavedDiagram(message.id)}
                    aria-pressed={viewedDiagramMessageId === message.id}
                  >
                    View diagram revision {message.diagram.revision}
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        {viewedDiagramMessage?.diagram && (
          <section aria-label="Saved diagram" ref={savedDiagramSectionRef}>
            <h3>Diagram revision {viewedDiagramMessage.diagram.revision}</h3>
            <p>Snapshot submitted with message {viewedDiagramMessage.id}. Read-only.</p>
            <button type="button" onClick={() => setViewedDiagramMessageId(null)}>
              Close diagram
            </button>
            <SavedDiagram
              key={`${viewedInterviewId}:${viewedDiagramMessage.id}`}
              snapshot={viewedDiagramMessage.diagram}
            />
          </section>
        )}
      </section>

      {viewedInterviewId && (
        <section aria-label="Final feedback">
          <h2>Final feedback</h2>
          {isLoadingFeedback ? (
            <p role="status">Loading final feedback…</p>
          ) : feedbackError ? (
            <p className="error" role="alert">{feedbackError}</p>
          ) : savedFeedback ? (
            <>
              <FeedbackText
                text={savedFeedback.text}
                evidence={savedFeedback.evidence}
                messages={savedMessages}
                onViewDiagram={openSavedDiagram}
              />
              {savedFeedback.evidence.length === 0 && (
                <p>No supporting answer references were saved with this feedback.</p>
              )}
              {!historyError && !isLoadingHistory && (
                <a href={`#saved-message-${savedFeedback.message_id}`}>
                  View wrap-up in conversation
                </a>
              )}
            </>
          ) : (
            <p>No final feedback was saved for this interview.</p>
          )}
        </section>
      )}

      <details className="test-controls">
        <summary>Test controls</summary>
        <div className="test-section">
          <h2>Backend</h2>
          <div className="button-row">
            <button type="button" onClick={checkBackend}>Check backend</button>
            <button type="button" onClick={checkInterview} disabled={!interviewId}>
              Check interview
            </button>
            <button
              type="button"
              onClick={() => {
                if (interviewId) {
                  loadSavedMessages(interviewId)
                }
              }}
              disabled={!interviewId}
            >
              Check saved messages
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
