import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, getDb, closeDb } from '../src/server/db'

describe('db', () => {
  afterEach(() => closeDb())

  it('getDb throws before openDb', () => {
    expect(() => getDb()).toThrow(/openDb/)
  })

  it('creates the database file and sessions table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-db-test-'))
    openDb(dir)
    expect(existsSync(join(dir, 'budget-app.db'))).toBe(true)
    const row = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
      .get() as { name: string } | undefined
    expect(row?.name).toBe('sessions')
  })

  it('openDb is idempotent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-db-test-'))
    const a = openDb(dir)
    const b = openDb(dir)
    expect(a).toBe(b)
  })

  it('rejects an invalid role via CHECK constraint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-db-test-'))
    openDb(dir)
    expect(() =>
      getDb()
        .prepare('INSERT INTO sessions (id, sub, name, email, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('s1', 'u1', 'n', 'e', 'superuser', 0, 0)
    ).toThrow()
  })

  it('creates the chat_messages and audit_log tables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-db-test-'))
    openDb(dir)
    const names = (getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('chat_messages', 'audit_log') ORDER BY name")
      .all() as { name: string }[]).map((r) => r.name)
    expect(names).toEqual(['audit_log', 'chat_messages'])
  })

  it('rejects an invalid chat role via CHECK constraint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-db-test-'))
    openDb(dir)
    expect(() =>
      getDb()
        .prepare('INSERT INTO chat_messages (sub, role, text, tokens, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('u1', 'system', 'x', 0, 0)
    ).toThrow()
  })
})
