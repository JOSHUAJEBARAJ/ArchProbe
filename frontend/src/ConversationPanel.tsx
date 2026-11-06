import { useEffect, useRef } from 'react'

export type ChatMessage = {
  id: string
  role: 'interviewer' | 'candidate'
  text: string
  kind?: 'wrap_up'
  diagramRevision?: number
}

type ConversationPanelProps = {
  messages: readonly ChatMessage[]
  isResponding: boolean
}

export default function ConversationPanel({ messages, isResponding }: ConversationPanelProps) {
  const conversationRef = useRef<HTMLOListElement | null>(null)
  const followConversationRef = useRef(true)
  const previousFirstIdRef = useRef<string | undefined>(undefined)
  const previousAnswerIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const firstId = messages[0]?.id
    const answerId = messages.findLast((message) => message.role === 'candidate')?.id

    // Follow a new interview or a newly submitted answer, even after scrolling up.
    if (firstId !== previousFirstIdRef.current || answerId !== previousAnswerIdRef.current) {
      followConversationRef.current = true
    }
    previousFirstIdRef.current = firstId
    previousAnswerIdRef.current = answerId

    const conversation = conversationRef.current
    if (conversation && followConversationRef.current) {
      conversation.scrollTop = conversation.scrollHeight
    }
  }, [messages, isResponding])

  return (
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
  )
}
