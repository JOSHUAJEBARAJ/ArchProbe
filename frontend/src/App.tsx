import { useEffect, useRef, useState } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import './App.css'
import Whiteboard from './Whiteboard'
import SavedDiagram from './SavedDiagram'
import type { SavedDiagramSnapshot } from './SavedDiagram'
import FeedbackText from './FeedbackText'
import type { FeedbackEvidence } from './FeedbackText'
import { createSilenceDetector } from './silenceDetector'

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

type ScenarioSummary = {
  id: string
  title: string
}

type CodexModel = {
  id: string
  model: string
  display_name: string
  default_reasoning_effort: string
  supported_reasoning_efforts: { effort: string; description: string }[]
  is_default: boolean
}

type VoiceAnswer = {
  socket: WebSocket
  audio: Blob | null
  diagram: readonly ExcalidrawElement[]
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
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true)
  const [scenarioError, setScenarioError] = useState('')
  const [codexModels, setCodexModels] = useState<CodexModel[]>([])
  const [selectedModel, setSelectedModel] = useState('gpt-6.1-sol')
  const [selectedEffort, setSelectedEffort] = useState('medium')
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [hasStarted, setHasStarted] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [backendStatus, setBackendStatus] = useState('Not checked')
  const [microphoneStatus, setMicrophoneStatus] = useState('Not checked')
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null)
  const [transcript, setTranscript] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
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
  const [voiceStatus, setVoiceStatus] = useState('')
  const [isStartingMicrophone, setIsStartingMicrophone] = useState(false)
  const [isInterviewRecording, setIsInterviewRecording] = useState(false)
  const [canRetryVoice, setCanRetryVoice] = useState(false)
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null)
  const [pauseDetectionError, setPauseDetectionError] = useState('')
  const [isInterviewPaused, setIsInterviewPaused] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [interviewError, setInterviewError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'ending' | 'finished' | 'error'
  >('idle')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const voiceAnswerRef = useRef<VoiceAnswer | null>(null)
  const voiceUploadRef = useRef<AbortController | null>(null)
  const silenceCleanupRef = useRef<(() => void) | null>(null)
  const interviewPausedRef = useRef(false)
  const pendingSpeechRef = useRef('')
  const interviewSocketRef = useRef<WebSocket | null>(null)
  const waitingForReplyRef = useRef(false)
  const endingInterviewRef = useRef(false)
  const currentReplyIdRef = useRef<string | null>(null)
  const replyTextRef = useRef('')
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null)
  const conversationRef = useRef<HTMLOListElement | null>(null)
  const followConversationRef = useRef(true)
  const diagramRef = useRef<readonly ExcalidrawElement[]>([])
  const diagramRevisionRef = useRef(0)
  const historyRequestRef = useRef(0)
  const interviewListRequestRef = useRef(0)
  const deletingInterviewRef = useRef<string | null>(null)
  const viewedInterviewRef = useRef<string | null>(null)
  const savedDiagramSectionRef = useRef<HTMLElement | null>(null)
  const savedConversationRef = useRef<HTMLOListElement | null>(null)
  const settingsDialogRef = useRef<HTMLDialogElement | null>(null)
  const historyDialogRef = useRef<HTMLDialogElement | null>(null)
  const modelSettingsLocked = isCreatingSession || (hasStarted && connectionStatus !== 'finished' && connectionStatus !== 'error')
  const selectedModelInfo = codexModels.find((item) => item.model === selectedModel)
  const viewedDiagramMessage = savedMessages.find(
    (message) => message.id === viewedDiagramMessageId
  )

  useEffect(() => {
    const controller = new AbortController()

    async function loadScenarios() {
      try {
        const response = await fetch('http://127.0.0.1:8000/scenarios', {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Could not load scenarios: ${response.status}`)
        }
        const choices: ScenarioSummary[] = await response.json()
        if (choices.length === 0) {
          throw new Error('No scenarios are available.')
        }
        if (!controller.signal.aborted) {
          setScenarios(choices)
          setSelectedScenarioId(choices[0].id)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error)
          setScenarioError('Could not load scenarios. Check the backend and refresh this page.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingScenarios(false)
        }
      }
    }

    void loadScenarios()
    return () => controller.abort()
  }, [])

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

  function openSavedMessage(messageId: number) {
    const message = savedConversationRef.current?.querySelector<HTMLElement>(
      `#saved-message-${messageId}`
    )
    if (!message) return
    message.scrollIntoView({ block: 'center' })
    message.focus({ preventScroll: true })
  }

  async function loadCodexModels() {
    if (isLoadingModels || modelSettingsLocked) return
    setIsLoadingModels(true)
    setModelsError('')
    try {
      const response = await fetch('http://127.0.0.1:8000/codex/models')
      const choices = await response.json()
      if (!response.ok) throw new Error(choices.detail || 'Could not load Codex models.')
      if (!Array.isArray(choices) || choices.length === 0) throw new Error('Codex returned no models.')
      const models: CodexModel[] = choices
      const choice = models.find((item) => item.model === selectedModel)
        || models.find((item) => item.is_default) || models[0]
      setCodexModels(models)
      setSelectedModel(choice.model)
      setSelectedEffort(choice.supported_reasoning_efforts.some((item) => item.effort === selectedEffort)
        ? selectedEffort : choice.default_reasoning_effort)
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : 'Could not load Codex models.')
    } finally {
      setIsLoadingModels(false)
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
    if (voiceAnswerRef.current || voiceUploadRef.current) return
    stopSpeaking()
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
      setTranscript('')
      setIsRecording(true)
    } catch (error) {
      console.error(error)
      setMicrophoneStatus('Could not start recording')
    }
  }

  function stopRecording() {
    silenceCleanupRef.current?.()
    silenceCleanupRef.current = null
    setSilenceCountdown(null)
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }

  function startSilenceDetection(stream: MediaStream) {
    setPauseDetectionError('')
    let context: AudioContext | null = null
    try {
      context = new AudioContext()
      const audioContext = context
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      const samples = new Float32Array(analyser.fftSize)
      const sample = createSilenceDetector()
      const timer = window.setInterval(() => {
        if (audioContext.state !== 'running') return
        analyser.getFloatTimeDomainData(samples)
        const volume = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
        const remaining = sample(volume, performance.now())
        setSilenceCountdown(remaining !== null && remaining < 4500 ? Math.ceil(remaining / 1000) : null)
        if (remaining === 0) finishVoiceAnswer()
      }, 100)
      const cleanup = () => {
        window.clearInterval(timer)
        source.disconnect()
        analyser.disconnect()
        void audioContext.close().catch(() => {})
      }
      silenceCleanupRef.current = cleanup
      void audioContext.resume().catch(() => {
        if (silenceCleanupRef.current !== cleanup) return
        cleanup()
        silenceCleanupRef.current = null
        setPauseDetectionError('Automatic pause detection is unavailable. Use Stop recording.')
      })
    } catch {
      if (context) void context.close().catch(() => {})
      setPauseDetectionError('Automatic pause detection is unavailable. Use Stop recording.')
    }
  }

  function cancelVoiceAnswer() {
    voiceAnswerRef.current = null
    voiceUploadRef.current?.abort()
    if (voiceUploadRef.current) setIsTranscribing(false)
    voiceUploadRef.current = null
    stopRecording()
    setIsInterviewRecording(false)
    setIsStartingMicrophone(false)
    setCanRetryVoice(false)
    setVoiceStatus('')
  }

  async function startVoiceAnswer() {
    const socket = interviewSocketRef.current
    if (
      !socket || socket.readyState !== WebSocket.OPEN ||
      endingInterviewRef.current || waitingForReplyRef.current || interviewPausedRef.current ||
      speechRef.current || recorderRef.current || voiceAnswerRef.current || voiceUploadRef.current
    ) return

    const answer: VoiceAnswer = { socket, audio: null, diagram: [] }
    voiceAnswerRef.current = answer
    setIsStartingMicrophone(true)
    setVoiceStatus('Opening microphone…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (voiceAnswerRef.current !== answer || socket.readyState !== WebSocket.OPEN) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream)
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop())
        throw error
      }
      recorderRef.current = recorder
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onstop = () => {
        silenceCleanupRef.current?.()
        silenceCleanupRef.current = null
        setSilenceCountdown(null)
        stream.getTracks().forEach((track) => track.stop())
        if (recorderRef.current === recorder) recorderRef.current = null
        setIsRecording(false)
        setIsInterviewRecording(false)
        if (voiceAnswerRef.current !== answer) return
        answer.audio = new Blob(chunks, { type: recorder.mimeType })
        void transcribeVoiceAnswer(answer)
      }
      recorder.onerror = () => {
        cancelVoiceAnswer()
        setVoiceStatus('Recording failed. Please try recording again.')
      }
      try {
        recorder.start()
      } catch (error) {
        recorderRef.current = null
        stream.getTracks().forEach((track) => track.stop())
        throw error
      }
      setIsRecording(true)
      setIsInterviewRecording(true)
      setVoiceStatus('Listening. Explain your design while drawing.')
      startSilenceDetection(stream)
    } catch {
      if (voiceAnswerRef.current === answer) {
        voiceAnswerRef.current = null
        setVoiceStatus('Could not open the microphone. Check microphone permissions.')
      }
    } finally {
      setIsStartingMicrophone(false)
    }
  }

  function finishVoiceAnswer() {
    const answer = voiceAnswerRef.current
    if (!answer || recorderRef.current?.state !== 'recording') return
    // Keep the diagram as it was when speaking ended, even if drawing continues.
    answer.diagram = structuredClone(diagramRef.current.filter((element) => !element.isDeleted))
    setVoiceStatus('Finishing recording…')
    stopRecording()
  }

  async function transcribeVoiceAnswer(answer: VoiceAnswer) {
    if (!answer.audio || voiceUploadRef.current || voiceAnswerRef.current !== answer) return
    const controller = new AbortController()
    voiceUploadRef.current = controller
    setIsTranscribing(true)
    setCanRetryVoice(false)
    setVoiceStatus('Transcribing your answer…')
    try {
      const formData = new FormData()
      formData.append('file', answer.audio, 'recording')
      const response = await fetch('http://127.0.0.1:8000/audio/check', {
        method: 'POST', body: formData, signal: controller.signal,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Transcription failed.')
      if (voiceAnswerRef.current !== answer || controller.signal.aborted) return
      if (!result.transcript?.trim()) throw new Error('No text returned. Try recording again.')
      if (!sendAnswer(result.transcript, answer.diagram, answer.socket)) {
        throw new Error('Could not send your answer. The recording has been kept.')
      }
      voiceAnswerRef.current = null
      setVoiceStatus('Answer sent. Waiting for the interviewer…')
    } catch (error) {
      if (voiceAnswerRef.current === answer && !controller.signal.aborted) {
        setVoiceStatus(error instanceof Error ? error.message : 'Could not transcribe your answer.')
        setCanRetryVoice(true)
      }
    } finally {
      if (voiceUploadRef.current === controller) {
        voiceUploadRef.current = null
        setIsTranscribing(false)
      }
    }
  }

  function stopSpeaking() {
    speechRef.current = null
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
  }

  function pauseInterview() {
    interviewPausedRef.current = true
    setIsInterviewPaused(true)
    if (speechRef.current) pendingSpeechRef.current = speechRef.current.text
    stopSpeaking()
    cancelVoiceAnswer()
    setVoiceStatus('Paused. Any unsent recording was discarded. Resume when you are ready.')
  }

  function resumeInterview() {
    interviewPausedRef.current = false
    setIsInterviewPaused(false)
    setVoiceStatus('')
    if (pendingSpeechRef.current) {
      const text = pendingSpeechRef.current
      pendingSpeechRef.current = ''
      speakInterviewer(text)
    } else {
      void startVoiceAnswer()
    }
  }

  function speakInterviewer(text: string, listenAfter = true) {
    if (!text.trim()) return
    if (interviewPausedRef.current && listenAfter) {
      pendingSpeechRef.current = text
      return
    }
    stopSpeaking()
    if (!('speechSynthesis' in window)) {
      setSpeechError('This browser does not support speech playback.')
      return
    }

    // Stop microphone capture before playing the interviewer's voice.
    cancelVoiceAnswer()
    const speech = new SpeechSynthesisUtterance(text)
    const socket = interviewSocketRef.current
    speech.lang = 'en-US'
    speechRef.current = speech
    setSpeechError('')
    setIsSpeaking(true)
    speech.onend = () => {
      if (speechRef.current === speech) {
        speechRef.current = null
        setIsSpeaking(false)
        if (
          listenAfter && socket === interviewSocketRef.current &&
          socket?.readyState === WebSocket.OPEN &&
          !endingInterviewRef.current && !interviewPausedRef.current
        ) {
          void startVoiceAnswer()
        }
      }
    }
    speech.onerror = () => {
      if (speechRef.current === speech) {
        speechRef.current = null
        setIsSpeaking(false)
        setSpeechError('Speech playback failed. Check browser audio permissions.')
      }
    }
    window.speechSynthesis.speak(speech)
  }

  async function uploadRecording() {
    if (!recordedAudio || isTranscribing) return

    setIsTranscribing(true)
    setTranscript('')
    setMicrophoneStatus('Transcribing recording…')

    const formData = new FormData()
    formData.append('file', recordedAudio, 'recording')

    try {
      const response = await fetch('http://127.0.0.1:8000/audio/check', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.detail || 'Could not transcribe the recording')
      }

      setTranscript(result.transcript)
      setMicrophoneStatus(result.transcript ? 'Transcription complete.' : 'No text returned. Try recording again.')
    } catch (error) {
      setMicrophoneStatus(error instanceof Error ? error.message : 'Could not transcribe the recording')
    } finally {
      setIsTranscribing(false)
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
      voiceAnswerRef.current = null
      voiceUploadRef.current?.abort()
      silenceCleanupRef.current?.()
      silenceCleanupRef.current = null
      const recorder = recorderRef.current
      if (recorder) {
        recorder.onstop = null
        if (recorder.state === 'recording') recorder.stop()
        recorder.stream.getTracks().forEach((track) => track.stop())
      }
      speechRef.current = null
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

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
  interviewPausedRef.current = false
  setIsInterviewPaused(false)
  pendingSpeechRef.current = ''
  cancelVoiceAnswer()
  stopSpeaking()
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
    interviewPausedRef.current = false
    setIsInterviewPaused(false)
    pendingSpeechRef.current = ''
    stopSpeaking()
    replyTextRef.current = ''
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
      followConversationRef.current = true
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
      <header className="app-header">
        <div className="app-heading">
        <h1>ArchProbe</h1>
        <p>DevOps/SRE design interview practice</p>
        </div>
        <nav aria-label="App navigation">
          <button type="button" onClick={() => {
            historyDialogRef.current?.showModal()
            void loadSavedInterviews()
          }}>History</button>
          <button type="button" className="gear-button" aria-label="Open settings" title="Settings" onClick={() => {
            settingsDialogRef.current?.showModal()
            if (codexModels.length === 0) void loadCodexModels()
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="m9 3-.5 2-2 .9-1.9-.6-2 3.4L4 10v2l-1.4 1.3 2 3.4 1.9-.6 2 .9.5 2h4l.5-2 2-.9 1.9.6 2-3.4L20 12v-2l1.4-1.3-2-3.4-1.9.6-2-.9-.5-2Z" />
              <circle cx="12" cy="11" r="3" />
            </svg>
          </button>
        </nav>
      </header>

      <div className="interview-toolbar">
      <div className="scenario-picker">
        <label htmlFor="interview-scenario">Scenario</label>
        <select
          id="interview-scenario"
          value={selectedScenarioId}
          onChange={(event) => setSelectedScenarioId(event.target.value)}
          disabled={
            isLoadingScenarios ||
            scenarios.length === 0 ||
            deletingInterviewId !== null ||
            isCreatingSession ||
            (hasStarted && connectionStatus !== 'finished' && connectionStatus !== 'error')
          }
        >
          <option value="" disabled>
            {isLoadingScenarios ? 'Loading scenarios…' : 'Select a scenario'}
          </option>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>{scenario.title}</option>
          ))}
        </select>
      </div>
      {scenarioError && <p className="error" role="alert">{scenarioError}</p>}

      <div className="session-controls">
        <button
          type="button"
          onClick={startInterview}
          disabled={
            deletingInterviewId !== null ||
            isCreatingSession ||
            isLoadingScenarios ||
            isLoadingModels ||
            !scenarios.some((scenario) => scenario.id === selectedScenarioId) ||
            (hasStarted && connectionStatus !== 'finished' && connectionStatus !== 'error')
          }
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
      </div>
      <div className="interview-workspace">
      <section className="canvas-panel" aria-label="Architecture diagram">
        <Whiteboard
          onDiagramChange={(elements) => {
            diagramRef.current = elements
          }}
        />
      </section>
      <aside className="interview-sidebar" aria-label="Interview">
      <div className="sidebar-heading">
        <h2>Conversation</h2>
      <p className="session-status" role="status">Status: {statusLabel}</p>
      {isSpeaking && (
        <p role="status">
          Interviewer speaking…{' '}
          <button type="button" onClick={stopSpeaking}>Stop speaking</button>
        </p>
      )}
      {speechError && <p className="error" role="alert">{speechError}</p>}
      </div>

        <ol
          aria-label="Interview conversation"
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

      <section className="voice-controls" aria-label="Spoken answer">
      {interviewError && <p className="error" role="alert">{interviewError}</p>}
      {connectionStatus === 'finished' && <p role="status">Interview finished.</p>}
        <h2>Your voice</h2>
        <p className="voice-help">Your mic starts after each question. A five-second pause sends your answer.</p>
        <div className="button-row">
          <button
            type="button"
            onClick={isInterviewPaused ? resumeInterview : pauseInterview}
            disabled={connectionStatus !== 'connected'}
          >
            {isInterviewPaused ? 'Resume interview' : 'Pause interview'}
          </button>
          <button
            type="button"
            onClick={startVoiceAnswer}
            disabled={connectionStatus !== 'connected' || isInterviewPaused || isResponding || isSpeaking || isRecording || isStartingMicrophone || isTranscribing || canRetryVoice}
          >
            {isStartingMicrophone ? 'Opening microphone…' : 'Start recording'}
          </button>
          <button type="button" onClick={finishVoiceAnswer} disabled={!isInterviewRecording}>
            Stop recording
          </button>
          {canRetryVoice && (
            <>
              <button type="button" onClick={() => {
                const answer = voiceAnswerRef.current
                if (answer) void transcribeVoiceAnswer(answer)
              }}>Retry recording upload</button>
              <button type="button" onClick={cancelVoiceAnswer}>Discard recording</button>
            </>
          )}
        </div>
        {voiceStatus && <p role="status">{voiceStatus}</p>}
        {isInterviewRecording && silenceCountdown !== null && (
          <p role="status">Sending in {silenceCountdown} seconds unless you continue speaking…</p>
        )}
        {isInterviewRecording && pauseDetectionError && <p role="alert">{pauseDetectionError}</p>}
      </section>
      </aside>
      </div>

      <dialog ref={historyDialogRef} className="history-dialog" aria-labelledby="history-title">
        <div className="dialog-heading">
          <h2 id="history-title">Interview history</h2>
          <button type="button" onClick={() => historyDialogRef.current?.close()}>Close</button>
        </div>
        <div className="history-content">
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
          <ol ref={savedConversationRef}>
            {savedMessages.map((message) => (
              <li key={message.id} id={`saved-message-${message.id}`} className="saved-message" tabIndex={-1}>
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
                onViewMessage={openSavedMessage}
              />
              {savedFeedback.evidence.length === 0 && (
                <p>No supporting answer references were saved with this feedback.</p>
              )}
              {!historyError && !isLoadingHistory && savedMessages.some((message) => message.id === savedFeedback.message_id) && (
                <button
                  type="button"
                  className="feedback-reference"
                  onClick={() => openSavedMessage(savedFeedback.message_id)}
                >
                  View wrap-up in conversation
                </button>
              )}
            </>
          ) : (
            <p>No final feedback was saved for this interview.</p>
          )}
        </section>
      )}

        </div>
      </dialog>

      <dialog ref={settingsDialogRef} className="settings-dialog" aria-labelledby="settings-title">
        <div className="dialog-heading">
          <h2 id="settings-title">Settings</h2>
          <button type="button" onClick={() => settingsDialogRef.current?.close()}>Close</button>
        </div>
        <section className="test-section model-settings" aria-label="Interviewer model">
          <h2>Interviewer model</h2>
          <label htmlFor="codex-model">Model</label>
          <select id="codex-model" value={selectedModel} disabled={modelSettingsLocked || isLoadingModels || codexModels.length === 0} onChange={(event) => {
            const choice = codexModels.find((item) => item.model === event.target.value)
            if (!choice) return
            setSelectedModel(choice.model)
            setSelectedEffort(choice.default_reasoning_effort)
          }}>
            {codexModels.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
            {codexModels.map((item) => <option key={item.id} value={item.model}>{item.display_name}</option>)}
          </select>
          <label htmlFor="codex-effort">Reasoning effort</label>
          <select id="codex-effort" value={selectedEffort} disabled={modelSettingsLocked || isLoadingModels || !selectedModelInfo} onChange={(event) => setSelectedEffort(event.target.value)}>
            {!selectedModelInfo && <option value={selectedEffort}>{selectedEffort}</option>}
            {selectedModelInfo?.supported_reasoning_efforts.map((item) => <option key={item.effort} value={item.effort}>{item.effort}</option>)}
          </select>
          <p>{selectedModelInfo?.supported_reasoning_efforts.find((item) => item.effort === selectedEffort)?.description}</p>
          {modelSettingsLocked && <p>Model settings are locked for this interview. Choose again after it ends.</p>}
          {isLoadingModels && <p role="status">Loading models from Codex…</p>}
          {modelsError && <p className="error" role="alert">{modelsError}</p>}
          <button type="button" onClick={loadCodexModels} disabled={modelSettingsLocked || isLoadingModels}>Reload models</button>
        </section>
        <h2 className="settings-section-title">Troubleshooting</h2>
        <div className="test-section">
          <h2>Diagram</h2>
          <button type="button" onClick={() => {
            console.log('Diagram JSON:', JSON.stringify({ elements: diagramRef.current.filter((element) => !element.isDeleted) }, null, 2))
          }}>Check diagram in console</button>
        </div>
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
                  settingsDialogRef.current?.close()
                  historyDialogRef.current?.showModal()
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
            <button type="button" onClick={speakQuestion} disabled={connectionStatus === 'connected' || connectionStatus === 'ending'}>Test speaker</button>
            <button type="button" onClick={checkMicrophone}>Check microphone</button>
            <button type="button" onClick={startRecording} disabled={isRecording || isTranscribing || isStartingMicrophone || connectionStatus === 'connected' || connectionStatus === 'ending'}>
              Start recording
            </button>
            <button type="button" onClick={stopRecording} disabled={!isRecording || isInterviewRecording}>
              Stop recording
            </button>
            <button
              type="button"
              onClick={uploadRecording}
              disabled={!recordedAudio || isRecording || isTranscribing || connectionStatus === 'connected' || connectionStatus === 'ending'}
            >
              {isTranscribing ? 'Transcribing…' : 'Transcribe recording'}
            </button>
          </div>
          <p role="status">{isRecording ? 'Recording…' : microphoneStatus}</p>
          {recordedAudio && <p>Recording captured: {recordedAudio.size} bytes</p>}
          {audioUrl && <audio controls src={audioUrl} />}
          {transcript && <p><strong>Transcript:</strong> {transcript}</p>}
        </div>
      </dialog>
    </main>
  )
}

export default App
