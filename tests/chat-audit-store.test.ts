import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, closeDb } from '../src/server/db'
import { audit, recentAudit } from '../src/server/chat/audit-store'

describe('audit store', () => {
  beforeAll(() => openDb(mkdtempSync(join(tmpdir(), 'budget-audit-test-'))))
  afterAll(() => closeDb())

  it('appends audit rows with JSON detail', () => {
    audit('u1', 'chat_message', { text: 'hi' })
    audit('u1', 'tool_call', { name: 'get_accounts', args: { type: 'asset' } })
    const rows = recentAudit()
    expect(rows).toHaveLength(2)
    expect(rows[0].event).toBe('tool_call') // newest first
    expect(JSON.parse(rows[0].detail).name).toBe('get_accounts')
  })

  it('truncates oversized detail to 4000 chars', () => {
    audit('u1', 'tool_result', { blob: 'x'.repeat(10000) })
    expect(recentAudit(1)[0].detail.length).toBeLessThanOrEqual(4000)
  })
})
