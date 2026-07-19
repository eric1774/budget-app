# Phase 3: Read-Only Firefly Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chat tab where any signed-in family member asks natural-language questions about the TEST Firefly III instance, answered by Claude with read-only Firefly tools — structurally incapable of writing.

**Architecture:** budget-app spawns `@daften/fireflyiii-mcp` as a stdio child process with `MCP_READ_ONLY=true` and a read-only Firefly PAT. At startup the app fetches the MCP tool list, passes ONLY tools matching `^(get_|search_)` to Claude, and refuses to boot if any write-verb tool leaked through read-only mode. Each chat message runs a manual tool-use loop against the Claude API (`claude-haiku-4-5` default, Sonnet toggle); every message and every MCP tool call is written to an append-only `audit_log`; per-user history and a per-user daily token budget live in SQLite.

**Tech Stack:** `@anthropic-ai/sdk` (manual tool loop, prompt caching), `@modelcontextprotocol/sdk` (stdio client), `@daften/fireflyiii-mcp` (spawned server, pinned version), existing `node:sqlite` db, existing hand-rolled http server + auth gate, React chat tab.

This is spec rollout phase 3 of `docs/superpowers/specs/2026-07-13-firefly-chat-approval-design.md`. Phase 4 (propose_transaction, approval queue, ntfy) is a separate plan; the `audit_log` table created here is the one Phase 4 extends.

## Global Constraints

