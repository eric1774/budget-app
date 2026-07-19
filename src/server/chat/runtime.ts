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

export interface ChatRuntime {
  handleRequest(req: IncomingMessage, res: ServerResponse, session: SessionRecord): Promise<boolean>
  close(): Promise<void>
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk.toString() })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

const MAX_MESSAGE_CHARS = 2000
const HISTORY_TURNS = 20

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
      state = { kind: 'failed', reason }
      console.error(`Chat MCP connection failed: ${reason}`)
      // A tool-safety violation must never be retried into service
      if (/REFUSING TO START CHAT/.test(reason)) throw err
    }
  }
  const initial = establish().catch((err) => {
    console.error(err)
    process.exit(1) // spec: refuse to boot on tool-safety violation
  })

  async function handleMessage(res: ServerResponse, session: SessionRecord, text: string): Promise<void> {
    if (state.kind === 'failed') await establish().catch(() => {}) // one lazy heal attempt
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
      } catch {
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
