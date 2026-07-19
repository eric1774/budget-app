import type { ChatMessage } from '../../shared/types'
import { getDb } from '../db'

interface Row {
  id: number
  role: 'user' | 'assistant'
  text: string
  created_at: number
}

function toMessage(r: Row): ChatMessage {
  return { id: r.id, role: r.role, text: r.text, createdAt: new Date(r.created_at).toISOString() }
}

export function appendMessage(sub: string, role: 'user' | 'assistant', text: string, tokens: number): ChatMessage {
  const now = Date.now()
  const result = getDb()
    .prepare('INSERT INTO chat_messages (sub, role, text, tokens, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(sub, role, text, tokens, now)
  return { id: Number(result.lastInsertRowid), role, text, createdAt: new Date(now).toISOString() }
}

export function getHistory(sub: string, limit = 50): ChatMessage[] {
  const rows = getDb()
    .prepare('SELECT id, role, text, created_at FROM chat_messages WHERE sub = ? ORDER BY id DESC LIMIT ?')
    .all(sub, limit) as unknown as Row[]
  return rows.reverse().map(toMessage)
}

export function clearHistory(sub: string): void {
  getDb().prepare('DELETE FROM chat_messages WHERE sub = ?').run(sub)
}

export function tokensUsedToday(sub: string, now = new Date()): number {
  // Local midnight (container runs TZ=America/Chicago, matching the budget's day)
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(tokens), 0) AS total FROM chat_messages WHERE sub = ? AND created_at >= ?')
    .get(sub, midnight) as { total: number }
  return Number(row.total)
}
