import { describe, it, expect } from 'vitest'
import { runChatTurn, CHAT_SYSTEM_PROMPT, type EngineDeps, type AnthropicMessageLike } from '../src/server/chat/engine'
import type { McpTool } from '../src/server/chat/mcp-client'

const tools: McpTool[] = [{ name: 'get_accounts', description: 'List accounts', inputSchema: { type: 'object' } }]

function textMsg(text: string, tokens = 10): AnthropicMessageLike {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: tokens, output_tokens: tokens } }
}

function toolMsg(name: string, input: unknown): AnthropicMessageLike {
  return {
    content: [{ type: 'tool_use', id: 'tu_1', name, input }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 10 },
  }
}

describe('chat engine', () => {
  it('returns a plain answer without tools', async () => {
    const audits: string[] = []
    const deps: EngineDeps = {
      createMessage: async () => textMsg('Hello Eric'),
      callTool: async () => { throw new Error('should not be called') },
      onAudit: (e) => audits.push(e),
    }
    const r = await runChatTurn(deps, 'claude-haiku-4-5', tools, [{ role: 'user', text: 'hi' }])
    expect(r.reply).toBe('Hello Eric')
    expect(r.tokens).toBe(20)
    expect(audits).toEqual([])
  })

  it('runs a tool round-trip and audits the call', async () => {
    const calls: unknown[] = []
    const audits: { e: string; d: unknown }[] = []
    let step = 0
    const deps: EngineDeps = {
      createMessage: async (params) => {
        step++
        if (step === 1) return toolMsg('get_accounts', { type: 'asset' })
        // Second request must carry the tool_result back
        const messages = params.messages as { role: string; content: unknown }[]
        expect(JSON.stringify(messages)).toContain('tool_result')
        return textMsg('You have 3 accounts.')
      },
      callTool: async (name, args) => {
        calls.push({ name, args })
        return '[{"name":"Red Baron"}]'
      },
      onAudit: (e, d) => audits.push({ e, d }),
    }
    const r = await runChatTurn(deps, 'claude-haiku-4-5', tools, [{ role: 'user', text: 'how many accounts?' }])
    expect(r.reply).toBe('You have 3 accounts.')
    expect(calls).toEqual([{ name: 'get_accounts', args: { type: 'asset' } }])
    expect(audits.some((a) => a.e === 'tool_call')).toBe(true)
    expect(r.tokens).toBe(40) // two iterations × 20
  })

  it('feeds tool errors back to the model instead of throwing', async () => {
    let step = 0
    const deps: EngineDeps = {
      createMessage: async (params) => {
        step++
        if (step === 1) return toolMsg('get_accounts', {})
        expect(JSON.stringify(params.messages)).toContain('"is_error":true')
        return textMsg('Firefly seems unreachable right now.')
      },
      callTool: async () => { throw new Error('ECONNREFUSED') },
      onAudit: () => {},
    }
    const r = await runChatTurn(deps, 'claude-haiku-4-5', tools, [{ role: 'user', text: 'spend?' }])
    expect(r.reply).toBe('Firefly seems unreachable right now.')
  })

  it('caps tool iterations at 8 and still returns an answer', async () => {
    let requests = 0
    const deps: EngineDeps = {
      createMessage: async (params) => {
        requests++
        // After the cap the engine must ask for a final answer without tools
        if (requests <= 8) {
          expect(params.tools).toBeTruthy()
          return toolMsg('get_accounts', {})
        }
        expect(params.tool_choice).toEqual({ type: 'none' })
        return textMsg('Partial answer from what I gathered.')
      },
      callTool: async () => 'data',
      onAudit: () => {},
    }
    const r = await runChatTurn(deps, 'claude-haiku-4-5', tools, [{ role: 'user', text: 'loop!' }])
    expect(requests).toBe(9)
    expect(r.reply).toBe('Partial answer from what I gathered.')
  })

  it('system prompt pins the read-only contract', () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/read-only/i)
    expect(CHAT_SYSTEM_PROMPT).toMatch(/cannot .*(create|modify|delete)/i)
  })
})
