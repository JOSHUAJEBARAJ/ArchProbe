import { useRef } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import './App.css'
import Whiteboard from './Whiteboard'
import SettingsDialog from './SettingsDialog'
import ConversationPanel from './ConversationPanel'
import HistoryDialog from './HistoryDialog'
import VoiceControls from './VoiceControls'
import useInterviewSettings from './useInterviewSettings'
import useInterviewSession from './useInterviewSession'
import useInterviewHistory from './useInterviewHistory'
import useDiagnostics from './useDiagnostics'

function App() {
  const diagramRef = useRef<readonly ExcalidrawElement[]>([])
  const deletingInterviewRef = useRef<string | null>(null)
  const settingsDialogRef = useRef<HTMLDialogElement | null>(null)
  const historyDialogRef = useRef<HTMLDialogElement | null>(null)
  const settings = useInterviewSettings()
  const interview = useInterviewSession({ settings, diagramRef, deletingInterviewRef })
  const history = useInterviewHistory({
    deletingInterviewRef,
    isCreatingSession: interview.isCreatingSession,
    onDeleted: interview.resetDeletedInterview,
  })
  const diagnostics = useDiagnostics(interview.interviewId)
  const {
    scenarios,
    selectedScenarioId,
    isLoadingScenarios,
    scenarioError,
    codexModels,
    selectedModel,
    selectedEffort,
    isLoadingModels,
    modelsError,
    setSelectedScenarioId,
    setSelectedEffort,
  } = settings
  const {
    hasStarted,
    isCreatingSession,
    interviewId,
    messages,
    isResponding,
    interviewError,
    connectionStatus,
    modelSettingsLocked,
    statusLabel,
    startInterview,
    connectInterviewer,
    endInterview,
  } = interview
  const {
    savedMessages,
    savedFeedback,
    isLoadingFeedback,
    feedbackError,
    viewedDiagramMessageId,
    savedInterviews,
    deletingInterviewId,
    savedInterviewsError,
    viewedInterviewId,
    isLoadingHistory,
    historyError,
    setViewedDiagramMessageId,
    loadSavedInterviews,
    deleteSavedInterview,
    loadSavedMessages,
  } = history
  const {
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
    cancelVoiceAnswer,
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
  } = interview.voice
  const {
    backendStatus,
    checkBackend,
    checkInterview,
  } = diagnostics

  function reloadModels() {
    return settings.loadCodexModels(modelSettingsLocked)
  }

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
            if (codexModels.length === 0) void reloadModels()
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

          <ConversationPanel messages={messages} isResponding={isResponding} />

          <VoiceControls
            interviewError={interviewError}
            isFinished={connectionStatus === 'finished'}
            isPaused={isInterviewPaused}
            canPause={connectionStatus === 'connected'}
            canStartRecording={connectionStatus === 'connected' && !isInterviewPaused && !isResponding && !isSpeaking && !isRecording && !isStartingMicrophone && !isTranscribing && !canRetryVoice}
            isStartingMicrophone={isStartingMicrophone}
            isRecording={isInterviewRecording}
            canRetry={canRetryVoice}
            status={voiceStatus}
            silenceCountdown={silenceCountdown}
            pauseDetectionError={pauseDetectionError}
            onPause={pauseInterview}
            onResume={resumeInterview}
            onStartRecording={startVoiceAnswer}
            onStopRecording={finishVoiceAnswer}
            onRetry={retryVoiceAnswer}
            onDiscard={cancelVoiceAnswer}
          />
        </aside>
      </div>

      <HistoryDialog
        dialogRef={historyDialogRef}
        savedInterviews={savedInterviews}
        savedMessages={savedMessages}
        savedFeedback={savedFeedback}
        viewedInterviewId={viewedInterviewId}
        viewedDiagramMessageId={viewedDiagramMessageId}
        deletingInterviewId={deletingInterviewId}
        protectedInterviewId={connectionStatus === 'connecting' || connectionStatus === 'connected' || connectionStatus === 'ending' ? interviewId : null}
        isCreatingSession={isCreatingSession}
        isLoadingHistory={isLoadingHistory}
        isLoadingFeedback={isLoadingFeedback}
        savedInterviewsError={savedInterviewsError}
        historyError={historyError}
        feedbackError={feedbackError}
        onLoadInterviews={loadSavedInterviews}
        onViewInterview={loadSavedMessages}
        onDeleteInterview={deleteSavedInterview}
        onSelectDiagram={setViewedDiagramMessageId}
      />

      <SettingsDialog
        dialogRef={settingsDialogRef}
        codexModels={codexModels}
        selectedModel={selectedModel}
        selectedEffort={selectedEffort}
        modelSettingsLocked={modelSettingsLocked}
        isLoadingModels={isLoadingModels}
        modelsError={modelsError}
        onModelChange={settings.selectModel}
        onEffortChange={setSelectedEffort}
        onReloadModels={reloadModels}
        hasInterview={interviewId !== null}
        isInterviewActive={connectionStatus === 'connected' || connectionStatus === 'ending'}
        backendStatus={backendStatus}
        microphoneStatus={microphoneStatus}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        isStartingMicrophone={isStartingMicrophone}
        isInterviewRecording={isInterviewRecording}
        recordedAudioSize={recordedAudio?.size ?? null}
        audioUrl={audioUrl}
        transcript={transcript}
        onCheckDiagram={() => {
          console.log('Diagram JSON:', JSON.stringify({ elements: diagramRef.current.filter((element) => !element.isDeleted) }, null, 2))
        }}
        onCheckBackend={checkBackend}
        onCheckInterview={checkInterview}
        onCheckSavedMessages={() => {
          if (!interviewId) return
          settingsDialogRef.current?.close()
          historyDialogRef.current?.showModal()
          void loadSavedMessages(interviewId)
        }}
        onTestSpeaker={speakQuestion}
        onCheckMicrophone={checkMicrophone}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onTranscribeRecording={uploadRecording}
      />
    </main>
  )
}

export default App
