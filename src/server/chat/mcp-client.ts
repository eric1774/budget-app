import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { ChatEnvConfig } from '../config'

export interface McpTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export const READ_TOOL_PATTERN = /^(get_|search_)/
// Case-insensitive: a `Create_transaction` (or any odd-cased write verb) must
// still trip the safety check. READ_TOOL_PATTERN stays strict on purpose.
export const WRITE_TOOL_PATTERN = /^(create_|update_|delete_|store_|bulk_|trigger_|upload_|enable_|disable_|destroy_)/i

// Spec: refuse to boot if the toolbox could contain anything but reads.
// A write-verb tool in the RAW list means MCP_READ_ONLY failed — unsafe, fatal.
export function assertToolSafety(tools: McpTool[]): void {
  const writes = tools.filter((t) => WRITE_TOOL_PATTERN.test(t.name)).map((t) => t.name)
  if (writes.length > 0) {
    throw new Error(
      `REFUSING TO START CHAT: write tools present despite MCP_READ_ONLY: ${writes.join(', ')}`
    )
  }
}

// Only get_*/search_* reach the model. Read-like leftovers (export_, download_,
// test_, list_) are excluded, not fatal.
export function filterTools(tools: McpTool[]): McpTool[] {
  return tools.filter((t) => READ_TOOL_PATTERN.test(t.name))
}

export interface FireflyMcp {
  tools: McpTool[]
  callTool(name: string, args: Record<string, unknown>): Promise<string>
  close(): Promise<void>
}

// Re-checked at call time — the model must never reach an unfiltered tool.
export function assertCallAllowed(allowed: ReadonlySet<string>, name: string): void {
  if (!allowed.has(name)) throw new Error(`Tool not allowed: ${name}`)
}

// The Firefly MCP child only needs Firefly credentials + the read-only flag.
// Handing it the whole process.env would leak ANTHROPIC_API_KEY,
// OIDC_CLIENT_SECRET, session secrets, etc. to a third-party binary. Pass an
// explicit allowlist instead: a few benign runtime vars plus what it needs.
function buildChildEnv(chat: ChatEnvConfig): Record<string, string> {
  const env: Record<string, string> = {
    FIREFLY_URL: chat.fireflyUrl,
    FIREFLY_TOKEN: chat.fireflyToken,
    MCP_READ_ONLY: 'true',
  }
  for (const key of ['PATH', 'HOME', 'TZ', 'NODE_ENV']) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

export async function connectFireflyMcp(chat: ChatEnvConfig): Promise<FireflyMcp> {
  const [command, ...args] = chat.mcpCommand
  const transport = new StdioClientTransport({
    command,
    args,
    env: buildChildEnv(chat),
  })
  const client = new Client({ name: 'budget-app', version: '1.0.0' })
  await client.connect(transport)

  // Once connect() spawns the child, any failure below must tear it down —
  // otherwise a flaky tool list leaks one zombie process per heal attempt.
  try {
    const raw = (await client.listTools()).tools as McpTool[]
    assertToolSafety(raw)
    const tools = filterTools(raw)
    if (tools.length === 0) {
      throw new Error('REFUSING TO START CHAT: MCP server exposed no get_/search_ tools')
    }
    const allowed = new Set(tools.map((t) => t.name))
    console.log(`Firefly MCP connected: ${tools.length} read tools (of ${raw.length} exposed)`)

    return {
      tools,
      async callTool(name, callArgs) {
        assertCallAllowed(allowed, name)
        const result = await client.callTool({ name, arguments: callArgs })
        const parts = (result.content ?? []) as { type: string; text?: string }[]
        const text = parts.filter((p) => p.type === 'text' && p.text).map((p) => p.text).join('\n')
        if (result.isError) throw new Error(text || `Tool ${name} failed`)
        return text
      },
      async close() {
        await client.close()
      },
    }
  } catch (err) {
    await client.close().catch(() => {})
    throw err
  }
}
