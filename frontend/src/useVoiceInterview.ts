import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { createSilenceDetector } from './silenceDetector'
import useSpeechPlayback from './useSpeechPlayback'
import { startAudioRecording } from './audioRecording'
import { transcribeAudio } from './api'

type VoiceAnswer = {
  socket: WebSocket
  audio: Blob | null
  diagram: readonly ExcalidrawElement[]
}

type VoiceInterviewOptions = {
  interviewSocketRef: RefObject<WebSocket | null>
  waitingForReplyRef: RefObject<boolean>
  endingInterviewRef: RefObject<boolean>
  diagramRef: RefObject<readonly ExcalidrawElement[]>
  sendAnswer: (text: string, elements: readonly ExcalidrawElement[], socket: WebSocket) => boolean
}

export default function useVoiceInterview({ interviewSocketRef, waitingForReplyRef, endingInterviewRef, diagramRef, sendAnswer }: VoiceInterviewOptions) {
  const [microphoneStatus, setMicrophoneStatus] = useState('Not checked')
  const [isRecording, setIsRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null)
  const [transcript, setTranscript] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState('')
  const [isStartingMicrophone, setIsStartingMicrophone] = useState(false)
  const [isInterviewRecording, setIsInterviewRecording] = useState(false)
  const [canRetryVoice, setCanRetryVoice] = useState(false)
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null)
  const [pauseDetectionError, setPauseDetectionError] = useState('')
  const [isInterviewPaused, setIsInterviewPaused] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const diagnosticRecordingRef = useRef<object | null>(null)
  const voiceAnswerRef = useRef<VoiceAnswer | null>(null)
  const voiceUploadRef = useRef<AbortController | null>(null)
  const silenceCleanupRef = useRef<(() => void) | null>(null)
  const interviewPausedRef = useRef(false)
  const pendingSpeechRef = useRef('')
  const { isSpeaking, speechError, speak, stopSpeaking, getSpeakingText } = useSpeechPlayback()

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

  function speakQuestion() {
    const question = new SpeechSynthesisUtterance(
      'How would your application handle a database failure?'
    )

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(question)
  }

  async function startRecording() {
    if (voiceAnswerRef.current || voiceUploadRef.current || recorderRef.current || diagnosticRecordingRef.current) return
    const capture = {}
    diagnosticRecordingRef.current = capture
    setIsStartingMicrophone(true)
    stopSpeaking()
    try {
      const recorder = await startAudioRecording({
        isCurrent: () => diagnosticRecordingRef.current === capture,
        onStop: (audio) => {
          setAudioUrl(URL.createObjectURL(audio))
          setRecordedAudio(audio)
          recorderRef.current = null
          diagnosticRecordingRef.current = null
          setIsRecording(false)
        },
        onError: () => {
          recorderRef.current = null
          diagnosticRecordingRef.current = null
          setIsRecording(false)
          setMicrophoneStatus('Could not record audio. Please try again.')
        },
      })
      if (!recorder) return
      recorderRef.current = recorder
      setTranscript('')
      setIsRecording(true)
    } catch {
      if (diagnosticRecordingRef.current === capture) {
        diagnosticRecordingRef.current = null
        setMicrophoneStatus('Could not start recording')
      }
    } finally {
      setIsStartingMicrophone(false)
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
        void audioContext.close().catch(() => { })
      }
      silenceCleanupRef.current = cleanup
      void audioContext.resume().catch(() => {
        if (silenceCleanupRef.current !== cleanup) return
        cleanup()
        silenceCleanupRef.current = null
        setPauseDetectionError('Automatic pause detection is unavailable. Use Stop recording.')
      })
    } catch {
      if (context) void context.close().catch(() => { })
      setPauseDetectionError('Automatic pause detection is unavailable. Use Stop recording.')
    }
  }

  function cancelVoiceAnswer() {
    diagnosticRecordingRef.current = null
    voiceAnswerRef.current = null
    voiceUploadRef.current?.abort()
    if (voiceUploadRef.current) setIsTranscribing(false)
    voiceUploadRef.current = null
    stopRecording()
    recorderRef.current = null
    setIsRecording(false)
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
      getSpeakingText() !== null || recorderRef.current || voiceAnswerRef.current || voiceUploadRef.current
    ) return

    const answer: VoiceAnswer = { socket, audio: null, diagram: [] }
    voiceAnswerRef.current = answer
    setIsStartingMicrophone(true)
    setVoiceStatus('Opening microphone…')
    try {
      const recorder = await startAudioRecording({
        isCurrent: () => voiceAnswerRef.current === answer && socket === interviewSocketRef.current && socket.readyState === WebSocket.OPEN,
        onStop: (audio) => {
          silenceCleanupRef.current?.()
          silenceCleanupRef.current = null
          setSilenceCountdown(null)
          recorderRef.current = null
          setIsRecording(false)
          setIsInterviewRecording(false)
          answer.audio = audio
          void transcribeVoiceAnswer(answer)
        },
        onError: () => {
          cancelVoiceAnswer()
          recorderRef.current = null
          setIsRecording(false)
          setVoiceStatus('Recording failed. Please try recording again.')
        },
      })
      if (!recorder) return
      recorderRef.current = recorder
      setIsRecording(true)
      setIsInterviewRecording(true)
      setVoiceStatus('Listening. Explain your design while drawing.')
      startSilenceDetection(recorder.stream)
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
      const text = await transcribeAudio(answer.audio, controller.signal)
      if (voiceAnswerRef.current !== answer || controller.signal.aborted) return
      if (!text) throw new Error('No text returned. Try recording again.')
      if (!sendAnswer(text, answer.diagram, answer.socket)) {
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

  function pauseInterview() {
    interviewPausedRef.current = true
    setIsInterviewPaused(true)
    const spokenText = getSpeakingText()
    if (spokenText !== null) pendingSpeechRef.current = spokenText
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
    // Stop microphone capture before playing the interviewer's voice.
    cancelVoiceAnswer()
    const socket = interviewSocketRef.current
    speak(text, () => {
      if (
        listenAfter && socket === interviewSocketRef.current &&
        socket?.readyState === WebSocket.OPEN &&
        !endingInterviewRef.current && !interviewPausedRef.current
      ) {
        void startVoiceAnswer()
      }
    })
  }

  async function uploadRecording() {
    if (!recordedAudio || isTranscribing) return

    setIsTranscribing(true)
    setTranscript('')
    setMicrophoneStatus('Transcribing recording…')

    try {
      const text = await transcribeAudio(recordedAudio)
      setTranscript(text)
      setMicrophoneStatus(text ? 'Transcription complete.' : 'No text returned. Try recording again.')
    } catch (error) {
      setMicrophoneStatus(error instanceof Error ? error.message : 'Could not transcribe the recording')
    } finally {
      setIsTranscribing(false)
    }
  }

  function resetVoice() {
    interviewPausedRef.current = false
    setIsInterviewPaused(false)
    pendingSpeechRef.current = ''
    cancelVoiceAnswer()
    stopSpeaking()
  }

  function retryVoiceAnswer() {
    const answer = voiceAnswerRef.current
    if (answer) void transcribeVoiceAnswer(answer)
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
      voiceAnswerRef.current = null
      diagnosticRecordingRef.current = null
      voiceUploadRef.current?.abort()
      silenceCleanupRef.current?.()
      silenceCleanupRef.current = null
      const recorder = recorderRef.current
      if (recorder) {
        recorder.onstop = null
        if (recorder.state === 'recording') recorder.stop()
        recorder.stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  return {
    microphoneStatus,
    isRecording,
    recordedAudio,
    transcript,
    isTranscribing,
    audioUrl,
    voiceStatus,
    isStartingMicrophone,
    isInterviewRecording,
    canRetryVoice,
    silenceCountdown,
    pauseDetectionError,
    isInterviewPaused,
    isSpeaking,
    speechError,
    stopSpeaking,
    interviewPausedRef,
    resetVoice,
    cancelVoiceAnswer,
    speakInterviewer,
    startVoiceAnswer,
    finishVoiceAnswer,
    retryVoiceAnswer,
    pauseInterview,
    resumeInterview,
    checkMicrophone,
    speakQuestion,
    startRecording,
    stopRecording,
    uploadRecording,
  }
}