- Working copy `BUDGET\Dev` untouched; all work in worktree `C:\dev\budget-phase1` on branch `feature/phase3-chat`; merge only on Eric's explicit approval. NOTE: PR #5 (`fix/ws-session-expiry`) touches `src/main/server.ts` — if it merges first, rebase this branch before opening the PR.
- **Firefly TEST only**: `FIREFLY_URL` points at TEST (`http://192.168.1.113`). PROD flip is a separate, Eric-approved change.
- **Read-only by construction** (spec): the MCP child runs with `MCP_READ_ONLY=true` AND a Firefly PAT that should be created fresh for this app; the app additionally passes only `get_*`/`search_*` tools to the model and **refuses to boot** if the MCP tool list contains any tool matching `^(create_|update_|delete_|store_|bulk_|trigger_|upload_|enable_|disable_|destroy_)` (read-only mode failed = unsafe). Tools that are read-like but non-matching (`export_*`, `download_*`, `list_*`, `test_*`) are silently EXCLUDED from the model's toolbox, not fatal.
- Spec correction (verified 2026-07-19 against the package docs): `@daften/fireflyiii-mcp` has no `insights` preset. Env vars are `FIREFLY_URL`, `FIREFLY_TOKEN`, `MCP_READ_ONLY` (`true`/`1`), and optional `MCP_GROUPS` (comma-separated group names). The startup allowlist above supersedes the preset as the structural guarantee.
- Chat model: `claude-haiku-4-5` default, `claude-sonnet-5` via `CHAT_MODEL` env toggle (spec: Haiku default + Sonnet toggle — deliberate, Eric-approved cost choice). Plain `messages.create`, NO `thinking` parameter (Haiku 4.5 doesn't support adaptive thinking), `max_tokens: 4096`.
- Anthropic API key lives ONLY in server env (`ANTHROPIC_API_KEY`); Firefly PAT ONLY in server env. Neither is ever sent to the browser or committed.
- Per-user daily token budget: `CHAT_DAILY_TOKEN_BUDGET` env, default `250000` (input+output, resets midnight server time America/Chicago).
- Requester identity always from the session, never from the model or client payload.
- Chat is OPTIONAL at boot: if `ANTHROPIC_API_KEY`/`FIREFLY_URL`/`FIREFLY_TOKEN` are unset, the app boots with chat disabled (dashboard unaffected; chat endpoints return 503 with a clear message). If they ARE set, an MCP boot failure is FATAL only for the tool-safety violation; an unreachable Firefly at boot degrades gracefully (spec: "Firefly unreachable → chat degrades gracefully").
- Audit (spec "Accounting", chat portion): append-only `audit_log` rows for every chat message and every MCP tool call (name + arguments), tagged user sub + timestamp. Admin UI view is Phase 4.
- No new native npm modules. Pin `@daften/fireflyiii-mcp` to an exact version in package.json.
- Commit after every task; `feat:`/`fix:`/`chore:`/`docs:` style.

## File Structure

| File | Responsibility |
|---|---|
| Create `src/server/chat/mcp-client.ts` | Spawn/connect the stdio MCP child; `filterTools`/`assertToolSafety` (pure, tested); `callTool`; close |
| Create `src/server/chat/engine.ts` | The Claude tool-use loop. DI: takes an Anthropic-like `createMessage` fn and an Mcp-like `callTool` fn so tests stub both |
| Create `src/server/chat/history-store.ts` | `chat_messages` CRUD + `tokensUsedToday(sub)` |
| Create `src/server/chat/audit-store.ts` | Append-only `audit_log` inserts + `recentAudit()` |
| Create `src/server/chat/runtime.ts` | `initChat()` → ChatRuntime: HTTP routes `/api/chat/*`, budget enforcement, graceful-degradation states |
| Modify `src/server/db.ts` | Add `chat_messages` + `audit_log` tables |
| Modify `src/server/config.ts` | `chat: ChatEnvConfig \| null` block |
| Modify `src/main/server.ts` | Delegate `/api/chat/*` to ChatRuntime (after auth gate, session in hand) |
| Modify `src/server/index.ts` | Boot wiring: init chat, startup tool assertion, shutdown |
| Modify `src/shared/types.ts` | `ChatMessage` wire type |
| Create `src/renderer/src/components/ChatTab.tsx` | Chat UI (history, input, busy state, error banners) |
| Modify `src/renderer/src/api.ts`, `App.tsx`, `index.css` | chat API calls, Chat tab, styles |
| Modify `Dockerfile`, `docker-compose.yml`, `.env.example`, `docs/DEPLOY.md` | MCP server install at `/mcp`, env plumbing, Phase 3 runbook |
| Tests | `tests/chat-mcp-filter.test.ts`, `tests/chat-engine.test.ts`, `tests/chat-history-store.test.ts`, `tests/chat-audit-store.test.ts`, `tests/chat-routes.test.ts`, updates to `tests/config.test.ts`, `tests/db.test.ts` |

---

### Task 1: Dependencies + chat config block

**Files:**
- Modify: `package.json`, `src/server/config.ts`, `src/shared/types.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces (consumed by every later task):

```ts
// src/server/config.ts
export interface ChatEnvConfig {
  anthropicApiKey: string        // ANTHROPIC_API_KEY
  fireflyUrl: string             // FIREFLY_URL, trailing slash stripped
  fireflyToken: string           // FIREFLY_TOKEN (read-only PAT)
  model: string                  // CHAT_MODEL, default 'claude-haiku-4-5'
  dailyTokenBudget: number       // CHAT_DAILY_TOKEN_BUDGET, default 250000
  mcpCommand: string[]           // FIREFLY_MCP_COMMAND split on spaces, default ['npx','-y','@daften/fireflyiii-mcp']
}
export interface ServerConfig { /* existing */; chat: ChatEnvConfig | null }
// chat is null (with no throw) when any of the three required vars is missing.

// src/shared/types.ts
export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  createdAt: string   // ISO
}
```

- [ ] **Step 1: Install dependencies**

```bash
cd /c/dev/budget-phase1
npm install @anthropic-ai/sdk @modelcontextprotocol/sdk
npm install --save-exact @daften/fireflyiii-mcp
```

(`--save-exact` pins the MCP server version — its tool list is our security surface.)

- [ ] **Step 2: Write the failing tests**

Append to `tests/config.test.ts` (inside the file; keep existing tests untouched):

```ts
describe('chat config', () => {
  const base = {
    BUDGET_XLSX_PATH: '/x.xlsx',
    AUTH_DISABLED: '1',
    ANTHROPIC_API_KEY: 'sk-test',
    FIREFLY_URL: 'http://192.168.1.113/',
    FIREFLY_TOKEN: 'pat-read',
  }

  it('is null when chat env vars are absent (chat optional)', () => {
    expect(getConfig({ BUDGET_XLSX_PATH: '/x.xlsx', AUTH_DISABLED: '1' }).chat).toBeNull()
  })

  it('is null when only some chat vars are present', () => {
    const { FIREFLY_TOKEN: _omit, ...partial } = base
    expect(getConfig(partial).chat).toBeNull()
  })

  it('parses the chat block with defaults', () => {
    const c = getConfig(base)
    expect(c.chat).toEqual({
      anthropicApiKey: 'sk-test',
      fireflyUrl: 'http://192.168.1.113',
      fireflyToken: 'pat-read',
      model: 'claude-haiku-4-5',
      dailyTokenBudget: 250000,
      mcpCommand: ['npx', '-y', '@daften/fireflyiii-mcp'],
    })
  })

  it('honors CHAT_MODEL, CHAT_DAILY_TOKEN_BUDGET and FIREFLY_MCP_COMMAND overrides', () => {
    const c = getConfig({
      ...base,
      CHAT_MODEL: 'claude-sonnet-5',
      CHAT_DAILY_TOKEN_BUDGET: '50000',
      FIREFLY_MCP_COMMAND: '/mcp/node_modules/.bin/fireflyiii-mcp',
    })
    expect(c.chat?.model).toBe('claude-sonnet-5')
    expect(c.chat?.dailyTokenBudget).toBe(50000)
    expect(c.chat?.mcpCommand).toEqual(['/mcp/node_modules/.bin/fireflyiii-mcp'])
  })

  it('throws on a non-positive CHAT_DAILY_TOKEN_BUDGET', () => {
    expect(() => getConfig({ ...base, CHAT_DAILY_TOKEN_BUDGET: '0' })).toThrow(/CHAT_DAILY_TOKEN_BUDGET/)
  })
})
```

- [ ] **Step 3: Run to verify the new tests fail**

Run: `npx vitest run tests/config.test.ts` — Expected: existing pass, new 5 FAIL (`c.chat` undefined).

- [ ] **Step 4: Implement**

In `src/shared/types.ts` append:

```ts
// ── Chat (Phase 3) ────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  createdAt: string
}
```

In `src/server/config.ts` add the interface, the field `chat: ChatEnvConfig | null` on `ServerConfig`, and:

```ts
export interface ChatEnvConfig {
  anthropicApiKey: string
  fireflyUrl: string
  fireflyToken: string
  model: string
  dailyTokenBudget: number
  mcpCommand: string[]
}

