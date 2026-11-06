import type { RefObject } from 'react'

export type CodexModel = {
  id: string
  model: string
  display_name: string
  default_reasoning_effort: string
  supported_reasoning_efforts: { effort: string; description: string }[]
  is_default: boolean
}

type SettingsDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>
  codexModels: readonly CodexModel[]
  selectedModel: string
  selectedEffort: string
  modelSettingsLocked: boolean
  isLoadingModels: boolean
  modelsError: string
  onModelChange: (model: string) => void
  onEffortChange: (effort: string) => void
  onReloadModels: () => void
  hasInterview: boolean
  isInterviewActive: boolean
  backendStatus: string
  microphoneStatus: string
  isRecording: boolean
  isTranscribing: boolean
  isStartingMicrophone: boolean
  isInterviewRecording: boolean
  recordedAudioSize: number | null
  audioUrl: string | null
  transcript: string
  onCheckDiagram: () => void
  onCheckBackend: () => void
  onCheckInterview: () => void
  onCheckSavedMessages: () => void
  onTestSpeaker: () => void
  onCheckMicrophone: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onTranscribeRecording: () => void
}

export default function SettingsDialog({
  dialogRef,
  codexModels,
  selectedModel,
  selectedEffort,
  modelSettingsLocked,
  isLoadingModels,
  modelsError,
  onModelChange,
  onEffortChange,
  onReloadModels,
  hasInterview,
  isInterviewActive,
  backendStatus,
  microphoneStatus,
  isRecording,
  isTranscribing,
  isStartingMicrophone,
  isInterviewRecording,
  recordedAudioSize,
  audioUrl,
  transcript,
  onCheckDiagram,
  onCheckBackend,
  onCheckInterview,
  onCheckSavedMessages,
  onTestSpeaker,
  onCheckMicrophone,
  onStartRecording,
  onStopRecording,
  onTranscribeRecording,
}: SettingsDialogProps) {
  const selectedModelInfo = codexModels.find((item) => item.model === selectedModel)

  return (
    <dialog ref={dialogRef} className="settings-dialog" aria-labelledby="settings-title">
      <div className="dialog-heading">
        <h2 id="settings-title">Settings</h2>
        <button type="button" onClick={() => dialogRef.current?.close()}>Close</button>
      </div>
      <section className="test-section model-settings" aria-label="Interviewer model">
        <h2>Interviewer model</h2>
        <label htmlFor="codex-model">Model</label>
        <select id="codex-model" value={selectedModel} disabled={modelSettingsLocked || isLoadingModels || codexModels.length === 0} onChange={(event) => onModelChange(event.target.value)}>
          {codexModels.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
          {codexModels.map((item) => <option key={item.id} value={item.model}>{item.display_name}</option>)}
        </select>
        <label htmlFor="codex-effort">Reasoning effort</label>
        <select id="codex-effort" value={selectedEffort} disabled={modelSettingsLocked || isLoadingModels || !selectedModelInfo} onChange={(event) => onEffortChange(event.target.value)}>
          {!selectedModelInfo && <option value={selectedEffort}>{selectedEffort}</option>}
          {selectedModelInfo?.supported_reasoning_efforts.map((item) => <option key={item.effort} value={item.effort}>{item.effort}</option>)}
        </select>
        <p>{selectedModelInfo?.supported_reasoning_efforts.find((item) => item.effort === selectedEffort)?.description}</p>
        {modelSettingsLocked && <p>Model settings are locked for this interview. Choose again after it ends.</p>}
        {isLoadingModels && <p role="status">Loading models from Codex…</p>}
        {modelsError && <p className="error" role="alert">{modelsError}</p>}
        <button type="button" onClick={onReloadModels} disabled={modelSettingsLocked || isLoadingModels}>Reload models</button>
      </section>
      <h2 className="settings-section-title">Troubleshooting</h2>
      <div className="test-section">
        <h2>Diagram</h2>
        <button type="button" onClick={onCheckDiagram}>Check diagram in console</button>
      </div>
      <div className="test-section">
        <h2>Backend</h2>
        <div className="button-row">
          <button type="button" onClick={onCheckBackend}>Check backend</button>
          <button type="button" onClick={onCheckInterview} disabled={!hasInterview}>
            Check interview
          </button>
          <button
            type="button"
            onClick={onCheckSavedMessages}
            disabled={!hasInterview}
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
          <button type="button" onClick={onTestSpeaker} disabled={isInterviewActive}>Test speaker</button>
          <button type="button" onClick={onCheckMicrophone}>Check microphone</button>
          <button type="button" onClick={onStartRecording} disabled={isRecording || isTranscribing || isStartingMicrophone || isInterviewActive}>
            Start recording
          </button>
          <button type="button" onClick={onStopRecording} disabled={!isRecording || isInterviewRecording}>
            Stop recording
          </button>
          <button
            type="button"
            onClick={onTranscribeRecording}
            disabled={recordedAudioSize === null || isRecording || isTranscribing || isInterviewActive}
          >
            {isTranscribing ? 'Transcribing…' : 'Transcribe recording'}
          </button>
        </div>
        <p role="status">{isRecording ? 'Recording…' : microphoneStatus}</p>
        {recordedAudioSize !== null && <p>Recording captured: {recordedAudioSize} bytes</p>}
        {audioUrl && <audio controls src={audioUrl} />}
        {transcript && <p><strong>Transcript:</strong> {transcript}</p>}
      </div>
    </dialog>
  )
}
