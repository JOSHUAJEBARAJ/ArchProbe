import { Fragment } from 'react'
import type { SavedDiagramSnapshot } from './SavedDiagram'

export type FeedbackEvidence = {
  marker: string
  message_id: number
  diagram_revision: number | null
}

type FeedbackTextProps = {
  text: string
  evidence: readonly FeedbackEvidence[]
  messages: readonly {
    id: number
    role: string
    diagram: SavedDiagramSnapshot | null
  }[]
  onViewDiagram: (messageId: number) => void
}

export default function FeedbackText({ text, evidence, messages, onViewDiagram }: FeedbackTextProps) {
  const parts = text.split(/(\[(?:Answer [0-9]+|Diagram [0-9]+ revision [0-9]+)\])/g)

  return (
    <p style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((part, index) => {
        const reference = evidence.find((item) => item.marker === part)
        const source = reference && messages.find(
          (message) => message.id === reference.message_id && message.role === 'candidate'
        )
        if (!reference || !source) {
          return <Fragment key={index}>{part}</Fragment>
        }
        if (reference.diagram_revision !== null) {
          if (source.diagram?.revision !== reference.diagram_revision) {
            return <Fragment key={index}>{part}</Fragment>
          }
          return (
            <button
              key={index}
              type="button"
              className="feedback-reference"
              onClick={() => onViewDiagram(reference.message_id)}
            >
              {part.slice(1, -1)}
            </button>
          )
        }
        return (
          <a key={index} href={`#saved-message-${reference.message_id}`}>
            {part.slice(1, -1)}
          </a>
        )
      })}
    </p>
  )
}