function getChatConfig(env: NodeJS.ProcessEnv): ChatEnvConfig | null {
  const { ANTHROPIC_API_KEY, FIREFLY_URL, FIREFLY_TOKEN } = env
  // Chat is an optional feature — the Excel dashboard must work without it
  if (!ANTHROPIC_API_KEY || !FIREFLY_URL || !FIREFLY_TOKEN) return null
  const budget = env.CHAT_DAILY_TOKEN_BUDGET ? Number(env.CHAT_DAILY_TOKEN_BUDGET) : 250000
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error('CHAT_DAILY_TOKEN_BUDGET must be a positive number')
  }
  return {
    anthropicApiKey: ANTHROPIC_API_KEY,
    fireflyUrl: FIREFLY_URL.replace(/\/+$/, ''),
    fireflyToken: FIREFLY_TOKEN,
    model: env.CHAT_MODEL ?? 'claude-haiku-4-5',
    dailyTokenBudget: budget,
    mcpCommand: (env.FIREFLY_MCP_COMMAND ?? 'npx -y @daften/fireflyiii-mcp').split(' ').filter(Boolean),
  }
}
```

and add `chat: getChatConfig(env),` to the returned object.

- [ ] **Step 5: Run tests, then full suite**

Run: `npx vitest run tests/config.test.ts` — Expected: all PASS. Then `npm test` — all PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/server/config.ts src/shared/types.ts tests/config.test.ts
git commit -m "feat: chat dependencies and optional chat config block"
```

---

### Task 2: Chat + audit tables in db.ts

**Files:**
- Modify: `src/server/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces tables (consumed by Tasks 3–4):
  - `chat_messages(id INTEGER PK AUTOINCREMENT, sub TEXT, role TEXT CHECK ('user','assistant'), text TEXT, tokens INTEGER NOT NULL DEFAULT 0, created_at INTEGER)` + index on `(sub, created_at)`
  - `audit_log(id INTEGER PK AUTOINCREMENT, sub TEXT, event TEXT, detail TEXT, created_at INTEGER)` + index on `created_at`

- [ ] **Step 1: Write the failing test** — append to `tests/db.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/db.test.ts` — new tests FAIL.

- [ ] **Step 3: Implement** — extend `SCHEMA` in `src/server/db.ts`:

```ts
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  sub TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sub TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sub_created ON chat_messages (sub, created_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sub TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at);
`
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/db.test.ts` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db.ts tests/db.test.ts
git commit -m "feat: chat_messages and audit_log tables"
```

---

### Task 3: History store + audit store

**Files:**
- Create: `src/server/chat/history-store.ts`, `src/server/chat/audit-store.ts`
- Test: `tests/chat-history-store.test.ts`, `tests/chat-audit-store.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 4–5):

```ts
// history-store.ts
export function appendMessage(sub: string, role: 'user' | 'assistant', text: string, tokens: number): ChatMessage
export function getHistory(sub: string, limit?: number): ChatMessage[]      // oldest→newest, default limit 50
export function clearHistory(sub: string): void
export function tokensUsedToday(sub: string, now?: Date): number            // sum since local midnight

// audit-store.ts
export function audit(sub: string, event: string, detail: unknown): void    // detail JSON.stringified, truncated to 4000 chars
export function recentAudit(limit?: number): { id: number; sub: string; event: string; detail: string; createdAt: string }[]
```

- [ ] **Step 1: Write the failing tests**

Create `tests/chat-history-store.test.ts`:

```ts
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
```

Create `tests/chat-audit-store.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — both files FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/server/chat/history-store.ts`:

```ts
import type { ChatMessage } from '../../shared/types'
import { getDb } from '../db'

interface Row {
  id: number
  role: 'user' | 'assistant'
  text: string
  created_at: number
}

function toMessage(r: Row): ChatMessage {
  return { id: r.id, role: r.role, text: r.text, createdAt: new Date(r.created_at).toISOString() }
}

export function appendMessage(sub: string, role: 'user' | 'assistant', text: string, tokens: number): ChatMessage {
  const now = Date.now()
  const result = getDb()
    .prepare('INSERT INTO chat_messages (sub, role, text, tokens, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(sub, role, text, tokens, now)
  return { id: Number(result.lastInsertRowid), role, text, createdAt: new Date(now).toISOString() }
}

export function getHistory(sub: string, limit = 50): ChatMessage[] {
  const rows = getDb()
    .prepare('SELECT id, role, text, created_at FROM chat_messages WHERE sub = ? ORDER BY id DESC LIMIT ?')
    .all(sub, limit) as unknown as Row[]
  return rows.reverse().map(toMessage)
}

export function clearHistory(sub: string): void {
  getDb().prepare('DELETE FROM chat_messages WHERE sub = ?').run(sub)
}

export function tokensUsedToday(sub: string, now = new Date()): number {
  // Local midnight (container runs TZ=America/Chicago, matching the budget's day)
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(tokens), 0) AS total FROM chat_messages WHERE sub = ? AND created_at >= ?')
    .get(sub, midnight) as { total: number }
  return Number(row.total)
}
```

Create `src/server/chat/audit-store.ts`:

