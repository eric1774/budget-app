import { useEffect, useRef, useState, useCallback } from 'react'
import type { ChatMessage } from '../../../shared/types'
import { chatHistory, chatSend, chatClear } from '../api'

export function ChatTab(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatHistory()
      .then((h) => setMessages(h.messages))
      .catch(() => setUnavailable(true))
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setError(null)
    setBusy(true)
    setMessages((m) => [...m, { id: -Date.now(), role: 'user', text, createdAt: new Date().toISOString() }])
    try {
      const result = await chatSend(text)
      setMessages((m) => [...m, result.reply])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }, [input, busy])

  const clear = useCallback(async () => {
    await chatClear().catch(() => {})
    setMessages([])
    setError(null)
  }, [])

  if (unavailable) {
    return (
      <div className="chat-tab">
        <div className="chat-banner">Chat isn’t available right now. The dashboard still works normally.</div>
      </div>
    )
  }

  return (
    <div className="chat-tab">
      <div className="chat-messages">
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            Ask about the family finances — “How much did we spend on dining out this month?”,
            “What’s the Red Baron balance?”, “Which bills are due next week?”
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble chat-bubble--${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="chat-bubble chat-bubble--assistant chat-bubble--thinking">Looking that up…</div>}
        {error && <div className="chat-error">{error}</div>}
        <div ref={endRef} />
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          maxLength={2000}
          placeholder="Ask about accounts, spending, budgets…"
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button className="chat-send" disabled={busy || input.trim().length === 0} onClick={() => void send()}>
          Send
        </button>
        <button className="chat-clear" onClick={() => void clear()} title="Clear conversation">
          Clear
        </button>
      </div>
    </div>
  )
}
