import { randomBytes } from 'crypto'
import type { AuthUser, UserRole } from '../../shared/types'
import { getDb } from '../db'

export interface SessionRecord extends AuthUser {
  id: string
  expiresAt: number
}

interface SessionRow {
  id: string
  sub: string
  name: string
  email: string
  role: UserRole
  expires_at: number
}

export function createSession(user: AuthUser, ttlHours: number): SessionRecord {
  const id = randomBytes(32).toString('base64url')
  const now = Date.now()
  const expiresAt = now + ttlHours * 3_600_000
  getDb()
    .prepare('INSERT INTO sessions (id, sub, name, email, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, user.sub, user.name, user.email, user.role, now, expiresAt)
  return { id, expiresAt, sub: user.sub, name: user.name, email: user.email, role: user.role }
}

export function getSession(id: string): SessionRecord | null {
  const row = getDb()
    .prepare('SELECT id, sub, name, email, role, expires_at FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined
  if (!row) return null
  if (row.expires_at <= Date.now()) {
    deleteSession(id)
    return null
  }
  return { id: row.id, sub: row.sub, name: row.name, email: row.email, role: row.role, expiresAt: row.expires_at }
}

export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function sweepExpiredSessions(): number {
  const result = getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  return Number(result.changes)
}