```ts
import { getDb } from '../db'

const MAX_DETAIL = 4000

export function audit(sub: string, event: string, detail: unknown): void {
  let text: string
  try {
    text = JSON.stringify(detail) ?? 'null'
  } catch {
    text = String(detail)
  }
  if (text.length > MAX_DETAIL) text = text.slice(0, MAX_DETAIL)
  getDb()
    .prepare('INSERT INTO audit_log (sub, event, detail, created_at) VALUES (?, ?, ?, ?)')
    .run(sub, event, text, Date.now())
}

export interface AuditRow {
  id: number
  sub: string
  event: string
  detail: string
  createdAt: string
}

export function recentAudit(limit = 100): AuditRow[] {
  const rows = getDb()
    .prepare('SELECT id, sub, event, detail, created_at FROM audit_log ORDER BY id DESC LIMIT ?')
    .all(limit) as unknown as { id: number; sub: string; event: string; detail: string; created_at: number }[]
  return rows.map((r) => ({ id: r.id, sub: r.sub, event: r.event, detail: r.detail, createdAt: new Date(r.created_at).toISOString() }))
}
```

- [ ] **Step 4: Run to verify pass** — both suites PASS. Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/server/chat/history-store.ts src/server/chat/audit-store.ts tests/chat-history-store.test.ts tests/chat-audit-store.test.ts
git commit -m "feat: chat history store with daily token accounting; append-only audit store"
```

---

### Task 4: MCP client — tool filtering and the safety assertion

**Files:**
- Create: `src/server/chat/mcp-client.ts`
- Test: `tests/chat-mcp-filter.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 5–6):

```ts
export interface McpTool { name: string; description?: string; inputSchema: Record<string, unknown> }
export const READ_TOOL_PATTERN: RegExp        // ^(get_|search_)
export const WRITE_TOOL_PATTERN: RegExp       // ^(create_|update_|delete_|store_|bulk_|trigger_|upload_|enable_|disable_|destroy_)
export function assertToolSafety(tools: McpTool[]): void       // throws if any write tool present
export function filterTools(tools: McpTool[]): McpTool[]       // keeps only READ_TOOL_PATTERN matches
export interface FireflyMcp {
  tools: McpTool[]                                              // already filtered + asserted
  callTool(name: string, args: Record<string, unknown>): Promise<string>  // throws on unknown/unfiltered name
  close(): Promise<void>
}
export async function connectFireflyMcp(chat: ChatEnvConfig): Promise<FireflyMcp>
```

`connectFireflyMcp` hits the real child process and is exercised in UAT; unit tests cover the pure guard functions and the name re-check in a stubbed callTool.

- [ ] **Step 1: Write the failing tests**

Create `tests/chat-mcp-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { assertToolSafety, filterTools, READ_TOOL_PATTERN, WRITE_TOOL_PATTERN, type McpTool } from '../src/server/chat/mcp-client'

const t = (name: string): McpTool => ({ name, inputSchema: { type: 'object' } })

describe('MCP tool safety', () => {
  it('filterTools keeps only get_/search_ tools', () => {
    const tools = [t('get_accounts'), t('search_transactions'), t('export_transactions'), t('download_attachment'), t('list_something')]
    expect(filterTools(tools).map((x) => x.name)).toEqual(['get_accounts', 'search_transactions'])
  })

  it('assertToolSafety passes on a clean read-only list', () => {
    expect(() => assertToolSafety([t('get_accounts'), t('export_transactions')])).not.toThrow()
  })

  it('assertToolSafety throws when a write tool leaked through', () => {
    for (const bad of ['create_transaction', 'update_account', 'delete_budget', 'store_rule', 'bulk_update_transactions', 'trigger_recurrence', 'upload_attachment', 'enable_currency', 'disable_currency', 'destroy_object']) {
      expect(() => assertToolSafety([t('get_accounts'), t(bad)]), bad).toThrow(/write/i)
    }
  })

  it('patterns are anchored at the start', () => {
    expect(READ_TOOL_PATTERN.test('forget_me')).toBe(false)
    expect(WRITE_TOOL_PATTERN.test('recreate_view')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement**

Create `src/server/chat/mcp-client.ts`:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { ChatEnvConfig } from '../config'

export interface McpTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export const READ_TOOL_PATTERN = /^(get_|search_)/
export const WRITE_TOOL_PATTERN = /^(create_|update_|delete_|store_|bulk_|trigger_|upload_|enable_|disable_|destroy_)/

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

export async function connectFireflyMcp(chat: ChatEnvConfig): Promise<FireflyMcp> {
  const [command, ...args] = chat.mcpCommand
  const transport = new StdioClientTransport({
    command,
    args,
    env: {
      ...process.env,
      FIREFLY_URL: chat.fireflyUrl,
      FIREFLY_TOKEN: chat.fireflyToken,
      MCP_READ_ONLY: 'true',
    },
  })
  const client = new Client({ name: 'budget-app', version: '1.0.0' })
  await client.connect(transport)

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
      // Re-check at call time — the model must never reach an unfiltered tool
      if (!allowed.has(name)) throw new Error(`Tool not allowed: ${name}`)
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
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/chat-mcp-filter.test.ts` PASS; `npm test` green; `npm run build:web` exit 0 (confirms the MCP SDK imports bundle).

- [ ] **Step 5: Commit**

```bash
git add src/server/chat/mcp-client.ts tests/chat-mcp-filter.test.ts
git commit -m "feat: Firefly MCP client with read-only tool filtering and boot assertion"
```

