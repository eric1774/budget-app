import type { IncomingMessage, ServerResponse } from 'http'
import Anthropic from '@anthropic-ai/sdk'
import type { ChatEnvConfig } from '../config'
import type { SessionRecord } from '../auth/session-store'
import { connectFireflyMcp, type FireflyMcp } from './mcp-client'
import { runChatTurn, type AnthropicMessageLike, type EngineDeps } from './engine'
import { appendMessage, getHistory, clearHistory, tokensUsedToday } from './history-store'
import { audit } from './audit-store'

export type ChatState =
  | { kind: 'ready'; mcp: FireflyMcp }
  | { kind: 'starting' }
  | { kind: 'failed'; reason: string }
  // Latched: a tool-safety refusal is permanent. Once fatal, we never heal
  // again — a flaky MCP must never be retried back into service.
  | { kind: 'fatal'; reason: string }

export interface ChatRuntime {
  handleRequest(req: IncomingMessage, res: ServerResponse, session: SessionRecord): Promise<boolean>
  close(): Promise<void>
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

// Any authenticated member could otherwise stream an unbounded body and exhaust
// memory. Cap at 64 KB; accumulate raw Buffers and decode once at the end so a
// chunk boundary can't split a multi-byte UTF-8 sequence.
const MAX_BODY_BYTES = 64 * 1024

class PayloadTooLargeError extends Error {
  constructor() {
    super('Request body too large')
    this.name = 'PayloadTooLargeError'
  }
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let aborted = false
    req.on('data', (chunk: Buffer) => {
      if (aborted) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        aborted = true
        chunks.length = 0 // release what we buffered
        req.resume() // drain the rest so the socket frees and our 413 can flush
        reject(new PayloadTooLargeError())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (aborted) return
      const raw = Buffer.concat(chunks).toString('utf8')
      try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', (err) => { if (!aborted) reject(err) })
  })
}

const MAX_MESSAGE_CHARS = 2000
const HISTORY_TURNS = 20
const CHAT_DISABLED_MESSAGE =
  'Chat is disabled: the read-only tool safety check failed. Check server logs.'

export function initChat(
  chat: ChatEnvConfig,
  deps?: Partial<EngineDeps> & { connect?: () => Promise<FireflyMcp> }
): ChatRuntime {
  const connect = deps?.connect ?? (() => connectFireflyMcp(chat))
  let state: ChatState = { kind: 'starting' }
  const busy = new Set<string>()

  const anthropic = deps?.createMessage
    ? null
    : new Anthropic({ apiKey: chat.anthropicApiKey })

  const createMessage =
    deps?.createMessage ??
    (async (params: Record<string, unknown>): Promise<AnthropicMessageLike> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await (anthropic as Anthropic).messages.create(params as any)) as unknown as AnthropicMessageLike
    })

  async function establish(): Promise<void> {
    state = { kind: 'starting' }
    try {
      const mcp = await connect()
      state = { kind: 'ready', mcp }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      // A tool-safety violation must never be retried into service. Latch it as
      // fatal so no later heal attempt can revive chat, then rethrow (boot exits;
      // the lazy-heal caller swallows the throw but the fatal state persists).
      if (/REFUSING TO START CHAT/.test(reason)) {
        state = { kind: 'fatal', reason }
        console.error(`Chat disabled (tool-safety failure): ${reason}`)
        throw err
      }
      state = { kind: 'failed', reason }
      console.error(`Chat MCP connection failed: ${reason}`)
    }
  }
  const initial = establish().catch((err) => {
    console.error(err)
    process.exit(1) // spec: refuse to boot on tool-safety violation
  })

  async function handleMessage(res: ServerResponse, session: SessionRecord, text: string): Promise<void> {
    // Only a soft failure gets a lazy heal. A fatal (latched) state never heals,
    // so a flaky MCP can't be retried into service after a tool-safety refusal.
    if (state.kind === 'failed') await establish().catch(() => {}) // one lazy heal attempt
    if (state.kind === 'fatal') {
      json(res, 503, { error: CHAT_DISABLED_MESSAGE })
      return
    }
    if (state.kind !== 'ready') {
      json(res, 503, { error: 'Chat is unavailable right now (Firefly connection is down). The dashboard is unaffected.' })
      return
    }
    const usedToday = tokensUsedToday(session.sub)
    if (usedToday >= chat.dailyTokenBudget) {
      json(res, 429, { error: `Daily chat budget reached (${chat.dailyTokenBudget} tokens). Resets at midnight.` })
      return
    }
    if (busy.has(session.sub)) {
      json(res, 409, { error: 'A reply is already in progress' })
      return
    }
    busy.add(session.sub)
    try {
      audit(session.sub, 'chat_message', { text })
      appendMessage(session.sub, 'user', text, 0)
      const history = getHistory(session.sub, HISTORY_TURNS).map((m) => ({ role: m.role, text: m.text }))
      // A prior 502 can leave an orphan user row; the blind last-20 window may
      // then start on an assistant turn, which the Anthropic API rejects
      // (a conversation must start with a user message) — wedging chat in 502s.
      while (history.length > 0 && history[0].role === 'assistant') history.shift()
      const engineDeps: EngineDeps = {
        createMessage,
        callTool: state.mcp.callTool.bind(state.mcp),
        onAudit: (event, detail) => audit(session.sub, event, detail),
      }
      const result = await runChatTurn(engineDeps, chat.model, state.mcp.tools, history)
      const reply = appendMessage(session.sub, 'assistant', result.reply, result.tokens)
      json(res, 200, {
        reply,
        usage: { tokens: result.tokens, usedToday: tokensUsedToday(session.sub), budget: chat.dailyTokenBudget },
      })
    } catch (err) {
      console.error('Chat turn failed:', err)
      json(res, 502, { error: 'The assistant hit an error answering that. Please try again.' })
    } finally {
      busy.delete(session.sub)
    }
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse, session: SessionRecord): Promise<boolean> {
    const urlPath = (req.url ?? '/').split('?')[0]

    if (urlPath === '/api/chat/message' && req.method === 'POST') {
      let body: Record<string, unknown>
      try {
        body = await readJsonBody(req)
      } catch (err) {
        if (err instanceof PayloadTooLargeError) {
          json(res, 413, { error: 'Request body too large (max 64 KB)' })
          return true
        }
        json(res, 400, { error: 'Invalid JSON' })
        return true
      }
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (text.length === 0 || text.length > MAX_MESSAGE_CHARS) {
        json(res, 400, { error: `Message must be 1-${MAX_MESSAGE_CHARS} characters` })
        return true
      }
      await handleMessage(res, session, text)
      return true
    }

    if (urlPath === '/api/chat/history' && req.method === 'GET') {
      json(res, 200, {
        messages: getHistory(session.sub),
        budget: { usedToday: tokensUsedToday(session.sub), budget: chat.dailyTokenBudget },
      })
      return true
    }

    if (urlPath === '/api/chat/clear' && req.method === 'POST') {
      clearHistory(session.sub)
      audit(session.sub, 'chat_clear', {})
      json(res, 200, { ok: true })
      return true
    }

    return false
  }

  return {
    handleRequest,
    async close() {
      await initial.catch(() => {})
      if (state.kind === 'ready') await state.mcp.close().catch(() => {})
    },
  }
}
