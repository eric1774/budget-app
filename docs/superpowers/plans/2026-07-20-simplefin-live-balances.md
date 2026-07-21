# SimpleFIN Live Balances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Navy Federal and Fidelity balances appear live on the Asset Page, synced from SimpleFIN Bridge twice daily plus on demand, feeding the account cards, detail views, and both Net Worth charts.

**Architecture:** A server-side SimpleFIN client + sync engine (plain Node modules alongside the existing `assets-store.ts` pattern) persists a credential-bearing access URL in `APP_DATA_DIR/simplefin.json`, writes synced balances + daily snapshots onto linked `AssetAccount`s in `assets.json`, and exposes REST endpoints gated by a new admin check. The renderer gains a "Sync now" button, an admin-only management modal (connect + map accounts), live badges on cards, and snapshot-aware net worth charts.

**Tech Stack:** TypeScript, Node http server (no framework), vitest, React 18 + recharts, existing glass-card design system. **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-20-simplefin-live-balances-design.md` — read it before starting.

## Global Constraints

- **UI tasks (7, 8, 9, 10) MUST invoke the `gpt-taste` skill before writing/styling JSX** — structure below is functional baseline; visual polish follows gpt-taste. Keep class names and behavior from this plan.
- The SimpleFIN **access URL never reaches the browser** — no API response may include it.
- A failed sync **never wipes or zeroes** a stored balance ("never lie, never zero").
- Manual sync cooldown: **15 minutes**. Scheduled slots: **6am and 6pm local time** (container TZ is America/Chicago).
- Snapshots: **one per calendar day per account**, later syncs overwrite that day's entry.
- Admin-only: claim/disconnect/map/unlink. Any signed-in user: status + manual sync. When auth is disabled (Electron/local dev), admin checks pass.
- Currency formatting: match existing `en-CA`/CAD formatters (repo convention — do not switch to USD).
- Node's `fetch` (undici) **throws on URLs with embedded credentials** — always convert the access URL via `splitAccessUrl()` (Task 2), never fetch it directly.
- Run tests with `npx vitest run <file>` from repo root. Commit style: `feat(simplefin): …`, `test(simplefin): …`.
- Branch: `feature/plaid-assets`. Frequent small commits.

---

### Task 1: Shared types + simplefin-store (simplefin.json persistence)

**Files:**
- Modify: `src/shared/types.ts` (append after the Goals section, before Auth)
- Create: `src/main/simplefin-store.ts`
- Test: `tests/simplefin-store.test.ts`

**Interfaces:**
- Consumes: `getDataDir()` from `src/main/data-dir.ts`
- Produces: types `BalanceSnapshot`, `SimplefinLink`, `DiscoveredAccount`, `SimplefinData`, `SimplefinStatus`, `SimplefinMapAction`; new optional fields on `AssetAccount` (`simplefin`, `syncedBalance`, `snapshots`, `needsAttention`); store functions `getSimplefinData(): SimplefinData`, `updateSimplefinData(patch: Partial<SimplefinData>): SimplefinData`, `appendRawSync(raw: unknown): void`

- [ ] **Step 1: Add types to `src/shared/types.ts`**

Append this block after the Goals section:

```ts
// ── SimpleFIN (live balances) ────────────────────────────────────────────────

export interface BalanceSnapshot {
  date: string      // ISO "YYYY-MM-DD" local date — one per day, later syncs overwrite
  balance: number
}

export interface SimplefinLink {
  accountId: string   // SimpleFIN's opaque stable account id
  org: string         // institution display name, e.g. "Navy Federal Credit Union"
}

export interface DiscoveredAccount {
  id: string
  org: string
  name: string
  balance: number
  balanceDate: string   // ISO datetime
}

// Root structure written to simplefin.json — server-side only.
// accessUrl is the credential; it must NEVER be sent to the client.
export interface SimplefinData {
  accessUrl: string | null
  connectedAt: string | null
  lastSyncAt: string | null          // last successful sync, ISO datetime
  lastSyncError: string | null
  lastScheduledSlot: string | null   // e.g. "2026-07-20-am"
  errors: string[]                   // latest errors[] from the bridge
  ignoredAccountIds: string[]
  discovered: DiscoveredAccount[]
}

export type SimplefinMapState = 'linked' | 'ignored' | 'new'

// Client-facing status DTO (no accessUrl!)
export interface SimplefinStatus {
  connected: boolean
  lastSyncAt: string | null
  lastSyncError: string | null
  errors: string[]
  isAdmin: boolean
  discovered: (DiscoveredAccount & { state: SimplefinMapState; linkedAccountId?: string })[]
}

export type SimplefinMapAction =
  | { simplefinAccountId: string; action: 'attach'; accountId: string }
  | { simplefinAccountId: string; action: 'create'; name: string; type: AccountType }
  | { simplefinAccountId: string; action: 'ignore' }
```

And add these optional fields to the existing `AssetAccount` interface (after `syncedWithDashboard`):

```ts
  simplefin?: SimplefinLink      // present = balance is sourced from SimpleFIN
  syncedBalance?: number         // last synced balance (source of truth when linked)
  snapshots?: BalanceSnapshot[]  // daily balance history, accrues from link date
  needsAttention?: boolean       // institution connection broken at the bridge
```

- [ ] **Step 2: Write the failing test `tests/simplefin-store.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import { getSimplefinData, updateSimplefinData, appendRawSync } from '../src/main/simplefin-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sf-store-test-'))
  initDataDir(dir)
})