---

### Task 5: Chat engine — the Claude tool-use loop

**Files:**
- Create: `src/server/chat/engine.ts`
- Test: `tests/chat-engine.test.ts`

**Interfaces:**
- Consumes: `McpTool`, `FireflyMcp.callTool` shape (Task 4); `ChatEnvConfig` (Task 1).
- Produces (consumed by Task 6):

```ts
export interface EngineDeps {
  createMessage(params: Record<string, unknown>): Promise<AnthropicMessageLike>  // wraps client.messages.create
  callTool(name: string, args: Record<string, unknown>): Promise<string>
  onAudit(event: string, detail: unknown): void
}
export interface AnthropicMessageLike {
  content: { type: string; text?: string; id?: string; name?: string; input?: unknown }[]
  stop_reason: string | null
  usage: { input_tokens: number; output_tokens: number }
}
export interface ChatTurnResult { reply: string; tokens: number }
export const CHAT_SYSTEM_PROMPT: string
export async function runChatTurn(
  deps: EngineDeps,
  model: string,
  tools: McpTool[],
  history: { role: 'user' | 'assistant'; text: string }[],   // includes the new user message as last entry
): Promise<ChatTurnResult>
```

Loop rules: max 8 tool iterations (then a final no-tools request for a wrap-up answer); every tool_use audited as `tool_call` before execution; tool errors returned to the model as `is_error` tool_results (never thrown to the user); tokens = sum of input+output across all iterations.

- [ ] **Step 1: Write the failing tests**

Create `tests/chat-engine.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement**

Create `src/server/chat/engine.ts`:

```ts
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
Answer concisely with concrete amounts and dates. Currency is USD. Today’s data lives in the household's Firefly III instance; use the tools rather than guessing.
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
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/chat-engine.test.ts` PASS; `npm test` green.

- [ ] **Step 5: Commit**

```bash
git add src/server/chat/engine.ts tests/chat-engine.test.ts
git commit -m "feat: chat engine — Claude tool-use loop with audit hooks and iteration cap"
```

---

### Task 6: Chat runtime — HTTP routes, budget, degradation

**Files:**
- Create: `src/server/chat/runtime.ts`
- Test: `tests/chat-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5 exports; `SessionRecord` (auth).
- Produces (consumed by Tasks 7–8):

```ts
export type ChatState =
  | { kind: 'ready'; mcp: FireflyMcp }
  | { kind: 'starting' }
  | { kind: 'failed'; reason: string }
export interface ChatRuntime {
  /** Handles /api/chat/*. Returns true when handled. Session is non-null (gate ran first). */
  handleRequest(req: IncomingMessage, res: ServerResponse, session: SessionRecord): Promise<boolean>
  close(): Promise<void>
}
export function initChat(chat: ChatEnvConfig, deps?: Partial<EngineDeps> & { connect?: () => Promise<FireflyMcp> }): ChatRuntime
```

Routes (all under the auth gate, member+):
- `POST /api/chat/message` `{text: string}` (1–2000 chars) → `{reply: ChatMessage, usage: {tokens, usedToday, budget}}`; 503 `{error}` if MCP failed/starting; 429 `{error}` when `tokensUsedToday >= budget`; audits `chat_message` (user) and stores both sides in history.
- `GET /api/chat/history` → `{messages: ChatMessage[], budget: {usedToday, budget}}`
- `POST /api/chat/clear` → `{ok: true}`
- One in-flight turn per user (simple per-sub mutex): concurrent second POST → 409 `{error: 'A reply is already in progress'}`.

MCP connection is lazy-retried: `initChat` kicks off `connect()` in the background; on failure state = `failed` and the NEXT `/api/chat/message` attempt triggers one reconnect try (so a Firefly that comes up later heals without a restart).

- [ ] **Step 1: Write the failing tests**

Create `tests/chat-routes.test.ts` (bare http server around `handleRequest` with stubbed deps — no network, no child process):

