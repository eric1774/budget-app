import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, closeDb } from '../src/server/db'
import { createSession, getSession, deleteSession, sweepExpiredSessions } from '../src/server/auth/session-store'
import type { AuthUser } from '../src/shared/types'

const eric: AuthUser = { sub: 'u-1', name: 'Eric', email: 'eric@example.com', role: 'admin' }

describe('session store', () => {
  beforeAll(() => openDb(mkdtempSync(join(tmpdir(), 'budget-sess-test-'))))
  afterAll(() => closeDb())

  it('creates and reads back a session', () => {
    const s = createSession(eric, 12)
    expect(s.id).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 random bytes, base64url
    expect(s.expiresAt).toBeGreaterThan(Date.now())
    expect(getSession(s.id)).toEqual(s)
  })

  it('returns null for an unknown id', () => {
    expect(getSession('nope')).toBeNull()
  })

  it('expired sessions read as null and are deleted', () => {
    const s = createSession(eric, -1) // already expired
    expect(getSession(s.id)).toBeNull()
    expect(getSession(s.id)).toBeNull()
  })

  it('deleteSession removes the row', () => {
    const s = createSession(eric, 12)
    deleteSession(s.id)
    expect(getSession(s.id)).toBeNull()
  })

  it('sweepExpiredSessions removes only expired rows', () => {
    const live = createSession(eric, 12)
    createSession(eric, -1)
    createSession(eric, -1)
    expect(sweepExpiredSessions()).toBe(2)
    expect(getSession(live.id)).not.toBeNull()
  })
})
