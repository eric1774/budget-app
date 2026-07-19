import type { McpTool } from './mcp-client'

export interface AnthropicMessageLike {
  content: { type: string; text?: string; id?: string; name?: string; input?: unknown }[]
  stop_reason: string | null
  usage: { input_tokens: number; output_tokens: number }
}

export interface EngineDeps {
  createMessage(params: Record<string, unknown>): Promise<AnthropicMessageLike>
  callTool(name: string, args: Record<string, unknown>): Promise<string>
  onAudit(event: string, detail: unknown): void
}

export interface ChatTurnResult {
  reply: string
  tokens: number
}

export const CHAT_SYSTEM_PROMPT = `You are the family budget assistant for a household's Firefly III finance data.
You have READ-ONLY tools: you can look up accounts, transactions, budgets, categories, bills and summaries, but you cannot create, modify or delete anything.
If asked to change data, explain that changes go through the approval workflow (coming soon) and offer the relevant numbers instead.
Answer concisely with concrete amounts and dates. Currency is USD. Today's data lives in the household's Firefly III instance; use the tools rather than guessing.
If a tool fails or Firefly is unreachable, say so plainly and suggest trying again later.`

const MAX_TOOL_ITERATIONS = 8
const MAX_TOKENS = 4096

function toAnthropicTools(tools: McpTool[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.inputSchema,
  }))
}

export async function runChatTurn(
  deps: EngineDeps,
  model: string,
  tools: McpTool[],
  history: { role: 'user' | 'assistant'; text: string }[]
): Promise<ChatTurnResult> {
  const anthropicTools = toAnthropicTools(tools)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = history.map((m) => ({ role: m.role, content: m.text }))
  let tokens = 0

  for (let iteration = 0; ; iteration++) {
    const final = iteration >= MAX_TOOL_ITERATIONS
    const response = await deps.createMessage({
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: CHAT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: anthropicTools,
      ...(final ? { tool_choice: { type: 'none' } } : {}),
      messages,
    })
    tokens += response.usage.input_tokens + response.usage.output_tokens

    const toolUses = response.content.filter((b) => b.type === 'tool_use')
    if (response.stop_reason !== 'tool_use' || toolUses.length === 0 || final) {
      const reply = response.content
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text)
        .join('\n')
        .trim()
      return { reply: reply || '(no answer)', tokens }
    }

    messages.push({ role: 'assistant', content: response.content })
    const results = []
    for (const use of toolUses) {
      const args = (use.input ?? {}) as Record<string, unknown>
      deps.onAudit('tool_call', { name: use.name, args })
      try {
        const text = await deps.callTool(use.name as string, args)
        results.push({ type: 'tool_result', tool_use_id: use.id, content: text })
      } catch (err) {
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        })
      }
    }
    messages.push({ role: 'user', content: results })
  }
}