```ts
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
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement**

Create `src/server/chat/runtime.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/chat-routes.test.ts` PASS; `npm test` green.

- [ ] **Step 5: Commit**

```bash
git add src/server/chat/runtime.ts tests/chat-routes.test.ts
git commit -m "feat: chat runtime — routes, daily budget, per-user mutex, graceful degradation"
```

---

### Task 7: Server + boot wiring

**Files:**
- Modify: `src/main/server.ts`, `src/server/index.ts`

**Interfaces:**
- Consumes: `ChatRuntime` (Task 6). `StartServerOptions` gains `chat?: ChatRuntime | null`.
- Behavior: `/api/chat/*` requests reach the chat runtime ONLY with a valid session (auth gate already ran). When `chat` is absent (Electron, chat disabled), `/api/chat/*` falls through to 404-ish SPA behavior — the runtime handles nothing. When auth is DISABLED (local dev) but chat is configured, chat still works using a synthetic dev session.

- [ ] **Step 1: Modify src/main/server.ts**

Add import and option:

```ts
import type { ChatRuntime } from '../server/chat/runtime'
import type { SessionRecord } from '../server/auth/session-store'
```

```ts
export interface StartServerOptions {
  rendererRoot: string
  preferredPort?: number
  auth?: AuthRuntime | null
  chat?: ChatRuntime | null
}
```

Inside `handleRequest`, capture the session where the gate validates it, then delegate chat BEFORE the existing routing. Replace the gate block's session line and add the chat delegation right after the gate:

```ts
    let session: SessionRecord | null = null

    // ── Auth gate (web mode only; Electron passes no auth runtime) ──────────
    if (opts.auth) {
      if (await opts.auth.handleRequest(req, res)) return
      if (!PUBLIC_PATHS.has(urlPath)) {
        session = opts.auth.getSessionUser(req)
        if (!session) {
          // ... existing 401/302 logic unchanged ...
        }
        // ... existing Origin check unchanged ...
      }
    }

    // ── Chat routes (need an identity; synthesize one in auth-disabled dev) ──
    if (opts.chat && urlPath.startsWith('/api/chat/')) {
      const chatSession: SessionRecord =
        session ?? { id: 'dev', sub: 'dev-user', name: 'Dev', email: '', role: 'admin', expiresAt: Number.MAX_SAFE_INTEGER }
      if (await opts.chat.handleRequest(req, res, chatSession)) return
    }
```

(Only the `const session` declaration moves up; the assignment inside the gate changes from `const session =` to `session =`. Everything else stays byte-identical.)

- [ ] **Step 2: Modify src/server/index.ts**

After the auth block, add:

```ts
import { initChat, type ChatRuntime } from './chat/runtime'
```

```ts
  let chatRuntime: ChatRuntime | null = null
  if (config.chat) {
    chatRuntime = initChat(config.chat)
    console.log(`Chat enabled — model ${config.chat.model}, Firefly ${config.chat.fireflyUrl}, daily budget ${config.chat.dailyTokenBudget} tokens`)
  } else {
    console.warn('Chat disabled — set ANTHROPIC_API_KEY, FIREFLY_URL and FIREFLY_TOKEN to enable it.')
  }
```

Pass `chat: chatRuntime` to `startServer(...)`, and in `shutdown` add `chatRuntime?.close().catch(() => {})` before `stopServer()`.

- [ ] **Step 3: Verify**

Run: `npm test` (all pass — existing suites unaffected; auth-guard/server tests pass no `chat`), then `npm run build:web` (exit 0), then the smoke:

```bash
AUTH_DISABLED=1 BUDGET_XLSX_PATH=/nonexistent.xlsx APP_DATA_DIR="$(mktemp -d)" node out/server/index.js &
sleep 2 && curl -s http://127.0.0.1:3737/api/health && kill %1
```
Expected: boots with `Chat disabled — ...` warning, health OK.

- [ ] **Step 4: Commit**

```bash
git add src/main/server.ts src/server/index.ts
git commit -m "feat: wire chat runtime into server routing and boot"
```

---

### Task 8: Chat UI

**Files:**
- Create: `src/renderer/src/components/ChatTab.tsx`
- Modify: `src/renderer/src/api.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/index.css`

**Interfaces:**
- Consumes: `/api/chat/*` routes (Task 6), `ChatMessage` (Task 1).

- [ ] **Step 1: api.ts additions** (after the auth section):

```ts
// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatBudget { usedToday: number; budget: number }

export async function chatHistory(): Promise<{ messages: import('../../shared/types').ChatMessage[]; budget: ChatBudget }> {
  const r = await fetch('/api/chat/history')
  bounceToLoginOn401(r)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function chatSend(text: string): Promise<{ reply: import('../../shared/types').ChatMessage; usage: ChatBudget & { tokens: number } }> {
  const r = await fetch('/api/chat/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  bounceToLoginOn401(r)
  if (!r.ok) {
    const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
    throw new Error(body.error ?? `HTTP ${r.status}`)
  }
  return r.json()
}

export async function chatClear(): Promise<void> {
  const r = await fetch('/api/chat/clear', { method: 'POST' })
  bounceToLoginOn401(r)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}
```

- [ ] **Step 2: ChatTab component**

Create `src/renderer/src/components/ChatTab.tsx`:

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ChatMessage } from '../../../shared/types'
import { chatHistory, chatSend, chatClear } from '../api'

export function ChatTab(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatHistory()
      .then((h) => setMessages(h.messages))
      .catch(() => setUnavailable(true))
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setError(null)
    setBusy(true)
    setMessages((m) => [...m, { id: -Date.now(), role: 'user', text, createdAt: new Date().toISOString() }])
    try {
      const result = await chatSend(text)
      setMessages((m) => [...m, result.reply])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }, [input, busy])

  const clear = useCallback(async () => {
    await chatClear().catch(() => {})
    setMessages([])
    setError(null)
  }, [])

  if (unavailable) {
    return (
      <div className="chat-tab">
        <div className="chat-banner">Chat isn’t available right now. The dashboard still works normally.</div>
      </div>
    )
  }

  return (
    <div className="chat-tab">
      <div className="chat-messages">
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            Ask about the family finances — “How much did we spend on dining out this month?”,
            “What’s the Red Baron balance?”, “Which bills are due next week?”
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble chat-bubble--${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="chat-bubble chat-bubble--assistant chat-bubble--thinking">Looking that up…</div>}
        {error && <div className="chat-error">{error}</div>}
        <div ref={endRef} />
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          maxLength={2000}
          placeholder="Ask about accounts, spending, budgets…"
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button className="chat-send" disabled={busy || input.trim().length === 0} onClick={() => void send()}>
          Send
        </button>
        <button className="chat-clear" onClick={() => void clear()} title="Clear conversation">
          Clear
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: App.tsx tab wiring**

- Extend the tab type: `type ActiveTab = 'dashboard' | 'budget' | 'log' | 'goals' | 'assets' | 'chat'`
- Import: `import { ChatTab } from './components/ChatTab'`
- Add a tab button labeled `Chat` next to the existing tab buttons (same markup/classes as its siblings).
- Render `{activeTab === 'chat' && <ChatTab />}` alongside the other tab bodies.
- Show the Chat tab button in web mode only (`!window.electronAPI`) — the Electron desktop build has no chat backend.

- [ ] **Step 4: Styles** — append to `src/renderer/src/index.css`:

```css
/* ── Chat tab (Phase 3) ── */
.chat-tab { display: flex; flex-direction: column; height: calc(100vh - 140px); max-width: 860px; margin: 0 auto; }
.chat-messages { flex: 1; overflow-y: auto; padding: 16px 8px; display: flex; flex-direction: column; gap: 10px; }
.chat-empty { color: var(--text-secondary); text-align: center; margin: auto; max-width: 46ch; line-height: 1.6; }
.chat-bubble { max-width: 72%; padding: 10px 14px; border-radius: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.chat-bubble--user { align-self: flex-end; background: var(--accent, #20c8a0); color: #0b1512; border-bottom-right-radius: 4px; }
.chat-bubble--assistant { align-self: flex-start; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--border); color: var(--text-primary); border-bottom-left-radius: 4px; }
.chat-bubble--thinking { color: var(--text-secondary); font-style: italic; }
.chat-error { align-self: center; color: #ff8f6b; font-size: 13px; padding: 4px 10px; }
.chat-banner { margin: 40px auto; color: var(--text-secondary); text-align: center; }
.chat-input-row { display: flex; gap: 8px; padding: 10px 8px 4px; border-top: 1px solid var(--border); }
.chat-input { flex: 1; resize: none; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border); border-radius: 10px; color: var(--text-primary); padding: 10px 12px; font: inherit; }
.chat-input:focus { outline: none; border-color: var(--border-hover); }
.chat-send, .chat-clear { border: 1px solid var(--border); background: none; color: var(--text-primary); border-radius: 10px; padding: 0 16px; cursor: pointer; }
.chat-send:disabled { opacity: 0.4; cursor: default; }
.chat-clear { color: var(--text-secondary); }
```

- [ ] **Step 5: Verify** — `npm run build:web` exit 0; `npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep -i chat` shows no errors in the new files (pre-existing recharts/date errors are out of scope); `npm test` green.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ChatTab.tsx src/renderer/src/api.ts src/renderer/src/App.tsx src/renderer/src/index.css
git commit -m "feat: chat tab UI"
```

---

### Task 9: Docker + compose + runbook

**Files:**
- Modify: `Dockerfile`, `docker-compose.yml`, `.env.example`, `docs/DEPLOY.md`

- [ ] **Step 1: Dockerfile — install the MCP server at /mcp**

In the FINAL stage (after the existing `COPY --from=build` lines), add:

```dockerfile
# Firefly MCP server — separate prod-only install so the esbuild-bundled app
# stays self-contained. Version pinned via the root package.json.
COPY --from=build /app/node_modules/@daften/fireflyiii-mcp /mcp/node_modules/@daften/fireflyiii-mcp
COPY --from=build /app/node_modules/.bin/fireflyiii-mcp /mcp/node_modules/.bin/fireflyiii-mcp
RUN test -e /mcp/node_modules/.bin/fireflyiii-mcp
```

NOTE for the implementer: verify the actual bin name with `node -e "console.log(Object.keys(require('@daften/fireflyiii-mcp/package.json').bin ?? {}))"` — if it differs from `fireflyiii-mcp`, adjust both COPY lines, the `RUN test`, and the compose `FIREFLY_MCP_COMMAND` to match. If the package has runtime dependencies of its own (check its package.json `dependencies`), replace the two COPY lines with a dedicated install: `RUN npm install --prefix /mcp --omit=dev @daften/fireflyiii-mcp@$(node -p "require('/app/package.json').dependencies['@daften/fireflyiii-mcp']")` in the build stage and copy `/mcp` across.

- [ ] **Step 2: docker-compose.yml — budget-app env additions**

```yaml
      # ── Chat (Phase 3) — TEST Firefly only; prod flip needs Eric's approval ──
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      FIREFLY_URL: ${FIREFLY_URL}
      FIREFLY_TOKEN: ${FIREFLY_TOKEN}
      CHAT_MODEL: ${CHAT_MODEL:-claude-haiku-4-5}
      CHAT_DAILY_TOKEN_BUDGET: ${CHAT_DAILY_TOKEN_BUDGET:-250000}
      FIREFLY_MCP_COMMAND: /mcp/node_modules/.bin/fireflyiii-mcp
```

- [ ] **Step 3: .env.example additions**

```bash
# ── Chat (Phase 3) ──
# Anthropic API key (console.anthropic.com) — server-side only, never in the browser
ANTHROPIC_API_KEY=
# TEST Firefly III instance. PROD flip requires explicit approval.
FIREFLY_URL=http://192.168.1.113
# Create a FRESH Personal Access Token in Firefly III (Options → Profile → OAuth)
# used only by this app. Read-only enforcement is layered: MCP_READ_ONLY + the
# app's startup tool allowlist.
FIREFLY_TOKEN=
# claude-haiku-4-5 (default, cheapest) or claude-sonnet-5 (smarter, pricier)
CHAT_MODEL=claude-haiku-4-5
# Per-user daily token cap (input+output). 250000 ≈ well under $1/day/user on Haiku.
CHAT_DAILY_TOKEN_BUDGET=250000
```

- [ ] **Step 4: DEPLOY.md — append Phase 3 section**

```markdown
## Phase 3: Read-only Firefly chat

1. In TEST Firefly III (`http://192.168.1.113`): Options → Profile → OAuth →
   create a new Personal Access Token named `budget-app-chat`. Copy it.
2. On the LXC, add to `.env`: `ANTHROPIC_API_KEY`, `FIREFLY_URL=http://192.168.1.113`,
   `FIREFLY_TOKEN=<the PAT>`. Leave `CHAT_MODEL`/`CHAT_DAILY_TOKEN_BUDGET` at defaults.
3. `git pull && DOCKER_BUILDKIT=0 docker compose up -d --build`
4. `docker logs budget-app` — expect
   `Chat enabled — model claude-haiku-4-5, Firefly http://192.168.1.113, daily budget 250000 tokens`
   then `Firefly MCP connected: N read tools (of M exposed)`.
   If instead you see `REFUSING TO START CHAT`, the read-only layer failed — do NOT
   work around it; report it.
5. Verify in the app (Chat tab):
   - "What asset accounts are there?" → names match Firefly TEST
   - "How much did we spend on Groceries this month?" → plausible number
   - "Create a transaction for $5" → the assistant explains it cannot write
   - Stop the TEST Firefly LXC briefly → chat shows a clear unavailable message,
     dashboard unaffected; start it again → chat heals on the next message.
6. Budget check: `CHAT_DAILY_TOKEN_BUDGET=1000` temporarily, send two messages →
   second one is refused with the budget message; restore the default.

Ops notes:
- Chat is optional: without the three env vars the app boots with chat disabled.
- Every chat message and every Firefly tool call is recorded in the `audit_log`
  table (`/data/app/budget-app.db`) — the admin audit UI arrives in Phase 4.
- Cost lever: `CHAT_MODEL=claude-sonnet-5` for smarter answers at ~3-5× the cost.
```

- [ ] **Step 5: Verify compose + image**

```bash
docker compose --env-file <(printf 'BUDGET_HOST=b.example.com\nPOCKET_ID_HOST=i.example.com\nBASE_DOMAIN=example.com\nACME_EMAIL=e@example.com\nCLOUDFLARE_API_TOKEN=x\nPOCKET_ID_ENCRYPTION_KEY=x\nOIDC_CLIENT_ID=x\nOIDC_CLIENT_SECRET=x\nANTHROPIC_API_KEY=x\nFIREFLY_URL=http://x\nFIREFLY_TOKEN=x\n') config > /dev/null && echo COMPOSE-OK
docker build -t budget-app:phase3 .
docker run --rm budget-app:phase3 test -e /mcp/node_modules/.bin/fireflyiii-mcp && echo MCP-BIN-OK
```

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example docs/DEPLOY.md
git commit -m "feat: ship Firefly MCP server in the image; chat env plumbing and Phase 3 runbook"
```

---

### Task 10: Final verification + PR

- [ ] **Step 1:** `npm test` — all suites pass (expect ~19 files).
- [ ] **Step 2:** `npm run build:web` — exit 0.
- [ ] **Step 3:** Docker build + boot smoke with dummy chat env (MCP spawn will fail against a fake Firefly — the log must show the graceful `Chat MCP connection failed` path, health still OK):

```bash
docker run --rm -d --name p3smoke -e AUTH_DISABLED=1 -e BUDGET_XLSX_PATH=/tmp/none.xlsx \
  -e ANTHROPIC_API_KEY=x -e FIREFLY_URL=http://127.0.0.1:9 -e FIREFLY_TOKEN=x \
  -e FIREFLY_MCP_COMMAND=/mcp/node_modules/.bin/fireflyiii-mcp budget-app:phase3
sleep 5 && docker logs p3smoke && docker exec p3smoke wget -qO- http://127.0.0.1:3737/api/health
docker rm -f p3smoke
```

- [ ] **Step 4:** Push and open the PR:

```bash
git push -u origin feature/phase3-chat
gh pr create --title "Phase 3: Read-only Firefly chat (Claude + MCP, audited, budgeted)" --body "..."
```

PR body: what's new, the read-only enforcement layers (PAT scope → MCP_READ_ONLY → startup allowlist → call-time re-check), UAT checklist mirroring DEPLOY.md §5-6, note that merge waits for Eric. Do NOT merge.

---

## Deferred to UAT (live Pocket ID / Firefly / LXC required)

- Real MCP handshake against TEST Firefly: actual tool count, bin name, spawn env.
- Real Claude answers on real data; Haiku answer quality (Sonnet toggle if weak).
- Prompt-cache effectiveness (`usage.cache_read_input_tokens` in logs — optional check).
- Red-team pass (spec phase 5): prompt-injection attempts to elicit writes — structurally impossible; verify the refusal-to-boot assertion by temporarily unsetting MCP_READ_ONLY in a scratch container.
