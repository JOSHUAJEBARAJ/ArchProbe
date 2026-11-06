import { API_BASE_URL, WS_BASE_URL } from './api'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ChatMessage } from './ConversationPanel'
import type useInterviewSettings from './useInterviewSettings'
import useVoiceInterview from './useVoiceInterview'

type InterviewSessionOptions = {
  settings: ReturnType<typeof useInterviewSettings>
  deletingInterviewRef: RefObject<string | null>
  diagramRef: RefObject<readonly ExcalidrawElement[]>
}

export default function useInterviewSession({ settings, deletingInterviewRef, diagramRef }: InterviewSessionOptions) {
  const [hasStarted, setHasStarted] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [interviewId, setInterviewId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isResponding, setIsResponding] = useState(false)
  const [interviewError, setInterviewError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'ending' | 'finished' | 'error'
  >('idle')
  const interviewSocketRef = useRef<WebSocket | null>(null)
  const waitingForReplyRef = useRef(false)
  const endingInterviewRef = useRef(false)
  const currentReplyIdRef = useRef<string | null>(null)
  const replyTextRef = useRef('')
  const diagramRevisionRef = useRef(0)
  const { scenarios, selectedScenarioId, isLoadingScenarios, isLoadingModels, selectedModel, selectedEffort } = settings
  const voice = useVoiceInterview({ interviewSocketRef, waitingForReplyRef, endingInterviewRef, diagramRef, sendAnswer })
  const { resetVoice, cancelVoiceAnswer, speakInterviewer, stopSpeaking, interviewPausedRef } = voice
  const modelSettingsLocked = isCreatingSession || (hasStarted && connectionStatus !== 'finished' && connectionStatus !== 'error')


  async function startInterview() {
    if (
      deletingInterviewRef.current ||
      isCreatingSession ||
      isLoadingScenarios ||
      isLoadingModels ||
      !scenarios.some((scenario) => scenario.id === selectedScenarioId) ||
      (hasStarted && connectionStatus !== 'finished' && connectionStatus !== 'error')
    ) {
      return
    }

    setIsCreatingSession(true)
    resetVoice()
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
          `${API_BASE_URL}/interviews/${interviewId}/finish`,
          { method: 'POST' }
        )
        if (!cleanup.ok && cleanup.status !== 404) {
          throw new Error('Could not close the previous session. Please retry.')
        }
      }

      const response = await fetch(`${API_BASE_URL}/interviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: selectedScenarioId, model: selectedModel, reasoning_effort: selectedEffort }),
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
    resetVoice()
    replyTextRef.current = ''
    setInterviewError('')
    setMessages([])
    setIsResponding(true)
    waitingForReplyRef.current = true

    try {
      const response = await fetch(
        `${API_BASE_URL}/interviews/${interviewId}/start`,
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
        `${WS_BASE_URL}/interviews/${session.id}/ws`
      )
      interviewSocketRef.current = socket

      socket.onopen = () => {
        setConnectionStatus('connected')
      }

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        console.log('Interviewer message:', message)

        if (message.type === 'delta') {
          replyTextRef.current += message.text
          const replyId = currentReplyIdRef.current
          setMessages((previous) => previous.map((entry) => (
            entry.id === replyId
              ? { ...entry, text: entry.text + message.text }
              : entry
          )))
        } else if (message.type === 'turn_completed') {
          if (!endingInterviewRef.current) {
            speakInterviewer(replyTextRef.current)
          }
          replyTextRef.current = ''
          if (!endingInterviewRef.current) {
            waitingForReplyRef.current = false
            setIsResponding(false)
          }
        } else if (message.type === 'wrap_up_started') {
          replyTextRef.current = ''
          const replyId = crypto.randomUUID()
          currentReplyIdRef.current = replyId
          setMessages((previous) => [
            ...previous,
            { id: replyId, role: 'interviewer', text: '', kind: 'wrap_up' },
          ])
          setIsResponding(true)
        } else if (message.type === 'session_finished') {
          speakInterviewer(replyTextRef.current, false)
          replyTextRef.current = ''
          endingInterviewRef.current = true
          waitingForReplyRef.current = false
          setIsResponding(false)
          setConnectionStatus('finished')
          setInterviewError('')
        } else if (message.type === 'error') {
          cancelVoiceAnswer()
          stopSpeaking()
          setInterviewError(message.message)
          waitingForReplyRef.current = false
          setIsResponding(false)
        }
      }

      socket.onerror = () => {
        cancelVoiceAnswer()
        stopSpeaking()
        setConnectionStatus('error')
        waitingForReplyRef.current = false
        setIsResponding(false)
        setInterviewError('Could not connect to the interviewer. Use New interview to retry.')
      }

      socket.onclose = (event) => {
        cancelVoiceAnswer()
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
        stopSpeaking()
      }
    } catch (error) {
      console.error(error)
      setConnectionStatus('error')
      waitingForReplyRef.current = false
      setIsResponding(false)
      setInterviewError('Could not start the interviewer. Please try again.')
    }
  }

  function sendAnswer(
    text: string,
    elements = diagramRef.current,
    expectedSocket = interviewSocketRef.current,
  ): boolean {
    const socket = interviewSocketRef.current
    const answer = text.trim()

    if (
      !answer ||
      socket !== expectedSocket ||
      endingInterviewRef.current ||
      interviewPausedRef.current ||
      socket?.readyState !== WebSocket.OPEN ||
      waitingForReplyRef.current
    ) {
      return false
    }

    // A ref blocks a second click immediately, before React renders the disabled button.
    stopSpeaking()
    waitingForReplyRef.current = true

    try {
      const revision = diagramRevisionRef.current + 1
      const message = {
        type: 'answer',
        text: answer,
        diagram: {
          revision,
          elements: elements.filter(
            (element) => !element.isDeleted
          ),
        },
      }

      socket.send(JSON.stringify(message))
      diagramRevisionRef.current = revision
      const replyId = crypto.randomUUID()
      const answerId = crypto.randomUUID()
      currentReplyIdRef.current = replyId
      replyTextRef.current = ''
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
      return true
    } catch (error) {
      console.error(error)
      waitingForReplyRef.current = false
      setIsResponding(false)
      setInterviewError('Your answer could not be sent. Please retry the recording.')
      return false
    }
  }

  function endInterview() {
    const socket = interviewSocketRef.current

    if (connectionStatus !== 'connected' || socket?.readyState !== WebSocket.OPEN) {
      return
    }

    endingInterviewRef.current = true
    cancelVoiceAnswer()
    stopSpeaking()
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

  function resetDeletedInterview(id: string) {
    if (interviewId !== id) return
    resetVoice()
    setInterviewId(null)
    setHasStarted(false)
    setConnectionStatus('idle')
    setMessages([])
    setInterviewError('')
    setIsResponding(false)
    waitingForReplyRef.current = false
    endingInterviewRef.current = false
    currentReplyIdRef.current = null
    interviewSocketRef.current = null
  }

  useEffect(() => () => {
    const socket = interviewSocketRef.current
    if (socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      socket.close()
    }
  }, [])

  const statusLabel = {
    idle: hasStarted ? 'Ready to connect' : 'Not started',
    connecting: 'Connecting',
    connected: isResponding ? 'Interviewer responding' : 'Your turn',
    ending: 'Preparing wrap-up',
    finished: 'Session finished',
    error: 'Connection interrupted',
  }[connectionStatus]

  return {
    hasStarted,
    isCreatingSession,
    interviewId,
    messages,
    isResponding,
    interviewError,
    connectionStatus,
    voice,
    modelSettingsLocked,
    statusLabel,
    startInterview,
    connectInterviewer,
    endInterview,
    resetDeletedInterview,
  }
}
