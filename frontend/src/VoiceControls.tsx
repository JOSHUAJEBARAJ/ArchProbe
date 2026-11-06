type VoiceControlsProps = {
  interviewError: string
  isFinished: boolean
  isPaused: boolean
  canPause: boolean
  canStartRecording: boolean
  isStartingMicrophone: boolean
  isRecording: boolean
  canRetry: boolean
  status: string
  silenceCountdown: number | null
  pauseDetectionError: string
  onPause: () => void
  onResume: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onRetry: () => void
  onDiscard: () => void
}

export default function VoiceControls({
  interviewError,
  isFinished,
  isPaused,
  canPause,
  canStartRecording,
  isStartingMicrophone,
  isRecording,
  canRetry,
  status,
  silenceCountdown,
  pauseDetectionError,
  onPause,
  onResume,
  onStartRecording,
  onStopRecording,
  onRetry,
  onDiscard,
}: VoiceControlsProps) {
  return (
    <section className="voice-controls" aria-label="Spoken answer">
      {interviewError && <p className="error" role="alert">{interviewError}</p>}
      {isFinished && <p role="status">Interview finished.</p>}
      <h2>Your voice</h2>
      <p className="voice-help">Your mic starts after each question. A five-second pause sends your answer.</p>
      <div className="button-row">
        <button type="button" onClick={isPaused ? onResume : onPause} disabled={!canPause}>
          {isPaused ? 'Resume interview' : 'Pause interview'}
        </button>
        <button type="button" onClick={onStartRecording} disabled={!canStartRecording}>
          {isStartingMicrophone ? 'Opening microphone…' : 'Start recording'}
        </button>
        <button type="button" onClick={onStopRecording} disabled={!isRecording}>
          Stop recording
        </button>
        {canRetry && (
          <>
            <button type="button" onClick={onRetry}>Retry recording upload</button>
            <button type="button" onClick={onDiscard}>Discard recording</button>
          </>
        )}
      </div>
      {status && <p role="status">{status}</p>}
      {isRecording && silenceCountdown !== null && (
        <p role="status">Sending in {silenceCountdown} seconds unless you continue speaking…</p>
      )}
      {isRecording && pauseDetectionError && <p role="alert">{pauseDetectionError}</p>}
    </section>
  )
}
