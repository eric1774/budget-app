import { describe, it, expect } from 'vitest'
import { runChatTurn, todayContext, CHAT_SYSTEM_PROMPT, type EngineDeps, type AnthropicMessageLike } from '../src/server/chat/engine'
import type { McpTool } from '../src/server/chat/mcp-client'

const tools: McpTool[] = [
  { name: 'get_accounts', description: 'List accounts', inputSchema: { type: 'object' } },
  { name: 'search_transactions', description: 'Search transactions', inputSchema: { type: 'object' } },
]

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
  it('sends the current date as an uncached system block after the cached prompt', async () => {
    let seen: Record<string, unknown> | null = null
    const deps: EngineDeps = {
      createMessage: async (params) => { seen = params; return textMsg('ok') },
      callTool: async () => { throw new Error('should not be called') },
      onAudit: () => {},
    }
    await runChatTurn(deps, 'claude-haiku-4-5', tools, [{ role: 'user', text: 'hi' }])
    const system = (seen as unknown as { system: { text: string; cache_control?: unknown }[] }).system
    expect(system).toHaveLength(2)
    expect(system[0].text).toBe(CHAT_SYSTEM_PROMPT)
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(system[1].text).toMatch(/Today's date is \w+, \d{4}-\d{2}-\d{2} \(America\/Chicago\)/)
    expect(system[1].cache_control).toBeUndefined()
    // block text matches what todayContext produces for the same moment
    expect(system[1].text).toBe(todayContext())
  })

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

  it('runs parallel tool_use blocks from a single response in order and merges both results', async () => {
    const calls: unknown[] = []
    const audits: { e: string; d: unknown }[] = []
    let step = 0
    const deps: EngineDeps = {
      createMessage: async (params) => {
        step++
        if (step === 1) {
          return {
            content: [
              { type: 'tool_use', id: 'tu_1', name: 'get_accounts', input: { type: 'asset' } },
              { type: 'tool_use', id: 'tu_2', name: 'search_transactions', input: { query: 'coffee' } },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 10 },
          }
        }
        const messages = params.messages as { role: string; content: unknown }[]
        const userMessages = messages.filter((m) => m.role === 'user')
        // Only the original user message plus a single follow-up user message carrying both tool results
        expect(userMessages.length).toBe(2)
        const followUp = userMessages[userMessages.length - 1]
        const content = followUp.content as { type: string; tool_use_id: string }[]
        expect(content).toHaveLength(2)
        expect(content.map((c) => c.tool_use_id)).toEqual(['tu_1', 'tu_2'])
        expect(content.every((c) => c.type === 'tool_result')).toBe(true)
        return textMsg('You have 3 accounts and 1 coffee purchase.')
      },
      callTool: async (name, args) => {
        calls.push({ name, args })
        return name === 'get_accounts' ? '[{"name":"Red Baron"}]' : '[{"description":"Coffee"}]'
      },
      onAudit: (e, d) => audits.push({ e, d }),
    }
    const r = await runChatTurn(deps, 'claude-haiku-4-5', tools, [{ role: 'user', text: 'accounts and coffee spend?' }])
    expect(calls).toEqual([
      { name: 'get_accounts', args: { type: 'asset' } },
      { name: 'search_transactions', args: { query: 'coffee' } },
    ])
    expect(audits.filter((a) => a.e === 'tool_call')).toHaveLength(2)
    expect(r.reply).toBe('You have 3 accounts and 1 coffee purchase.')
  })

  it('falls back to (no answer) when the final response has no text blocks', async () => {
    const deps: EngineDeps = {
      createMessage: async () => ({
        content: [],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 5 },
      }),
      callTool: async () => { throw new Error('should not be called') },
      onAudit: () => {},
    }
    const r = await runChatTurn(deps, 'claude-haiku-4-5', tools, [{ role: 'user', text: 'hi' }])
    expect(r.reply).toBe('(no answer)')
  })
})