describe('simplefin-store', () => {
  it('returns empty defaults when simplefin.json does not exist', () => {
    const data = getSimplefinData()
    expect(data.accessUrl).toBeNull()
    expect(data.discovered).toEqual([])
    expect(data.ignoredAccountIds).toEqual([])
  })

  it('persists a partial update and merges with existing data', () => {
    updateSimplefinData({ accessUrl: 'https://u:p@bridge.example/simplefin', connectedAt: '2026-07-20T12:00:00Z' })
    updateSimplefinData({ lastSyncAt: '2026-07-20T13:00:00Z' })
    const data = getSimplefinData()
    expect(data.accessUrl).toBe('https://u:p@bridge.example/simplefin')
    expect(data.lastSyncAt).toBe('2026-07-20T13:00:00Z')
  })

  it('appends raw sync responses as JSONL lines', () => {
    appendRawSync({ errors: [], accounts: [{ id: 'a1' }] })
    appendRawSync({ errors: [], accounts: [{ id: 'a2' }] })
    const raw = readFileSync(join(dir, 'simplefin-raw.jsonl'), 'utf-8').trim().split('\n')
    expect(raw).toHaveLength(2)
    expect(JSON.parse(raw[1]).accounts[0].id).toBe('a2')
  })

  it('recovers from a corrupt simplefin.json with defaults', () => {
    updateSimplefinData({ connectedAt: 'x' })
    const path = join(dir, 'simplefin.json')
    expect(existsSync(path)).toBe(true)
    writeFileSync(path, '{not json', 'utf-8')
    expect(getSimplefinData().accessUrl).toBeNull()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/simplefin-store.test.ts`
Expected: FAIL — cannot resolve `../src/main/simplefin-store`

- [ ] **Step 4: Implement `src/main/simplefin-store.ts`**

```ts
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs'
import { getDataDir } from './data-dir'
import type { SimplefinData } from '../shared/types'

function simplefinPath(): string {
  return join(getDataDir(), 'simplefin.json')
}

function rawLogPath(): string {
  return join(getDataDir(), 'simplefin-raw.jsonl')
}

const DEFAULTS: SimplefinData = {
  accessUrl: null,
  connectedAt: null,
  lastSyncAt: null,
  lastSyncError: null,
  lastScheduledSlot: null,
  errors: [],
  ignoredAccountIds: [],
  discovered: [],
}

export function getSimplefinData(): SimplefinData {
  if (!existsSync(simplefinPath())) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(simplefinPath(), 'utf-8')) as Partial<SimplefinData>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function updateSimplefinData(patch: Partial<SimplefinData>): SimplefinData {
  const next = { ...getSimplefinData(), ...patch }
  mkdirSync(getDataDir(), { recursive: true })
  writeFileSync(simplefinPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

// Raw bridge responses are kept append-only so a future transactions feature
// can backfill from history (spec §2). Twice-daily syncs ≈ 730 lines/year.
export function appendRawSync(raw: unknown): void {
  mkdirSync(getDataDir(), { recursive: true })
  appendFileSync(rawLogPath(), JSON.stringify({ at: new Date().toISOString(), raw }) + '\n', 'utf-8')
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/simplefin-store.test.ts`
Expected: 4 passed

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.node.json` — expect no errors.

```bash
git add src/shared/types.ts src/main/simplefin-store.ts tests/simplefin-store.test.ts
git commit -m "feat(simplefin): shared types + simplefin.json store"
```

---

### Task 2: SimpleFIN protocol client (claim + fetch accounts)

**Files:**
- Create: `src/main/simplefin-client.ts`
- Test: `tests/simplefin-client.test.ts`

**Interfaces:**
- Produces: `claimSetupToken(setupToken: string, fetchImpl?: FetchLike): Promise<string>` (returns access URL), `splitAccessUrl(accessUrl: string): { url: string; auth: string }`, `fetchAccounts(accessUrl: string, startDate: Date, fetchImpl?: FetchLike): Promise<SfResponse>`, types `SfAccount`, `SfResponse`, `FetchLike`

**Protocol notes (from the SimpleFIN spec):** the setup token is the base64 of a claim URL; `POST` to the claim URL returns the access URL as plain text. The access URL has Basic credentials embedded (`https://user:pass@…/simplefin`). `GET {accessUrl}/accounts?start-date=<unix-seconds>` returns `{ "errors": string[], "accounts": [{ "id", "name", "balance": "1234.56", "balance-date": <unix>, "org": { "name"?, "domain"? }, "transactions": [...] }] }`.

- [ ] **Step 1: Write the failing test `tests/simplefin-client.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { claimSetupToken, splitAccessUrl, fetchAccounts, type FetchLike } from '../src/main/simplefin-client'

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; body: string }): FetchLike {
  return async (url, init) => {
    const r = handler(url, init)
    return new Response(r.body, { status: r.status })
  }
}

describe('claimSetupToken', () => {
  it('decodes the token, POSTs the claim URL, and returns the access URL', async () => {
    const claimUrl = 'https://bridge.example/simplefin/claim/DEMO'
    const token = Buffer.from(claimUrl).toString('base64')
    const calls: { url: string; method?: string }[] = []
    const f = stubFetch((url, init) => {
      calls.push({ url, method: init?.method })
      return { status: 200, body: 'https://user:pass@bridge.example/simplefin' }
    })
    const accessUrl = await claimSetupToken(token, f)
    expect(calls).toEqual([{ url: claimUrl, method: 'POST' }])
    expect(accessUrl).toBe('https://user:pass@bridge.example/simplefin')
  })

  it('rejects garbage tokens', async () => {
    await expect(claimSetupToken('!!!not-base64-url!!!', stubFetch(() => ({ status: 200, body: '' }))))
      .rejects.toThrow(/invalid setup token/i)
  })

  it('rejects when the bridge answers non-200', async () => {
    const token = Buffer.from('https://bridge.example/claim/X').toString('base64')
    await expect(claimSetupToken(token, stubFetch(() => ({ status: 403, body: 'nope' }))))
      .rejects.toThrow(/403/)
  })
})

describe('splitAccessUrl', () => {
  it('strips credentials into a Basic auth header', () => {
    const { url, auth } = splitAccessUrl('https://alice:s3cret@bridge.example/simplefin')
    expect(url).toBe('https://bridge.example/simplefin')
    expect(auth).toBe('Basic ' + Buffer.from('alice:s3cret').toString('base64'))
  })
})

describe('fetchAccounts', () => {
  const sfBody = JSON.stringify({
    errors: [],
    accounts: [{ id: 'ACT-1', name: 'Share Savings', balance: '5000.10', 'balance-date': 1752987600, org: { name: 'Navy Federal Credit Union' }, transactions: [] }],
  })

  it('GETs /accounts with start-date and auth header (no creds in URL)', async () => {
    const calls: { url: string; auth?: string }[] = []
    const f = stubFetch((url, init) => {
      calls.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization })
      return { status: 200, body: sfBody }
    })
    const res = await fetchAccounts('https://u:p@bridge.example/simplefin', new Date(1752900000 * 1000), f)
    expect(calls[0].url).toBe('https://bridge.example/simplefin/accounts?start-date=1752900000')
    expect(calls[0].auth).toBe('Basic ' + Buffer.from('u:p').toString('base64'))
    expect(res.accounts[0].id).toBe('ACT-1')
  })

  it('throws a reconnect-worded error on 403 (credential revoked)', async () => {
    await expect(fetchAccounts('https://u:p@b.example/simplefin', new Date(), stubFetch(() => ({ status: 403, body: '' }))))
      .rejects.toThrow(/revoked|reconnect/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/simplefin-client.test.ts`
Expected: FAIL — cannot resolve `../src/main/simplefin-client`

- [ ] **Step 3: Implement `src/main/simplefin-client.ts`**

```ts
// Minimal SimpleFIN protocol client. https://www.simplefin.org/protocol.html
// Setup token = base64(claim URL); POST claim URL → access URL (plain text).
// Access URL embeds Basic credentials, which Node's fetch (undici) refuses in
// a URL — splitAccessUrl converts them to an Authorization header.

export interface SfAccount {
  id: string
  name: string
  balance: string            // decimal string per spec
  'balance-date': number     // unix seconds
  org: { name?: string; domain?: string }
  transactions?: unknown[]
}

export interface SfResponse {
  errors: string[]
  accounts: SfAccount[]
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export async function claimSetupToken(setupToken: string, fetchImpl: FetchLike = fetch): Promise<string> {
  let claimUrl: string
  try {
    claimUrl = Buffer.from(setupToken.trim(), 'base64').toString('utf-8')
  } catch {
    throw new Error('Invalid setup token')
  }
  if (!/^https:\/\/\S+$/.test(claimUrl)) throw new Error('Invalid setup token')
  const res = await fetchImpl(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' } })
  if (!res.ok) throw new Error(`Claim failed: HTTP ${res.status}`)
  const accessUrl = (await res.text()).trim()
  if (!/^https:\/\/\S+$/.test(accessUrl)) throw new Error('Bridge returned an invalid access URL')
  return accessUrl
}

export function splitAccessUrl(accessUrl: string): { url: string; auth: string } {
  const u = new URL(accessUrl)
  const auth = 'Basic ' + Buffer.from(
    `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
  ).toString('base64')
  u.username = ''
  u.password = ''
  return { url: u.toString().replace(/\/$/, ''), auth }
}

export async function fetchAccounts(accessUrl: string, startDate: Date, fetchImpl: FetchLike = fetch): Promise<SfResponse> {
  const { url, auth } = splitAccessUrl(accessUrl)
  const startTs = Math.floor(startDate.getTime() / 1000)
  const res = await fetchImpl(`${url}/accounts?start-date=${startTs}`, { headers: { Authorization: auth } })
  if (res.status === 403) throw new Error('Access revoked — reconnect from the Linked Accounts panel')
  if (!res.ok) throw new Error(`SimpleFIN request failed: HTTP ${res.status}`)
  return (await res.json()) as SfResponse
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/simplefin-client.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add src/main/simplefin-client.ts tests/simplefin-client.test.ts
git commit -m "feat(simplefin): protocol client (claim + fetch accounts)"
```

---

### Task 3: assets-store — linked-account balance model

**Files:**
- Modify: `src/main/assets-store.ts`
- Test: `tests/assets-store-simplefin.test.ts`

**Interfaces:**
- Consumes: types from Task 1
- Produces: changed `accountBalance(account)` (synced short-circuit); changed `addTransaction` (returns `null` for linked accounts); new exports `linkSimplefin(accountId: string, link: SimplefinLink): AssetAccount | null`, `createLinkedAccount(name: string, type: AccountType, link: SimplefinLink): AssetAccount`, `unlinkSimplefin(accountId: string): AssetAccount | null`, `applySyncedBalance(simplefinAccountId: string, balance: number, snapshotDate: string, needsAttention: boolean): AssetAccount | null`

- [ ] **Step 1: Write the failing test `tests/assets-store-simplefin.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import {
  getAccounts, addAccount, addTransaction, accountBalance,
  linkSimplefin, createLinkedAccount, unlinkSimplefin, applySyncedBalance,
} from '../src/main/assets-store'

beforeEach(() => {
  initDataDir(mkdtempSync(join(tmpdir(), 'sf-assets-test-')))
})

const LINK = { accountId: 'SF-1', org: 'Navy Federal Credit Union' }

describe('linked accounts', () => {
  it('linkSimplefin attaches a link and preserves existing transactions', () => {
    const acct = addAccount('NFCU Savings', 'Savings')
    addTransaction(acct.id, 'deposit', 100, '2026-01-05')
    const linked = linkSimplefin(acct.id, LINK)!
    expect(linked.simplefin).toEqual(LINK)
    expect(linked.transactions).toHaveLength(1)
  })

  it('accountBalance uses syncedBalance for linked accounts, transactions otherwise', () => {
    const acct = addAccount('NFCU Savings', 'Savings')
    addTransaction(acct.id, 'deposit', 100, '2026-01-05')
    linkSimplefin(acct.id, LINK)
    applySyncedBalance('SF-1', 5432.10, '2026-07-20', false)
    const fresh = getAccounts().find(a => a.id === acct.id)!
    expect(accountBalance(fresh)).toBe(5432.10)   // not 100
    unlinkSimplefin(acct.id)
    const reverted = getAccounts().find(a => a.id === acct.id)!
    expect(accountBalance(reverted)).toBe(100)    // frozen ledger takes over again
  })

  it('addTransaction is rejected on linked accounts (frozen ledger)', () => {
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, LINK)
    expect(addTransaction(acct.id, 'deposit', 50, '2026-07-20')).toBeNull()
  })

  it('applySyncedBalance upserts one snapshot per day and sets needsAttention', () => {
    const acct = createLinkedAccount('Fidelity Brokerage', 'Investing', { accountId: 'SF-2', org: 'Fidelity Investments' })
    applySyncedBalance('SF-2', 100, '2026-07-20', false)
    applySyncedBalance('SF-2', 150, '2026-07-20', true)   // same day → overwrite
    applySyncedBalance('SF-2', 200, '2026-07-21', false)
    const fresh = getAccounts().find(a => a.id === acct.id)!
    expect(fresh.snapshots).toEqual([
      { date: '2026-07-20', balance: 150 },
      { date: '2026-07-21', balance: 200 },
    ])
    expect(fresh.syncedBalance).toBe(200)
    expect(fresh.needsAttention).toBe(false)
  })

  it('applySyncedBalance returns null for unknown simplefin ids', () => {
    expect(applySyncedBalance('SF-nope', 1, '2026-07-20', false)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/assets-store-simplefin.test.ts`
Expected: FAIL — `linkSimplefin` is not exported

- [ ] **Step 3: Implement in `src/main/assets-store.ts`**

Change `accountBalance` (keep the existing comment style):

```ts
// Running sum of all transactions: deposits add, withdrawals subtract.
// Linked accounts short-circuit to the last synced balance — their manual
// ledger is frozen (spec §6: keep, but stop driving the balance).
function accountBalance(account: AssetAccount): number {
  if (account.simplefin && account.syncedBalance !== undefined) return account.syncedBalance
  return account.transactions.reduce((sum, t) => {
    return t.type === 'deposit' ? sum + t.amount : sum - t.amount
  }, 0)
}
```

Guard the top of `addTransaction` (after the `find`):

```ts
  const account = data.accounts.find(a => a.id === accountId)
  if (!account) return null
  if (account.simplefin) return null   // linked accounts have a frozen ledger
```

Append new functions before the final export line (import `SimplefinLink` in the types import at the top):

```ts
// ── SimpleFIN links ──────────────────────────────────────────────────────────

export function linkSimplefin(accountId: string, link: SimplefinLink): AssetAccount | null {
  const data = readAssets()
  const account = data.accounts.find(a => a.id === accountId)
  if (!account) return null
  account.simplefin = link
  writeAssets(data)
  return account
}

export function createLinkedAccount(name: string, type: AccountType, link: SimplefinLink): AssetAccount {
  const data = readAssets()
  const account: AssetAccount = {
    id: randomUUID(),
    name: name.trim(),
    type,
    transactions: [],
    createdAt: new Date().toISOString(),
    simplefin: link,
  }
  data.accounts.push(account)
  writeAssets(data)
  return account
}

// Unlink reverts to the transaction-derived balance; synced state is cleared
// but snapshots are kept as historical record (nothing is ever deleted).
export function unlinkSimplefin(accountId: string): AssetAccount | null {
  const data = readAssets()
  const account = data.accounts.find(a => a.id === accountId)
  if (!account) return null
  delete account.simplefin
  delete account.syncedBalance
  delete account.needsAttention
  writeAssets(data)
  return account
}

export function applySyncedBalance(
  simplefinAccountId: string,
  balance: number,
  snapshotDate: string,
  needsAttention: boolean
): AssetAccount | null {
  const data = readAssets()
  const account = data.accounts.find(a => a.simplefin?.accountId === simplefinAccountId)
  if (!account) return null
  account.syncedBalance = balance
  account.needsAttention = needsAttention
  const snapshots = account.snapshots ?? []
  const existing = snapshots.find(s => s.date === snapshotDate)
  if (existing) existing.balance = balance
  else snapshots.push({ date: snapshotDate, balance })
  snapshots.sort((a, b) => a.date.localeCompare(b.date))
  account.snapshots = snapshots
  writeAssets(data)
  return account
}
```

- [ ] **Step 4: Run tests — new file and the full suite (regression)**

Run: `npx vitest run`
Expected: all pass (existing assets/goals/mortgage/auth tests unaffected)

- [ ] **Step 5: Commit**

```bash
git add src/main/assets-store.ts tests/assets-store-simplefin.test.ts
git commit -m "feat(simplefin): linked-account balance model in assets-store"
```

---

### Task 4: Sync engine + scheduler

**Files:**
- Create: `src/main/simplefin-sync.ts`
- Test: `tests/simplefin-sync.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`getSimplefinData`, `updateSimplefinData`, `appendRawSync`, `fetchAccounts`, `claimSetupToken`, `applySyncedBalance`, `getAccounts`), `FetchLike`
- Produces: `runSync(opts: { manual: boolean; fetchImpl?: FetchLike; now?: Date }): Promise<SyncResult>` where `SyncResult = { ok: true } | { ok: false; reason: 'not-connected' | 'cooldown' | 'error'; message: string }`; `dueSlot(now: Date, lastFiredSlot: string | null): string | null`; `startSyncScheduler(): void`; `stopSyncScheduler(): void`; `buildStatus(isAdmin: boolean): SimplefinStatus`; `MANUAL_COOLDOWN_MS`

- [ ] **Step 1: Write the failing test `tests/simplefin-sync.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import { updateSimplefinData, getSimplefinData } from '../src/main/simplefin-store'
import { addAccount, linkSimplefin, getAccounts } from '../src/main/assets-store'
import { runSync, dueSlot, buildStatus, MANUAL_COOLDOWN_MS } from '../src/main/simplefin-sync'
import type { FetchLike } from '../src/main/simplefin-client'

beforeEach(() => {
  initDataDir(mkdtempSync(join(tmpdir(), 'sf-sync-test-')))
})

const ACCESS = 'https://u:p@bridge.example/simplefin'

function bridgeStub(body: unknown, status = 200): FetchLike {
  return async () => new Response(JSON.stringify(body), { status })
}

const NFCU = { id: 'SF-1', name: 'Share Savings', balance: '5000.10', 'balance-date': 1752987600, org: { name: 'Navy Federal Credit Union' }, transactions: [] }
const FIDO = { id: 'SF-2', name: 'Brokerage', balance: '82000.00', 'balance-date': 1752987600, org: { name: 'Fidelity Investments' }, transactions: [] }

describe('runSync', () => {
  it('refuses when not connected', async () => {
    const r = await runSync({ manual: true })
    expect(r).toMatchObject({ ok: false, reason: 'not-connected' })
  })

  it('updates linked accounts, discovered list, and lastSyncAt on success', async () => {
    updateSimplefinData({ accessUrl: ACCESS, connectedAt: '2026-07-19T00:00:00Z' })
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, { accountId: 'SF-1', org: 'Navy Federal Credit Union' })
    const r = await runSync({ manual: true, fetchImpl: bridgeStub({ errors: [], accounts: [NFCU, FIDO] }) })
    expect(r.ok).toBe(true)
    const fresh = getAccounts().find(a => a.id === acct.id)!
    expect(fresh.syncedBalance).toBe(5000.10)
    expect(fresh.snapshots).toHaveLength(1)
    const data = getSimplefinData()
    expect(data.lastSyncAt).not.toBeNull()
    expect(data.discovered.map(d => d.id).sort()).toEqual(['SF-1', 'SF-2'])
  })

  it('enforces the manual cooldown but not for scheduled syncs', async () => {
    updateSimplefinData({ accessUrl: ACCESS, lastSyncAt: new Date(Date.now() - MANUAL_COOLDOWN_MS / 2).toISOString() })
    const manual = await runSync({ manual: true, fetchImpl: bridgeStub({ errors: [], accounts: [] }) })
    expect(manual).toMatchObject({ ok: false, reason: 'cooldown' })
    const scheduled = await runSync({ manual: false, fetchImpl: bridgeStub({ errors: [], accounts: [] }) })
    expect(scheduled.ok).toBe(true)
  })

  it('never zeroes balances on failure: records lastSyncError, keeps account state', async () => {
    updateSimplefinData({ accessUrl: ACCESS })
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, { accountId: 'SF-1', org: 'Navy Federal Credit Union' })
    await runSync({ manual: true, fetchImpl: bridgeStub({ errors: [], accounts: [NFCU] }) })
    const failed = await runSync({ manual: false, fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
    expect(failed).toMatchObject({ ok: false, reason: 'error' })
    const fresh = getAccounts().find(a => a.id === acct.id)!
    expect(fresh.syncedBalance).toBe(5000.10)                 // untouched
    expect(getSimplefinData().lastSyncError).toMatch(/ECONNREFUSED/)
  })

  it('flags needsAttention from bridge errors mentioning the org', async () => {
    updateSimplefinData({ accessUrl: ACCESS })
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, { accountId: 'SF-1', org: 'Navy Federal Credit Union' })
    await runSync({ manual: true, fetchImpl: bridgeStub({ errors: ['Connection to Navy Federal Credit Union may need attention'], accounts: [NFCU] }) })
    expect(getAccounts().find(a => a.id === acct.id)!.needsAttention).toBe(true)
  })
})

describe('dueSlot', () => {
  it('is null before 6am, "am" slot 6am–5:59pm, "pm" slot after 6pm', () => {
    expect(dueSlot(new Date('2026-07-20T05:59:00'), null)).toBeNull()
    expect(dueSlot(new Date('2026-07-20T06:00:00'), null)).toBe('2026-07-20-am')
    expect(dueSlot(new Date('2026-07-20T17:59:00'), null)).toBe('2026-07-20-am')
    expect(dueSlot(new Date('2026-07-20T18:00:00'), null)).toBe('2026-07-20-pm')
  })

  it('does not re-fire an already-fired slot', () => {
    expect(dueSlot(new Date('2026-07-20T07:00:00'), '2026-07-20-am')).toBeNull()
    expect(dueSlot(new Date('2026-07-20T19:00:00'), '2026-07-20-am')).toBe('2026-07-20-pm')
  })
})

describe('buildStatus', () => {
  it('classifies discovered accounts and never leaks the access URL', async () => {
    updateSimplefinData({ accessUrl: ACCESS, ignoredAccountIds: ['SF-2'] })
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, { accountId: 'SF-1', org: 'Navy Federal Credit Union' })
    await runSync({ manual: true, fetchImpl: bridgeStub({ errors: [], accounts: [NFCU, FIDO, { ...NFCU, id: 'SF-3', name: 'Checking' }] }) })
    const status = buildStatus(true)
    expect(JSON.stringify(status)).not.toContain('u:p')
    const byId = Object.fromEntries(status.discovered.map(d => [d.id, d]))
    expect(byId['SF-1'].state).toBe('linked')
    expect(byId['SF-1'].linkedAccountId).toBe(acct.id)
    expect(byId['SF-2'].state).toBe('ignored')
    expect(byId['SF-3'].state).toBe('new')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/simplefin-sync.test.ts`
Expected: FAIL — cannot resolve `../src/main/simplefin-sync`

- [ ] **Step 3: Implement `src/main/simplefin-sync.ts`**

```ts
import { fetchAccounts, type FetchLike, type SfResponse } from './simplefin-client'
import { getSimplefinData, updateSimplefinData, appendRawSync } from './simplefin-store'
import { getAccounts, applySyncedBalance } from './assets-store'
import type { DiscoveredAccount, SimplefinStatus } from '../shared/types'

export const MANUAL_COOLDOWN_MS = 15 * 60 * 1000

export type SyncResult =
  | { ok: true }
  | { ok: false; reason: 'not-connected' | 'cooldown' | 'error'; message: string }

// Local calendar date (container TZ is America/Chicago); en-CA gives YYYY-MM-DD.
function localDate(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

export async function runSync(opts: { manual: boolean; fetchImpl?: FetchLike; now?: Date }): Promise<SyncResult> {
  const data = getSimplefinData()
  if (!data.accessUrl) return { ok: false, reason: 'not-connected', message: 'SimpleFIN is not connected' }

  const now = opts.now ?? new Date()
  if (opts.manual && data.lastSyncAt && now.getTime() - Date.parse(data.lastSyncAt) < MANUAL_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown', message: 'Synced recently — try again in a few minutes' }
  }

  // start-date: 7 days before last sync (overlap is fine, raw log is append-only);
  // first sync reaches back 30 days.
  const since = data.lastSyncAt
    ? new Date(Date.parse(data.lastSyncAt) - 7 * 24 * 3600 * 1000)
    : new Date(now.getTime() - 30 * 24 * 3600 * 1000)

  let response: SfResponse
  try {
    response = await fetchAccounts(data.accessUrl, since, opts.fetchImpl)
  } catch (err) {
    // Never lie, never zero: leave every stored balance untouched on failure.
    updateSimplefinData({ lastSyncError: err instanceof Error ? err.message : String(err) })
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
  }

  appendRawSync(response)

  const discovered: DiscoveredAccount[] = response.accounts.map((a) => ({
    id: a.id,
    org: a.org?.name ?? a.org?.domain ?? 'Unknown institution',
    name: a.name,
    balance: Number.parseFloat(a.balance),
    balanceDate: new Date(a['balance-date'] * 1000).toISOString(),
  }))

  const snapshotDate = localDate(now)
  for (const remote of discovered) {
    const broken = response.errors.some((e) => e.includes(remote.org))
    applySyncedBalance(remote.id, remote.balance, snapshotDate, broken)
  }

  updateSimplefinData({
    lastSyncAt: now.toISOString(),
    lastSyncError: null,
    errors: response.errors,
    discovered,
  })
  return { ok: true }
}

// ── Scheduler: fire once per 6am/18pm local slot ─────────────────────────────

export function dueSlot(now: Date, lastFiredSlot: string | null): string | null {
  const h = now.getHours()
  const slot = h >= 18 ? 'pm' : h >= 6 ? 'am' : null
  if (!slot) return null
  const key = `${localDateKey(now)}-${slot}`
  return key === lastFiredSlot ? null : key
}

function localDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null

export function startSyncScheduler(): void {
  if (schedulerTimer) return
  const tick = async (): Promise<void> => {
    const data = getSimplefinData()
    if (!data.accessUrl) return
    const slot = dueSlot(new Date(), data.lastScheduledSlot)
    if (!slot) return
    updateSimplefinData({ lastScheduledSlot: slot })   // claim the slot before the await
    const result = await runSync({ manual: false })
    console.log(result.ok ? `SimpleFIN scheduled sync ok (${slot})` : `SimpleFIN scheduled sync failed: ${result.message}`)
  }
  schedulerTimer = setInterval(() => { void tick() }, 60_000)
  schedulerTimer.unref()
  void tick()   // catch up immediately on boot
}

export function stopSyncScheduler(): void {
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null }
}

// ── Client-facing status (never includes accessUrl) ──────────────────────────

export function buildStatus(isAdmin: boolean): SimplefinStatus {
  const data = getSimplefinData()
  const accounts = getAccounts()
  const linkByRemoteId = new Map(
    accounts.filter((a) => a.simplefin).map((a) => [a.simplefin!.accountId, a.id])
  )
  return {
    connected: data.accessUrl !== null,
    lastSyncAt: data.lastSyncAt,
    lastSyncError: data.lastSyncError,
    errors: data.errors,
    isAdmin,
    discovered: data.discovered.map((d) => {
      const linkedAccountId = linkByRemoteId.get(d.id)
      return {
        ...d,
        state: linkedAccountId ? 'linked' as const : data.ignoredAccountIds.includes(d.id) ? 'ignored' as const : 'new' as const,
        ...(linkedAccountId ? { linkedAccountId } : {}),
      }
    }),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/simplefin-sync.test.ts`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add src/main/simplefin-sync.ts tests/simplefin-sync.test.ts
git commit -m "feat(simplefin): sync engine, twice-daily scheduler, status builder"
```

---

### Task 5: REST endpoints + admin guard + scheduler wiring

**Files:**
- Modify: `src/main/server.ts` (new routes after the Assets REST block, ~line 302)
- Modify: `src/server/index.ts` (start scheduler)
- Test: `tests/simplefin-routes.test.ts`

**Interfaces:**
- Consumes: Task 4 (`runSync`, `buildStatus`), Task 3 (`linkSimplefin`, `createLinkedAccount`, `unlinkSimplefin`), Task 2 (`claimSetupToken`), Task 1 (`getSimplefinData`, `updateSimplefinData`), `SimplefinMapAction`
- Produces routes:
  - `GET  /api/simplefin/status` → `SimplefinStatus` (any signed-in user)
  - `POST /api/simplefin/claim` `{setupToken}` → claims, saves, runs first sync, returns `SimplefinStatus` (admin)
  - `POST /api/simplefin/sync` → `202 {ok:true}` / `429 {error}` on cooldown / `502 {error}` on bridge failure (any user)
  - `POST /api/simplefin/map` `SimplefinMapAction` body → `SimplefinStatus` (admin)
  - `POST /api/simplefin/unlink` `{accountId}` → `SimplefinStatus` (admin)
  - `DELETE /api/simplefin` → disconnect, returns `SimplefinStatus` (admin)

- [ ] **Step 1: Write the failing test `tests/simplefin-routes.test.ts`**

Follows the `tests/auth-guard.test.ts` fixture pattern exactly (stub OIDC flow, real server):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, closeDb } from '../src/server/db'
import { initAuth, type OidcFlow } from '../src/server/auth/runtime'
import { createSession } from '../src/server/auth/session-store'
import { startServer, stopServer } from '../src/main/server'
import { initDataDir } from '../src/main/data-dir'
import { updateSimplefinData } from '../src/main/simplefin-store'
import { addAccount } from '../src/main/assets-store'
import type { AuthEnvConfig } from '../src/server/config'

const env: AuthEnvConfig = {
  appBaseUrl: 'https://budget.home.arpa',
  issuer: 'https://id.home.arpa',
  clientId: 'c',
  clientSecret: 's',
  adminGroup: 'budget-admin',
  sessionTtlHours: 12,
}
const stubFlow: OidcFlow = {
  beginLogin: async () => ({ url: 'https://id.home.arpa/authorize', loginId: 'l' }),
  completeLogin: async () => ({ sub: 'u1', name: 'Eric', email: 'e@x.com', role: 'admin' }),
}

let base: string
let adminCookie: string
let memberCookie: string

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-routes-test-'))
  initDataDir(dir)
  openDb(dir)
  writeFileSync(join(dir, 'index.html'), '<html><body>app</body></html>')
  const info = await startServer({ rendererRoot: dir, preferredPort: 4211, auth: initAuth(env, stubFlow) })
  base = `http://127.0.0.1:${info.port}`
  adminCookie = `budget_session=${createSession({ sub: 'a', name: 'Admin', email: 'a@x.com', role: 'admin' }, 12).id}`
  memberCookie = `budget_session=${createSession({ sub: 'm', name: 'Member', email: 'm@x.com', role: 'member' }, 12).id}`
})

afterAll(async () => {
  await stopServer()
  closeDb()
})

describe('simplefin routes', () => {
  it('status: any signed-in user; reports isAdmin correctly; no accessUrl leak', async () => {
    updateSimplefinData({ accessUrl: 'https://u:p@bridge.example/simplefin' })
    const admin = await (await fetch(`${base}/api/simplefin/status`, { headers: { cookie: adminCookie } })).json()
    const member = await (await fetch(`${base}/api/simplefin/status`, { headers: { cookie: memberCookie } })).json()
    expect(admin.isAdmin).toBe(true)
    expect(member.isAdmin).toBe(false)
    expect(JSON.stringify(member)).not.toContain('u:p')
  })

  it('403s member on claim, map, unlink, and disconnect', async () => {
    for (const [method, path, body] of [
      ['POST', '/api/simplefin/claim', { setupToken: 'x' }],
      ['POST', '/api/simplefin/map', { simplefinAccountId: 'SF-1', action: 'ignore' }],
      ['POST', '/api/simplefin/unlink', { accountId: 'x' }],
      ['DELETE', '/api/simplefin', undefined],
    ] as const) {
      const r = await fetch(`${base}${path}`, {
        method,
        headers: { cookie: memberCookie, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      expect(r.status, `${method} ${path}`).toBe(403)
    }
  })

  it('429s manual sync during cooldown', async () => {
    updateSimplefinData({ accessUrl: 'https://u:p@bridge.example/simplefin', lastSyncAt: new Date().toISOString() })
    const r = await fetch(`${base}/api/simplefin/sync`, { method: 'POST', headers: { cookie: memberCookie } })
    expect(r.status).toBe(429)
  })

  it('400s claim with an invalid setup token', async () => {
    const r = await fetch(`${base}/api/simplefin/claim`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupToken: '!!!garbage!!!' }),
    })
    expect(r.status).toBe(400)
  })

  it('map ignore + attach round-trip via admin', async () => {
    updateSimplefinData({
      accessUrl: 'https://u:p@bridge.example/simplefin',
      discovered: [
        { id: 'SF-1', org: 'Navy Federal Credit Union', name: 'Share Savings', balance: 5000.1, balanceDate: '2026-07-20T12:00:00Z' },
        { id: 'SF-2', org: 'Fidelity Investments', name: 'Brokerage', balance: 82000, balanceDate: '2026-07-20T12:00:00Z' },
      ],
    })
    const acct = addAccount('NFCU Savings', 'Savings')
    const ignore = await fetch(`${base}/api/simplefin/map`, {
      method: 'POST', headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ simplefinAccountId: 'SF-2', action: 'ignore' }),
    })
    expect(ignore.status).toBe(200)
    const attach = await fetch(`${base}/api/simplefin/map`, {
      method: 'POST', headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ simplefinAccountId: 'SF-1', action: 'attach', accountId: acct.id }),
    })
    const status = await attach.json()
    const byId = Object.fromEntries(status.discovered.map((d: { id: string }) => [d.id, d]))
    expect(byId['SF-1'].state).toBe('linked')
    expect(byId['SF-2'].state).toBe('ignored')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/simplefin-routes.test.ts`
Expected: FAIL — status route 404s (falls through to SPA fallback, HTML instead of JSON)

- [ ] **Step 3: Implement routes in `src/main/server.ts`**

Add imports at the top:

```ts
import { runSync, buildStatus } from './simplefin-sync'
import { claimSetupToken } from './simplefin-client'
import { getSimplefinData, updateSimplefinData } from './simplefin-store'
import { linkSimplefin, createLinkedAccount, unlinkSimplefin } from './assets-store'
import type { SimplefinMapAction } from '../shared/types'
```

(Note: `assets-store` is already imported — merge the new names into the existing import block.)

Inside `handleRequest`, insert a role helper and the routes **after the Assets REST block** (before `// ── Goals REST API`):

```ts
    // ── SimpleFIN REST API ──────────────────────────────────────────────────
    // Admin = 'admin' role in web mode; with auth disabled (Electron/local
    // dev) there are no roles, so management is allowed.
    const sfIsAdmin = !opts.auth || opts.auth.getSessionUser(req)?.role === 'admin'
    const sfForbid = (): void => {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Admin only' }))
    }
    const sfStatus = (): void => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(buildStatus(sfIsAdmin)))
    }

    if (urlPath === '/api/simplefin/status' && req.method === 'GET') {
      sfStatus()
      return
    }

    if (urlPath === '/api/simplefin/sync' && req.method === 'POST') {
      const result = await runSync({ manual: true })
      if (result.ok) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(buildStatus(sfIsAdmin)))
      } else {
        const status = result.reason === 'cooldown' ? 429 : result.reason === 'not-connected' ? 409 : 502
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: result.message }))
      }
      return
    }

    if (urlPath === '/api/simplefin/claim' && req.method === 'POST') {
      if (!sfIsAdmin) { sfForbid(); return }
      await new Promise<void>((resolve) => {
        readBody(req, res, (body) => {
          claimSetupToken(String(body.setupToken ?? ''))
            .then(async (accessUrl) => {
              updateSimplefinData({ accessUrl, connectedAt: new Date().toISOString(), lastSyncError: null })
              await runSync({ manual: false })   // first sync populates `discovered`
              sfStatus()
            })
            .catch((err) => {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Claim failed' }))
            })
            .finally(resolve)
        })
      })
      return
    }

    if (urlPath === '/api/simplefin/map' && req.method === 'POST') {
      if (!sfIsAdmin) { sfForbid(); return }
      readBody(req, res, (body) => {
        const action = body as SimplefinMapAction
        const remote = getSimplefinData().discovered.find((d) => d.id === action.simplefinAccountId)
        if (!remote) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Unknown SimpleFIN account' }))
          return
        }
        if (action.action === 'attach') {
          linkSimplefin(action.accountId, { accountId: remote.id, org: remote.org })
        } else if (action.action === 'create') {
          createLinkedAccount(action.name, action.type, { accountId: remote.id, org: remote.org })
        } else {
          const data = getSimplefinData()
          if (!data.ignoredAccountIds.includes(remote.id)) {
            updateSimplefinData({ ignoredAccountIds: [...data.ignoredAccountIds, remote.id] })
          }
        }
        sfStatus()
      })
      return
    }

    if (urlPath === '/api/simplefin/unlink' && req.method === 'POST') {
      if (!sfIsAdmin) { sfForbid(); return }
      readBody(req, res, (body) => {
        unlinkSimplefin(String(body.accountId ?? ''))
        sfStatus()
      })
      return
    }

    if (urlPath === '/api/simplefin' && req.method === 'DELETE') {
      if (!sfIsAdmin) { sfForbid(); return }
      updateSimplefinData({ accessUrl: null, connectedAt: null, errors: [], discovered: [] })
      sfStatus()
      return
    }
```

- [ ] **Step 4: Wire the scheduler in `src/server/index.ts`**

Add import: `import { startSyncScheduler, stopSyncScheduler } from '../main/simplefin-sync'`

After `startWatcher(...)` add:

```ts
  startSyncScheduler()
```

In `shutdown`, before `stopWatcher()`:

```ts
    stopSyncScheduler()
```

- [ ] **Step 5: Run route tests + full suite**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/main/server.ts src/server/index.ts tests/simplefin-routes.test.ts
git commit -m "feat(simplefin): REST endpoints with admin guard, scheduler wiring"
```

---

### Task 6: Renderer API layer + shared balance helper + user prop

**Files:**
- Modify: `src/renderer/src/api.ts`
- Create: `src/renderer/src/lib/balances.ts`
- Modify: `src/renderer/src/App.tsx` (pass `user` to AssetsTab, ~line 801)
- Modify: `src/renderer/src/components/AssetsTab.tsx`, `src/renderer/src/components/NetWorthSection.tsx` (switch to the shared helper — behavior-preserving refactor; the sync-aware change lands here too since the helper is written sync-aware)

**Interfaces:**
- Consumes: routes from Task 5, types from Task 1
- Produces:
  - `api.ts`: `getSimplefinStatus(): Promise<SimplefinStatus>`, `claimSimplefin(setupToken: string): Promise<SimplefinStatus>`, `syncSimplefin(): Promise<{ ok: true; status: SimplefinStatus } | { ok: false; error: string; httpStatus: number }>`, `mapSimplefin(action: SimplefinMapAction): Promise<SimplefinStatus>`, `unlinkSimplefin(accountId: string): Promise<SimplefinStatus>`, `disconnectSimplefin(): Promise<SimplefinStatus>`
  - `lib/balances.ts`: `accountBalance(account: AssetAccount): number` (sync-aware), `getDisplayBalance(account: AssetAccount, dashboardBalance?: number): number`, `snapshotAtOrBefore(account: AssetAccount, isoDate: string): number | null`, `relTime(iso: string): string`, `isStale(iso: string | null, hours?: number): boolean`
  - `App.tsx`: `<AssetsTab user={user} …>`

- [ ] **Step 1: Create `src/renderer/src/lib/balances.ts`**

```ts
import type { AssetAccount } from '../../../shared/types'

// Single source of truth for account balances in the renderer — previously
// duplicated across AssetsTab / NetWorthSection / AccountDetailPanel.
export function accountBalance(account: AssetAccount): number {
  if (account.simplefin && account.syncedBalance !== undefined) return account.syncedBalance
  return (account.transactions ?? []).reduce(
    (sum, t) => (t.type === 'deposit' ? sum + t.amount : sum - t.amount),
    0,
  )
}

export function getDisplayBalance(account: AssetAccount, dashboardBalance?: number): number {
  if (account.syncedWithDashboard && dashboardBalance !== undefined) return dashboardBalance
  return accountBalance(account)
}

// Last snapshot dated on or before isoDate ("YYYY-MM-DD"), or null if none.
export function snapshotAtOrBefore(account: AssetAccount, isoDate: string): number | null {
  const snaps = account.snapshots ?? []
  let best: number | null = null
  for (const s of snaps) {
    if (s.date <= isoDate) best = s.balance
    else break   // snapshots are stored sorted ascending
  }
  return best
}

export function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Stale = older than 36h → multiple scheduled syncs have been missed (spec §8).
export function isStale(iso: string | null, hours = 36): boolean {
  if (!iso) return false
  return Date.now() - Date.parse(iso) > hours * 3600 * 1000
}
```

- [ ] **Step 2: Add SimpleFIN functions to `src/renderer/src/api.ts`**

Add `SimplefinStatus, SimplefinMapAction` to the types import. Append at the end (before the Auth section):

```ts
// ── SimpleFIN ─────────────────────────────────────────────────────────────────
// Web-mode only: the feature depends on server-side sync + admin roles, which
// exist only behind the auth'd web server (Electron mode has neither).

export function getSimplefinStatus(): Promise<SimplefinStatus> {
  return httpGet('/api/simplefin/status') as Promise<SimplefinStatus>
}

export function claimSimplefin(setupToken: string): Promise<SimplefinStatus> {
  return httpPost('/api/simplefin/claim', { setupToken }) as Promise<SimplefinStatus>
}

/** Manual sync. Distinguishes cooldown (429) and bridge failure (502) from success. */
export async function syncSimplefin(): Promise<{ ok: true; status: SimplefinStatus } | { ok: false; error: string; httpStatus: number }> {
  const r = await fetch('/api/simplefin/sync', { method: 'POST' })
  bounceToLoginOn401(r)
  const body = await r.json().catch(() => ({}))
  if (r.ok) return { ok: true, status: body as SimplefinStatus }
  return { ok: false, error: (body as { error?: string }).error ?? `HTTP ${r.status}`, httpStatus: r.status }
}

export function mapSimplefin(action: SimplefinMapAction): Promise<SimplefinStatus> {
  return httpPost('/api/simplefin/map', action) as Promise<SimplefinStatus>
}

export function unlinkSimplefin(accountId: string): Promise<SimplefinStatus> {
  return httpPost('/api/simplefin/unlink', { accountId }) as Promise<SimplefinStatus>
}

export function disconnectSimplefin(): Promise<SimplefinStatus> {
  return httpDelete('/api/simplefin') as Promise<SimplefinStatus>
}
```

- [ ] **Step 3: Refactor duplicated helpers**

In `AssetsTab.tsx`: delete the local `accountBalance` function (lines 53–57) and the `getDisplayBalance` const inside the component (lines 104–107); import instead: `import { getDisplayBalance } from '../lib/balances'` and change call sites from `getDisplayBalance(account)` to `getDisplayBalance(account, dashboardBalance)`.

In `NetWorthSection.tsx`: delete the local `accountBalance` and `getDisplayBalance` (lines 32–42); import `import { getDisplayBalance, accountBalance } from '../lib/balances'`.

In `App.tsx` (~line 801): add the prop `user={user}` to `<AssetsTab …>` and add `user: AuthUser | null` to `AssetsTabProps` in `AssetsTab.tsx` (`import type { AuthUser } from '../../../shared/types'`) — consumed by Task 7.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit -p tsconfig.web.json` — expect no errors.
Run: `npm run build:web` — expect success.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/api.ts src/renderer/src/lib/balances.ts src/renderer/src/App.tsx src/renderer/src/components/AssetsTab.tsx src/renderer/src/components/NetWorthSection.tsx
git commit -m "feat(simplefin): renderer api + shared sync-aware balance helpers"
```

---

### Task 7: Asset Page header controls + live card badges  🎨 gpt-taste

**Files:**
- Modify: `src/renderer/src/components/AssetsTab.tsx`
- Modify: `src/renderer/src/index.css` (new classes)

**Interfaces:**
- Consumes: Task 6 (`api.getSimplefinStatus`, `api.syncSimplefin`, `relTime`, `isStale`, `user` prop), Task 8's modal (rendered here via `modal` state kind `'simplefin'` — Task 8 creates the component; this task adds the state arm and a placeholder `null` render that Task 8 replaces)
- Produces: `simplefinStatus` state + `reloadSimplefin()` in AssetsTab (Task 8's modal receives `status`, `onChanged: () => void`); CSS classes `.sf-live-dot`, `.sf-meta--stale`, `.sf-badge-attention`, `.sf-syncbar`

- [ ] **Step 0: Invoke the `gpt-taste` skill** (Skill tool, `gpt-taste`) before writing JSX. Apply its judgment to the badge/indicator/button styling below — structure and class names must remain.

- [ ] **Step 1: Add state + effects to `AssetsTab`**

```tsx
import type { AuthUser, SimplefinStatus } from '../../../shared/types'
import { ArrowsClockwise, LinkSimple, WarningCircle } from '@phosphor-icons/react'
import { relTime, isStale } from '../lib/balances'

// props: add
//   user: AuthUser | null

  const [simplefinStatus, setSimplefinStatus] = useState<SimplefinStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)

  const reloadSimplefin = useCallback(async () => {
    try { setSimplefinStatus(await api.getSimplefinStatus()) } catch { /* web-mode only */ }
  }, [])

  useEffect(() => { void reloadSimplefin() }, [reloadSimplefin])

  async function handleSyncNow(): Promise<void> {
    setSyncing(true)
    setSyncNote(null)
    const result = await api.syncSimplefin()
    setSyncing(false)
    if (result.ok) {
      setSimplefinStatus(result.status)
      await reloadAccounts()
    } else {
      setSyncNote(result.error)   // cooldown / bridge failure — quiet inline note, no toast
    }
  }

  const isAdmin = simplefinStatus?.isAdmin ?? false
  const showSyncControls = simplefinStatus?.connected || isAdmin
```

- [ ] **Step 2: Extend the Accounts section header** (replace the existing `asset-section-head` block for Accounts):

```tsx
      <div className="asset-section-head">
        <span className="asset-section-head__title">Accounts</span>
        {showSyncControls && (
          <div className="sf-syncbar">
            {simplefinStatus?.lastSyncAt && (
              <span className={`asset-card__meta${isStale(simplefinStatus.lastSyncAt) ? ' sf-meta--stale' : ''}`}>
                Synced {relTime(simplefinStatus.lastSyncAt)}
              </span>
            )}
            {syncNote && <span className="asset-card__meta sf-meta--stale">{syncNote}</span>}
            {simplefinStatus?.connected && (
              <button className="btn-ghost" onClick={() => void handleSyncNow()} disabled={syncing} aria-label="Sync balances now">
                <ArrowsClockwise size={13} weight="bold" className={syncing ? 'sf-spin' : undefined} />
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            {isAdmin && (
              <button className="btn-ghost" onClick={() => setModal({ kind: 'simplefin' })}>
                <LinkSimple size={13} weight="bold" />
                Linked accounts
              </button>
            )}
          </div>
        )}
        <button className="btn-ghost" onClick={() => setModal({ kind: 'add-account' })}>
          <Plus size={13} weight="bold" />
          Add Account
        </button>
      </div>
```

Add `| { kind: 'simplefin' }` to `ModalState`. Until Task 8 lands, render nothing for it: `{modal?.kind === 'simplefin' && null}`.

- [ ] **Step 3: Live badge on linked account cards** — inside the card `asset-card__meta` block, before the existing conditions:

```tsx
                    {account.simplefin ? (
                      account.needsAttention ? (
                        <>
                          <WarningCircle size={12} weight="fill" className="sf-badge-attention" />
                          {account.simplefin.org} · needs attention
                        </>
                      ) : (
                        <>
                          <span className={`status-dot ${isStale(simplefinStatus?.lastSyncAt ?? null) ? '' : 'status-dot--online'}`} />
                          {account.simplefin.org}
                          {simplefinStatus?.lastSyncAt ? ` · synced ${relTime(simplefinStatus.lastSyncAt)}` : ''}
                        </>
                      )
                    ) : isSynced ? (
```

(continue the existing chain unchanged).

- [ ] **Step 4: CSS** — add to `index.css` near the `.status-dot` rules (gpt-taste governs final values):

```css
/* ── SimpleFIN sync UI ── */
.sf-syncbar { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.sf-syncbar + .btn-ghost { margin-left: 12px; }
.sf-meta--stale { color: var(--warning, #FBBF24); }
.sf-badge-attention { color: var(--warning, #FBBF24); }
.sf-spin { animation: sf-rotate 900ms linear infinite; }
@keyframes sf-rotate { to { transform: rotate(360deg); } }
```

- [ ] **Step 5: Verify visually**

Run: `npm run build:web` then `npm run start:web` with env `APP_DATA_DIR=<scratch dir>` and `BUDGET_XLSX_PATH=<any>` (auth disabled locally → admin controls visible). Open the printed URL → Assets tab. Confirm: header shows "Linked accounts" (admin, since auth off), no "Sync now" (not connected), cards unchanged for manual accounts. No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/AssetsTab.tsx src/renderer/src/index.css
git commit -m "feat(simplefin): asset page sync controls + live card badges"
```

---

### Task 8: Linked Accounts management modal  🎨 gpt-taste

**Files:**
- Create: `src/renderer/src/components/SimplefinModal.tsx`
- Modify: `src/renderer/src/components/AssetsTab.tsx` (render the modal for `{ kind: 'simplefin' }`)

**Interfaces:**
- Consumes: Task 6 api functions; Task 7's `simplefinStatus` + `reloadSimplefin`; existing modal styles from `AccountModals.tsx` (`overlayStyle`-equivalent — copy the style objects, they are module-private); `AssetAccount[]` for the attach dropdown
- Produces: `SimplefinModal` component: `{ status: SimplefinStatus; accounts: AssetAccount[]; onClose: () => void; onChanged: () => Promise<void> }`

- [ ] **Step 0: Invoke the `gpt-taste` skill** before writing JSX.

- [ ] **Step 1: Implement `SimplefinModal.tsx`**

Full component (copy modal style objects from `AccountModals.tsx`; wider `maxWidth: 560` for the mapping list):

```tsx
import { useState } from 'react'
import { ArrowSquareOut, LinkSimple, Prohibit, Plus } from '@phosphor-icons/react'
import type { AccountType, AssetAccount, SimplefinStatus } from '../../../shared/types'
import * as api from '../api'

const ACCOUNT_TYPES: AccountType[] = ['Checkings', 'Savings', 'Retirement', 'Hard Asset', 'Investing', 'Goal']
const BRIDGE_URL = 'https://beta-bridge.simplefin.org/'

// (paste overlayStyle / modalStyle / inputStyle / selectStyle / primaryBtn /
//  cancelBtn / dangerBtn / labelStyle from AccountModals.tsx here, with
//  modalStyle maxWidth: 560)

interface SimplefinModalProps {
  status: SimplefinStatus
  accounts: AssetAccount[]
  onClose: () => void
  onChanged: () => Promise<void>
}

export function SimplefinModal({ status, accounts, onClose, onChanged }: SimplefinModalProps): JSX.Element {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Per-row draft state for "create new": name + type
  const [drafts, setDrafts] = useState<Record<string, { name: string; type: AccountType }>>({})
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  async function run(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await fn()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const unmappedManualAccounts = accounts.filter((a) => !a.simplefin)

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyle} role="dialog" aria-label="Linked accounts">
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Linked Accounts</div>

        {!status.connected ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              Connect your banks at SimpleFIN Bridge, then paste the one-time setup token here.
              The token is exchanged once and never shown again.
            </p>
            <a href={BRIDGE_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 13 }}>
              Open SimpleFIN Bridge <ArrowSquareOut size={12} />
            </a>
            <div>
              <label style={labelStyle}>Setup token</label>
              <input style={inputStyle} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste setup token" />
            </div>
            {error && <div style={{ color: 'var(--expense)', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={cancelBtn} onClick={onClose}>Close</button>
              <button
                style={primaryBtn}
                disabled={busy || !token.trim()}
                onClick={() => void run(() => api.claimSimplefin(token.trim()))}
              >
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </>
        ) : (
          <>
            {status.errors.length > 0 && (
              <div style={{ color: 'var(--warning, #FBBF24)', fontSize: 13 }}>
                {status.errors.map((e) => <div key={e}>{e}</div>)}
                <a href={BRIDGE_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                  Repair at SimpleFIN Bridge <ArrowSquareOut size={12} />
                </a>
              </div>
            )}
            {status.lastSyncError && (
              <div style={{ color: 'var(--expense)', fontSize: 13 }}>Last sync failed: {status.lastSyncError}</div>
            )}

            <div className="pay-list">
              {status.discovered.map((d) => {
                const draft = drafts[d.id] ?? { name: d.name, type: 'Checkings' as AccountType }
                const linkedAccount = d.linkedAccountId ? accounts.find((a) => a.id === d.linkedAccountId) : undefined
                return (
                  <div key={d.id} className="pay-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: '1 1 100%' }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{d.org}</div>
                    </div>
                    {d.state === 'linked' ? (
                      <>
                        <span style={{ color: 'var(--income)', fontSize: 12 }}>
                          <LinkSimple size={12} /> Linked to {linkedAccount?.name ?? 'account'}
                        </span>
                        <button
                          style={cancelBtn}
                          disabled={busy}
                          onClick={() => d.linkedAccountId && void run(() => api.unlinkSimplefin(d.linkedAccountId!))}
                        >
                          Unlink
                        </button>
                      </>
                    ) : d.state === 'ignored' ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}><Prohibit size={12} /> Ignored</span>
                    ) : (
                      <>
                        <select
                          style={{ ...selectStyle, width: 'auto', flex: 1 }}
                          disabled={busy}
                          defaultValue=""
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === '') return
                            if (v === '__ignore') void run(() => api.mapSimplefin({ simplefinAccountId: d.id, action: 'ignore' }))
                            else if (v === '__create') setDrafts({ ...drafts, [d.id]: draft })
                            else void run(() => api.mapSimplefin({ simplefinAccountId: d.id, action: 'attach', accountId: v }))
                          }}
                        >
                          <option value="" disabled>Choose…</option>
                          {unmappedManualAccounts.map((a) => (
                            <option key={a.id} value={a.id}>Attach to “{a.name}”</option>
                          ))}
                          <option value="__create">Create new account</option>
                          <option value="__ignore">Ignore</option>
                        </select>
                        {drafts[d.id] && (
                          <div style={{ display: 'flex', gap: 8, flex: '1 1 100%' }}>
                            <input
                              style={inputStyle}
                              value={draft.name}
                              onChange={(e) => setDrafts({ ...drafts, [d.id]: { ...draft, name: e.target.value } })}
                            />
                            <select
                              style={selectStyle}
                              value={draft.type}
                              onChange={(e) => setDrafts({ ...drafts, [d.id]: { ...draft, type: e.target.value as AccountType } })}
                            >
                              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button
                              style={primaryBtn}
                              disabled={busy || !draft.name.trim()}
                              onClick={() => void run(() => api.mapSimplefin({ simplefinAccountId: d.id, action: 'create', name: draft.name.trim(), type: draft.type }))}
                            >
                              <Plus size={12} weight="bold" /> Create
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              {status.discovered.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  No accounts discovered yet — run a sync, or check your connections at the bridge.
                </div>
              )}
            </div>

            {error && <div style={{ color: 'var(--expense)', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              {confirmDisconnect ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Disconnect SimpleFIN?</span>
                  <button style={dangerBtn} disabled={busy} onClick={() => void run(() => api.disconnectSimplefin())}>Disconnect</button>
                  <button style={cancelBtn} onClick={() => setConfirmDisconnect(false)}>Keep</button>
                </div>
              ) : (
                <button style={cancelBtn} onClick={() => setConfirmDisconnect(true)}>Disconnect…</button>
              )}
              <button style={cancelBtn} onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Render it from `AssetsTab.tsx`** — replace the Task 7 placeholder:

```tsx
      {modal?.kind === 'simplefin' && simplefinStatus && (
        <SimplefinModal
          status={simplefinStatus}
          accounts={accounts}
          onClose={() => setModal(null)}
          onChanged={async () => { await reloadSimplefin(); await reloadAccounts() }}
        />
      )}
```

with `import { SimplefinModal } from './SimplefinModal'`.

- [ ] **Step 3: Verify visually**

`npm run build:web && npm run start:web` (auth off → admin). Open Assets → "Linked accounts". Confirm: token paste screen renders with the bridge link. Paste garbage → inline error from the 400 (no crash). Close works. (Real token flow is end-to-end verified in Task 11.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/SimplefinModal.tsx src/renderer/src/components/AssetsTab.tsx
git commit -m "feat(simplefin): linked-accounts management modal (connect/map/ignore/unlink)"
```

---

### Task 9: AccountDetailPanel — linked mode  🎨 gpt-taste

**Files:**
- Modify: `src/renderer/src/components/AccountDetailPanel.tsx`

**Interfaces:**
- Consumes: `account.simplefin`, `account.syncedBalance`, `account.snapshots`, `accountBalance` from `../lib/balances`

- [ ] **Step 0: Invoke the `gpt-taste` skill** before writing JSX.

- [ ] **Step 1: Implement linked mode**

Changes to `AccountDetailPanel.tsx`:

1. `const isLinked = !!account.simplefin`
2. Header: when linked, hide the "Add" transaction button; show instead a muted note chip: `<span className="asset-card__meta">Live · {account.simplefin!.org}</span>`
3. Balance card: `const currentBalance = isLinked && account.syncedBalance !== undefined ? account.syncedBalance : running` — the Deposits/Withdrawals stat cards render only when `!isLinked`.
4. Chart: when linked, chart the **snapshots** instead of the running ledger:

```tsx
  const lineData = isLinked
    ? (account.snapshots ?? []).map((s) => ({ date: s.date, balance: s.balance }))
    : sorted.map(/* existing running-balance mapping unchanged */)
```

Chart title: `isLinked ? 'Balance History' : 'Running Balance'`. When linked and `lineData.length < 2`, render `<div className="chart-empty">Balance history builds up as syncs run — check back tomorrow.</div>` inside the ChartCard instead of the chart.

5. Transaction log: when linked, wrap in a collapsed details section and drop the edit/delete buttons (frozen ledger):

```tsx
          {isLinked ? (
            (account.transactions ?? []).length > 0 && (
              <GlassCard style={{ padding: 20 }}>
                <details>
                  <summary className="chart-card__title" style={{ cursor: 'pointer' }}>
                    Historical entries ({account.transactions.length}) — frozen since linking
                  </summary>
                  <div className="pay-list" style={{ marginTop: 12 }}>
                    {descSorted.map((tx) => (
                      <div key={tx.id} className="pay-row">
                        <span className="pay-row__date">{tx.date as unknown as string}</span>
                        <span className={`pay-row__amt ${tx.type === 'deposit' ? 'pay-row__amt--principal' : 'pay-row__amt--out'}`}>
                          {tx.type === 'deposit' ? '+' : '−'}{fmtCAD(tx.amount)}
                        </span>
                        {tx.note && <span className="pay-row__note">{tx.note}</span>}
                      </div>
                    ))}
                  </div>
                </details>
              </GlassCard>
            )
          ) : (
            /* existing Transaction Log GlassCard unchanged */
          )}
```

6. Empty state: the existing "No transactions yet" card must not show for linked accounts (they may have zero transactions but a synced balance) — condition becomes `(account.transactions ?? []).length === 0 && !isLinked`. When linked with no snapshots yet, the stat card + chart-empty state above covers it.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit -p tsconfig.web.json && npm run build:web` — expect success.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/AccountDetailPanel.tsx
git commit -m "feat(simplefin): linked account detail view (snapshot chart, frozen ledger)"
```

---

### Task 10: Net Worth charts — snapshot-aware history + by-type  🎨 gpt-taste

**Files:**
- Modify: `src/renderer/src/components/NetWorthSection.tsx`

**Interfaces:**
- Consumes: `snapshotAtOrBefore`, `getDisplayBalance` from `../lib/balances` (Task 6)

The by-type donut is already correct after Task 6 (it calls `getDisplayBalance`, which is sync-aware). This task fixes the **history chart**: linked accounts must contribute their last snapshot on/before each month end, falling back to the frozen ledger for pre-link months.

- [ ] **Step 1: Extend the month set** — snapshots contribute months too. Replace the month collection loop:

```tsx
  const monthSet = new Set<string>()
  for (const acct of accounts) {
    for (const t of acct.transactions ?? []) {
      const dateStr = t.date as unknown as string
      monthSet.add(dateStr.slice(0, 7))
    }
    for (const s of acct.snapshots ?? []) {
      monthSet.add(s.date.slice(0, 7))
    }
  }
```

- [ ] **Step 2: Make the carry-forward loop snapshot-aware.** Replace the inner per-account logic of `carryForwardHistory`:

```tsx
      for (const acct of accounts) {
        const snap = snapshotAtOrBefore(acct, lastDay)
        if (acct.simplefin && snap !== null) {
          // Linked account with sync history covering this month → snapshot wins
          lastKnown[acct.id] = snap
        } else {
          const hasTxn = (acct.transactions ?? []).some((t) => (t.date as unknown as string) <= lastDay)
          if (hasTxn) {
            lastKnown[acct.id] = balanceAtEndOfMonth(acct, ym)
          }
        }
        total += lastKnown[acct.id]
      }
```

(Pre-link months: `snap` is null → frozen ledger value applies. Post-link: snapshot wins and carries forward.)

- [ ] **Step 3: Verify visually + full suite**

Run: `npx vitest run && npm run build:web` — all pass, build clean.
Manual: with a seeded `assets.json` containing one linked account with snapshots (copy a fixture by hand into the scratch APP_DATA_DIR), confirm History rises with snapshot values and the donut includes the synced balance under the right type.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/NetWorthSection.tsx
git commit -m "feat(simplefin): net worth history seeded from balance snapshots"
```

---

### Task 11: End-to-end verification + docs

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-simplefin-live-balances-design.md` (append status line)
- Modify: `.env.example` — no changes needed (no new env vars); verify this is true.

- [ ] **Step 1: Full suite + builds**

Run: `npx vitest run` → all pass. `npm run build:web` → clean. `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json` → clean.

- [ ] **Step 2: Live end-to-end with Eric's real setup token** (requires Eric at the keyboard — he has a SimpleFIN account with Navy Federal + Fidelity connected)

1. `npm run build:web && npm run start:web` with a scratch `APP_DATA_DIR`.
2. Assets → Linked accounts → open bridge → obtain setup token → paste → Connect.
3. Confirm: discovered list shows the real Navy Federal + Fidelity accounts with balances.
4. Map one account each way: attach to an existing manual account, create one new, ignore one.
5. Confirm cards show live badges + balances; Sync now works then 429s inside the cooldown (quiet inline note).
6. Confirm detail view shows the synced balance and (after a first sync) a single snapshot point; frozen ledger collapsed.
7. Confirm Net Worth "by Type" includes the live balances; History renders without regression.
8. Kill the server's network (or point accessUrl at a dead host in simplefin.json) → Sync now → balances remain, error shows in modal ("never lie, never zero").

- [ ] **Step 3: Append to the design doc**

```markdown
## Status
Implemented on `feature/plaid-assets` — see plan `docs/superpowers/plans/2026-07-20-simplefin-live-balances.md`. E2E verified against the live bridge on <date>.
```

- [ ] **Step 4: Commit, then use superpowers:finishing-a-development-branch**

```bash
git add docs/superpowers/specs/2026-07-20-simplefin-live-balances-design.md
git commit -m "docs(simplefin): mark design implemented + e2e verified"
```

Then follow `superpowers:finishing-a-development-branch` (PR to master, per repo convention).

---

## Self-Review Notes

- **Spec coverage:** §1 provider (Tasks 2, 4), §2 balances-only + raw retention (Task 4 `appendRawSync`, no transaction ingestion), §3 cadence (Task 4 scheduler + cooldown, Task 5 wiring, Task 7 button), §4 explicit mapping (Tasks 5, 8), §5 credential storage + roles (Tasks 1, 5 — accessUrl server-side only, admin guard), §6 keep-frozen (Task 3 guard + Task 9 UI), §7 snapshots (Tasks 3, 4), §8 failure UX (Task 4 never-zero + Task 7/8 stale/attention states), §9 UI surfaces (Tasks 7–9, gpt-taste), §10 net worth (Task 10 + Task 6 helper).
- **Type consistency:** `SimplefinLink { accountId, org }` used in Tasks 1/3/4/5; `applySyncedBalance(simplefinAccountId, balance, snapshotDate, needsAttention)` consistent in Tasks 3/4; `SimplefinStatus.discovered[].state` values `'linked' | 'ignored' | 'new'` consistent in Tasks 1/4/5/8.
- **Known accepted quirks:** per-card "synced Xh ago" uses the global `lastSyncAt` (syncs are all-accounts atomic, so this is accurate); Electron mode hides the feature naturally (`getSimplefinStatus` fetch fails silently → no controls render).
