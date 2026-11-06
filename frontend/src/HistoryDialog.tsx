import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import SavedDiagram from './SavedDiagram'
import FeedbackText from './FeedbackText'
import type { SavedInterview, SavedMessage, SavedFeedback } from './interviewHistory'

type HistoryDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>
  savedInterviews: readonly SavedInterview[]
  savedMessages: readonly SavedMessage[]
  savedFeedback: SavedFeedback | null
  viewedInterviewId: string | null
  viewedDiagramMessageId: number | null
  deletingInterviewId: string | null
  protectedInterviewId: string | null
  isCreatingSession: boolean
  isLoadingHistory: boolean
  isLoadingFeedback: boolean
  savedInterviewsError: string
  historyError: string
  feedbackError: string
  onLoadInterviews: () => void
  onViewInterview: (id: string) => void
  onDeleteInterview: (id: string) => void
  onSelectDiagram: (messageId: number | null) => void
}

export default function HistoryDialog({
  dialogRef,
  savedInterviews,
  savedMessages,
  savedFeedback,
  viewedInterviewId,
  viewedDiagramMessageId,
  deletingInterviewId,
  protectedInterviewId,
  isCreatingSession,
  isLoadingHistory,
  isLoadingFeedback,
  savedInterviewsError,
  historyError,
  feedbackError,
  onLoadInterviews,
  onViewInterview,
  onDeleteInterview,
  onSelectDiagram,
}: HistoryDialogProps) {
  const savedConversationRef = useRef<HTMLOListElement | null>(null)
  const savedDiagramSectionRef = useRef<HTMLElement | null>(null)
  const viewedDiagramMessage = savedMessages.find((message) => message.id === viewedDiagramMessageId)

  useEffect(() => {
    if (viewedDiagramMessageId !== null) {
      savedDiagramSectionRef.current?.scrollIntoView({ block: 'start' })
    }
  }, [viewedDiagramMessageId])

  function openSavedDiagram(messageId: number) {
    onSelectDiagram(messageId)
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

  return (
    <dialog ref={dialogRef} className="history-dialog" aria-labelledby="history-title">
      <div className="dialog-heading">
        <h2 id="history-title">Interview history</h2>
        <button type="button" onClick={() => dialogRef.current?.close()}>Close</button>
      </div>
      <div className="history-content">
    <section aria-label="Saved interviews">
      <h2>Saved interviews</h2>

      <button type="button" onClick={onLoadInterviews} disabled={deletingInterviewId !== null}>
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
              onClick={() => onViewInterview(interview.id)}
              disabled={deletingInterviewId === interview.id}
            >
              View conversation
            </button>
            {' '}
            <button
              type="button"
              onClick={() => onDeleteInterview(interview.id)}
              disabled={
                deletingInterviewId !== null ||
                isCreatingSession ||
                interview.state === 'active' ||
                interview.id === protectedInterviewId
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
          <button type="button" onClick={() => onSelectDiagram(null)}>
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
  )
}
