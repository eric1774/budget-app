import { getDb } from '../db'

const MAX_DETAIL = 4000

export function audit(sub: string, event: string, detail: unknown): void {
  let text: string
  try {
    text = JSON.stringify(detail) ?? 'null'
  } catch {
    text = String(detail)
  }
  if (text.length > MAX_DETAIL) text = text.slice(0, MAX_DETAIL)
  getDb()
    .prepare('INSERT INTO audit_log (sub, event, detail, created_at) VALUES (?, ?, ?, ?)')
    .run(sub, event, text, Date.now())
}

export interface AuditRow {
  id: number
  sub: string
  event: string
  detail: string
  createdAt: string
}

export function recentAudit(limit = 100): AuditRow[] {
  const rows = getDb()
    .prepare('SELECT id, sub, event, detail, created_at FROM audit_log ORDER BY id DESC LIMIT ?')
    .all(limit) as unknown as { id: number; sub: string; event: string; detail: string; created_at: number }[]
  return rows.map((r) => ({ id: r.id, sub: r.sub, event: r.event, detail: r.detail, createdAt: new Date(r.created_at).toISOString() }))
}
