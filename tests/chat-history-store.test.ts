import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, closeDb } from '../src/server/db'
import { appendMessage, getHistory, clearHistory, tokensUsedToday } from '../src/server/chat/history-store'

describe('chat history store', () => {
  beforeAll(() => openDb(mkdtempSync(join(tmpdir(), 'budget-chat-test-'))))
  afterAll(() => closeDb())

  it('appends and reads back messages in order', () => {
    appendMessage('u1', 'user', 'how much did we spend?', 10)
    appendMessage('u1', 'assistant', 'You spent $42.', 200)
    const h = getHistory('u1')
    expect(h.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(h[1].text).toBe('You spent $42.')
    expect(h[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('scopes history per user', () => {
    appendMessage('u2', 'user', 'hello', 5)
    expect(getHistory('u2')).toHaveLength(1)
    expect(getHistory('u1')).toHaveLength(2)
  })

  it('honors the limit, keeping the most recent', () => {
    for (let i = 0; i < 10; i++) appendMessage('u3', 'user', `m${i}`, 1)
    const h = getHistory('u3', 4)
    expect(h.map((m) => m.text)).toEqual(['m6', 'm7', 'm8', 'm9'])
  })

  it('sums tokens used today per user', () => {
    expect(tokensUsedToday('u1')).toBe(210)
    expect(tokensUsedToday('u2')).toBe(5)
    expect(tokensUsedToday('nobody')).toBe(0)
  })

  it('clearHistory removes only that user', () => {
    clearHistory('u1')
    expect(getHistory('u1')).toHaveLength(0)
    expect(getHistory('u2')).toHaveLength(1)
  })
})
