import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'http'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, closeDb } from '../src/server/db'
import { initChat, type ChatRuntime } from '../src/server/chat/runtime'
import type { ChatEnvConfig } from '../src/server/config'
import type { SessionRecord } from '../src/server/auth/session-store'
import type { FireflyMcp } from '../src/server/chat/mcp-client'

const chatEnv: ChatEnvConfig = {
  anthropicApiKey: 'sk-test',
  fireflyUrl: 'http://firefly.test',
  fireflyToken: 'pat',
  model: 'claude-haiku-4-5',
  dailyTokenBudget: 150,
  mcpCommand: ['true'],
}

const eric: SessionRecord = { id: 's1', sub: 'u1', name: 'Eric', email: 'e@x.com', role: 'admin', expiresAt: Date.now() + 1e7 }

const stubMcp: FireflyMcp = {
  tools: [{ name: 'get_accounts', inputSchema: { type: 'object' } }],
  callTool: async () => '[]',
  close: async () => {},
}

function startHarness(runtime: ChatRuntime): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    void runtime.handleRequest(req, res, eric).then((handled) => {
      if (!handled) { res.writeHead(418); res.end() }
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve({ server, base: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}` })
    })
  })
}

describe('chat routes', () => {
  let server: Server
  let base: string
  let runtime: ChatRuntime

  beforeAll(async () => {
    openDb(mkdtempSync(join(tmpdir(), 'budget-chatroutes-')))
    runtime = initChat(chatEnv, {
      connect: async () => stubMcp,
      createMessage: async () => ({
        content: [{ type: 'text', text: 'Answer!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 60, output_tokens: 40 },
      }),
    })
    ;({ server, base } = await startHarness(runtime))
    // allow the background connect() to settle
    await new Promise((r) => setTimeout(r, 20))
  })

  afterAll(async () => {
    await runtime.close()
    await new Promise((r) => server.close(r))
    closeDb()
  })

  it('answers a message and persists both sides', async () => {
    const r = await fetch(`${base}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'How much this month?' }),
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.reply.text).toBe('Answer!')
    expect(body.usage.usedToday).toBeGreaterThan(0)

    const h = await (await fetch(`${base}/api/chat/history`)).json()
    expect(h.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant'])
  })

  it('rejects empty and oversized messages', async () => {
    for (const text of ['', 'x'.repeat(2001)]) {
      const r = await fetch(`${base}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      expect(r.status).toBe(400)
    }
  })

  it('enforces the daily token budget with 429', async () => {
    // budget is 150; each turn records 100 tokens — after the second turn
    // usedToday=200 >= 150, so the third message is refused
    await fetch(`${base}/api/chat/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'again' }),
    })
    const r = await fetch(`${base}/api/chat/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'over budget now' }),
    })
    expect(r.status).toBe(429)
  })

  it('clear empties history', async () => {
    const r = await fetch(`${base}/api/chat/clear`, { method: 'POST' })
    expect(r.status).toBe(200)
    const h = await (await fetch(`${base}/api/chat/history`)).json()
    expect(h.messages).toHaveLength(0)
  })

  it('passes through non-chat paths', async () => {
    expect((await fetch(`${base}/api/snapshot`)).status).toBe(418)
  })

  it('503s cleanly when the MCP connection failed', async () => {
    const broken = initChat(chatEnv, {
      connect: async () => { throw new Error('firefly down') },
      createMessage: async () => { throw new Error('unused') },
    })
    const h = await startHarness(broken)
    await new Promise((r) => setTimeout(r, 20))
    const r = await fetch(`${h.base}/api/chat/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hi' }),
    })
    expect(r.status).toBe(503)
    expect((await r.json()).error).toMatch(/unavailable/i)
    await broken.close()
    await new Promise((res) => h.server.close(res))
  })
})
