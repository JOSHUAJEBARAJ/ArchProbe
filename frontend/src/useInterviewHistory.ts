import { API_BASE_URL } from './api'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SavedInterview, SavedMessage, SavedFeedback } from './interviewHistory'

type InterviewHistoryOptions = {
  deletingInterviewRef: RefObject<string | null>
  isCreatingSession: boolean
  onDeleted: (id: string) => void
}

export default function useInterviewHistory({ deletingInterviewRef, isCreatingSession, onDeleted }: InterviewHistoryOptions) {
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
  const historyRequestRef = useRef(0)
  const interviewListRequestRef = useRef(0)
  const viewedInterviewRef = useRef<string | null>(null)

  async function loadSavedInterviews() {
    if (deletingInterviewRef.current) {
      return
    }
    const requestId = ++interviewListRequestRef.current
    setSavedInterviewsError('')
    try {
      const response = await fetch(`${API_BASE_URL}/interviews`)

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
      const response = await fetch(`${API_BASE_URL}/interviews/${id}`, {
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
      onDeleted(id)
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
        `${API_BASE_URL}/interviews/${id}/feedback`
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
        `${API_BASE_URL}/interviews/${id}/messages`
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

  useEffect(() => () => {
    ++historyRequestRef.current
    ++interviewListRequestRef.current
  }, [])

  return {
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
  }
}
