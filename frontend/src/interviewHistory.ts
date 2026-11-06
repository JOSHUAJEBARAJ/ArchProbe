import type { SavedDiagramSnapshot } from './SavedDiagram'
import type { FeedbackEvidence } from './FeedbackText'

export type SavedMessage = {
  id: number
  role: 'interviewer' | 'candidate'
  text: string
  created_at: string
  diagram: SavedDiagramSnapshot | null
}

export type SavedInterview = {
  id: string
  state: 'ready' | 'active' | 'finished' | 'interrupted'
  created_at: string
}

export type SavedFeedback = {
  id: number
  interview_id: string
  message_id: number
  text: string
  created_at: string
  evidence: FeedbackEvidence[]
}
