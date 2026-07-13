# Phase 1: Containerize budget-app + OneDrive Mirror — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Budget Dashboard as a headless Docker container (no Electron) that serves the existing React UI over LAN and reads the Excel workbook from a OneDrive download-only mirror.

**Architecture:** The existing `src/main/server.ts` already exposes the full REST API, serves the renderer over HTTP, and broadcasts via WebSocket; the renderer already falls back to HTTP/WS when `window.electronAPI` is absent. This plan extracts the three Electron touchpoints (userData path in the four stores, `app.getAppPath`/`is.dev` in server.ts, `BrowserWindow` in watcher.ts) behind injectable seams, adds a headless entry point configured by env vars, and packages it with a multi-stage Dockerfile plus an abraunegg `onedrive` sidecar in Compose.

**Tech Stack:** Node 22, TypeScript, vite (web build), esbuild (server bundle), vitest (tests), Docker Compose, `driveone/onedrive` image (abraunegg client).

## Global Constraints

- **Worktree isolation (HARD RULE):** All work happens on branch `feature/phase1-containerize` in a separate git worktree created via the `superpowers:using-git-worktrees` skill. The original checkout at `C:\Users\eric1\OneDrive\Desktop\BUDGET\Dev` is NEVER modified. No merge to `master` without Eric's explicit approval.
- **Excel files (HARD RULE):** Never read or write `2026 Budget.xlsx` (prod). Reading `2026 Budget - Copy.xlsx` (test copy) requires asking Eric first. All automated tests and local verification use *generated* fixture `.xlsx` files in temp directories.
- OneDrive sidecar: `download_only = "true"`, `monitor_interval = "30"` (exact values; from spec).
- Server port: `3737`. Container data dirs: mirror at `/data/budget` (read-only mount), app data at `/data/app`.
- The Electron desktop entry (`npm run dev`) must keep working on the branch throughout — it is the fallback until Eric approves the merge.
- Node 22 (`node:22-alpine` images).
- Commit after every task; conventional-commit messages.

---

### Task 0: Create worktree and branch

**Files:** none (git only)

- [ ] **Step 1: Create the worktree** (per superpowers:using-git-worktrees)

```powershell
cd C:\Users\eric1\OneDrive\Desktop\BUDGET\Dev
git worktree add ..\Dev-phase1 -b feature/phase1-containerize
cd ..\Dev-phase1
npm ci
```

Expected: new directory `C:\Users\eric1\OneDrive\Desktop\BUDGET\Dev-phase1` on branch `feature/phase1-containerize`; `npm ci` completes. **All subsequent tasks run inside `Dev-phase1`.**

- [ ] **Step 2: Verify original untouched**

```powershell
cd C:\Users\eric1\OneDrive\Desktop\BUDGET\Dev; git status --short
```

Expected: empty output (clean tree, still on `master`).

---

### Task 1: Test infrastructure (vitest) + electron to devDependencies

**Files:**
- Modify: `package.json`
- Create: `tests/sanity.test.ts`

**Interfaces:**
- Produces: `npm test` runs vitest; later tasks add files under `tests/`.

- [ ] **Step 1: Install vitest and esbuild; move electron to devDependencies**

```powershell
npm install -D vitest esbuild
npm uninstall electron
npm install -D electron@^33.0.0
```

- [ ] **Step 2: Add test script to package.json**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Write sanity test**

Create `tests/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('test infrastructure', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: Verify Electron dev mode still boots** (electron moved to devDeps)

Run: `npm run dev` — expect the Electron window to open and the dashboard to load; then close it.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json tests/sanity.test.ts
git commit -m "chore: add vitest + esbuild, move electron to devDependencies"
```

---

### Task 2: Injectable data directory; stores stop importing electron

**Files:**
- Create: `src/main/data-dir.ts`
- Test: `tests/data-dir.test.ts`, `tests/store.test.ts`
- Modify: `src/main/store.ts`, `src/main/assets-store.ts`, `src/main/goals-store.ts`, `src/main/mortgage-store.ts`, `src/main/index.ts`

**Interfaces:**
- Produces: `initDataDir(dir: string): void`, `getDataDir(): string` (throws if uninitialized), `resetDataDir(): void` (tests only) — from `src/main/data-dir.ts`. All four stores call `getDataDir()` lazily (no module-load path resolution). Electron entry calls `initDataDir(app.getPath('userData'))` first thing in `whenReady`.

- [ ] **Step 1: Write failing tests**

Create `tests/data-dir.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDataDir, getDataDir, resetDataDir } from '../src/main/data-dir'

describe('data-dir', () => {
  beforeEach(() => resetDataDir())

  it('throws before initialization', () => {
    expect(() => getDataDir()).toThrow(/not initialized/)
  })

  it('returns the directory after init', () => {
    initDataDir('C:/tmp/test-data')
    expect(getDataDir()).toBe('C:/tmp/test-data')
  })
})
```

Create `tests/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import { getBudgets, setBudget } from '../src/main/store'

describe('store with injected data dir', () => {
  beforeEach(() => {
    initDataDir(mkdtempSync(join(tmpdir(), 'budget-store-test-')))
  })

  it('round-trips a budget entry', () => {
    setBudget('2026-07', 'Groceries', 600)
    expect(getBudgets()).toEqual({ '2026-07': { Groceries: 600 } })
  })

  it('amount 0 removes the entry and empty months', () => {
    setBudget('2026-07', 'Groceries', 600)
    setBudget('2026-07', 'Groceries', 0)
    expect(getBudgets()).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/main/data-dir`; `store.test.ts` fails importing `electron` (no electron runtime under vitest).

- [ ] **Step 3: Create `src/main/data-dir.ts`**

```ts
// Injectable data directory so stores work in both Electron (userData)
// and headless server mode (env-configured path) without importing electron.
let dataDir: string | null = null

export function initDataDir(dir: string): void {
  dataDir = dir
}

export function getDataDir(): string {
  if (!dataDir) {
    throw new Error('Data directory not initialized — call initDataDir() first')
  }
  return dataDir
}

// Test-only: clears module state so init-order tests are deterministic.
export function resetDataDir(): void {
  dataDir = null
}
```

- [ ] **Step 4: Refactor `src/main/store.ts`** — replace the electron import and module-level path with a lazy path:

Replace lines 1–6:

```ts
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import type { BudgetMap } from '../shared/types'

const STORE_PATH = join(app.getPath('userData'), 'settings.json')
```

with:

```ts
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { getDataDir } from './data-dir'
import type { BudgetMap } from '../shared/types'

function storePath(): string {
  return join(getDataDir(), 'settings.json')
}
```

Then replace every use of `STORE_PATH` with `storePath()` (two occurrences in `readSettings`), and in `writeSettings` replace `mkdirSync(join(app.getPath('userData')), { recursive: true })` with `mkdirSync(getDataDir(), { recursive: true })` and `writeFileSync(STORE_PATH, ...)` with `writeFileSync(storePath(), ...)`.

- [ ] **Step 5: Refactor the other three stores with the identical pattern**

In each of `src/main/assets-store.ts`, `src/main/goals-store.ts`, `src/main/mortgage-store.ts`:

1. Line 1: replace `import { app } from 'electron'` with `import { getDataDir } from './data-dir'`.
2. Line 7: replace the module-level const with a function, keeping each store's filename:
   - assets: `const ASSETS_PATH = join(app.getPath('userData'), 'assets.json')` → `function assetsPath(): string { return join(getDataDir(), 'assets.json') }`
   - goals: `GOALS_PATH` / `'goals.json'` → `function goalsPath(): string { return join(getDataDir(), 'goals.json') }`
   - mortgages: `MORTGAGES_PATH` / `'mortgages.json'` → `function mortgagesPath(): string { return join(getDataDir(), 'mortgages.json') }`
3. Replace every remaining occurrence of the old const (`ASSETS_PATH` → `assetsPath()`, etc.).
4. Replace `mkdirSync(app.getPath('userData'), { recursive: true })` with `mkdirSync(getDataDir(), { recursive: true })`.
5. Verify with: `grep -n "electron" src/main/assets-store.ts src/main/goals-store.ts src/main/mortgage-store.ts src/main/store.ts` → expect no matches.

- [ ] **Step 6: Initialize in the Electron entry**

In `src/main/index.ts`, add to the imports: `import { initDataDir } from './data-dir'`, and make the first line inside `app.whenReady().then(async () => {` be:

```ts
initDataDir(app.getPath('userData'))
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npm test`
Expected: all pass (4 tests).

- [ ] **Step 8: Verify Electron dev mode still works**

Run: `npm run dev` — dashboard loads, budgets tab works. Close.

- [ ] **Step 9: Commit**

```powershell
git add src/main/data-dir.ts src/main/store.ts src/main/assets-store.ts src/main/goals-store.ts src/main/mortgage-store.ts src/main/index.ts tests/data-dir.test.ts tests/store.test.ts
git commit -m "refactor: injectable data dir - stores no longer import electron"
```

---

### Task 3: Decouple server.ts from electron; add /api/health

**Files:**
- Modify: `src/main/server.ts:1-10` (imports), `src/main/server.ts:110-118` (startServer), `src/main/index.ts`
- Test: `tests/server.test.ts`, `tests/helpers/fixture.ts`

**Interfaces:**
- Consumes: `initDataDir` from Task 2 (test setup).
- Produces: `startServer(opts: { rendererRoot: string; preferredPort?: number }): Promise<ServerInfo>`; `GET /api/health` → `{ ok: true, hasSnapshot: boolean }`. `stopServer()`, `setLastSnapshot()`, `broadcastDataUpdate()` unchanged.

- [ ] **Step 1: Write the fixture helper** (used by this task and Task 4)

Create `tests/helpers/fixture.ts`:

```ts
import * as XLSX from 'xlsx'

// Generates a minimal valid Budget workbook (Logbook sheet, real header names
// including the 'Budget' column that excel.ts normalizes to 'category').
// NEVER point tests at Eric's real Budget .xlsx files.
export function writeFixtureWorkbook(filePath: string): void {
  const rows = [
    ['date', 'description', 'Budget', 'income', 'debit', 'balance'],
    ['2026-07-01', 'Paycheck', 'Income', 2500, '', 2500],
    ['2026-07-02', 'HEB', 'Groceries', '', 85.5, 2414.5],
    ['2026-07-03', 'Gas station', 'Auto & Gas', '', 40, 2374.5],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Logbook')
  XLSX.writeFile(wb, filePath)
}
```

- [ ] **Step 2: Write failing server test**

Create `tests/server.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import { startServer, stopServer, setLastSnapshot } from '../src/main/server'
import { parseWorkbook } from '../src/main/excel'
import { writeFixtureWorkbook } from './helpers/fixture'

describe('headless server', () => {
  let baseUrl: string
  let dir: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'budget-server-test-'))
    initDataDir(dir)
    writeFileSync(join(dir, 'index.html'), '<html><body>ok</body></html>')
    const info = await startServer({ rendererRoot: dir, preferredPort: 3999 })
    baseUrl = `http://127.0.0.1:${info.port}`
  })

  afterAll(async () => {
    await stopServer()
  })

  it('serves /api/health without a snapshot', async () => {
    const r = await fetch(`${baseUrl}/api/health`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, hasSnapshot: false })
  })

  it('returns 503 from /api/snapshot before first parse', async () => {
    const r = await fetch(`${baseUrl}/api/snapshot`)
    expect(r.status).toBe(503)
  })

  it('serves the snapshot after a parse', async () => {
    const xlsx = join(dir, 'fixture.xlsx')
    writeFixtureWorkbook(xlsx)
    const parsed = parseWorkbook(xlsx)
    expect(parsed.ok).toBe(true)
    setLastSnapshot(parsed)
    const r = await fetch(`${baseUrl}/api/snapshot`)
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.result.transactions).toHaveLength(3)
    const health = await (await fetch(`${baseUrl}/api/health`)).json()
    expect(health.hasSnapshot).toBe(true)
  })

  it('serves static files with SPA fallback', async () => {
    const r = await fetch(`${baseUrl}/some/deep/route`)
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('ok')
  })
})
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — `server.ts` imports `electron`, and `startServer` takes no arguments.

- [ ] **Step 4: Refactor `src/main/server.ts`**

Remove these imports (lines 7–8):

```ts
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
```

Change `startServer` (line 110) from:

```ts
export async function startServer(): Promise<ServerInfo> {
  if (httpServer) return serverInfo!
  const port = await findFreePort(DEFAULT_PORT)
  const ip = getLanIp()
  const rendererRoot = is.dev
    ? join(__dirname, '../renderer')
    : join(app.getAppPath(), 'out/renderer')
```

to:

```ts
export interface StartServerOptions {
  rendererRoot: string
  preferredPort?: number
}

export async function startServer(opts: StartServerOptions): Promise<ServerInfo> {
  if (httpServer) return serverInfo!
  const port = await findFreePort(opts.preferredPort ?? DEFAULT_PORT)
  const ip = getLanIp()
  const rendererRoot = opts.rendererRoot
```

Add the health route inside the request handler, directly above the `/api/snapshot` block:

```ts
    // REST endpoint: GET /api/health — liveness + snapshot readiness
    if (urlPath === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, hasSnapshot: lastSnapshot !== null }))
      return
    }
```

- [ ] **Step 5: Update the Electron entry**

In `src/main/index.ts`, add a helper above `createWindow()`:

```ts
function rendererRoot(): string {
  return is.dev ? join(__dirname, '../renderer') : join(app.getAppPath(), 'out/renderer')
}
```

Change both call sites: `await startServer()` (in `whenReady`) → `await startServer({ rendererRoot: rendererRoot() })`, and in the `restart-server` IPC handler `const info = await startServer()` → `const info = await startServer({ rendererRoot: rendererRoot() })`.

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test`
Expected: all pass. Also verify no electron import remains: `grep -n "electron" src/main/server.ts` → no matches.

- [ ] **Step 7: Commit**

```powershell
git add src/main/server.ts src/main/index.ts tests/server.test.ts tests/helpers/fixture.ts
git commit -m "refactor: server takes rendererRoot option, no electron import; add /api/health"
```

---

### Task 4: Decouple watcher.ts from BrowserWindow

**Files:**
- Modify: `src/main/watcher.ts` (full rewrite below), `src/main/index.ts:54-61,95-106`
- Test: `tests/watcher.test.ts`

**Interfaces:**
- Consumes: `writeFixtureWorkbook` from Task 3.
- Produces: `startWatcher(filePath: string, notify?: (channel: string, payload: unknown) => void): void`; `stopWatcher(): void`. All watcher events (`file-changed`, `file-locked`, `file-locked-persistent`) now ALSO broadcast over WebSocket (browser clients previously missed lock warnings). Watches `add` as well as `change` (the OneDrive mirror may create the file after boot).

- [ ] **Step 1: Write failing test**

Create `tests/watcher.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { startWatcher, stopWatcher } from '../src/main/watcher'
import { writeFixtureWorkbook } from './helpers/fixture'

describe('watcher', () => {
  afterEach(() => stopWatcher())

  it('notifies on file change with parsed payload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-watch-test-'))
    const xlsx = join(dir, 'fixture.xlsx')
    writeFixtureWorkbook(xlsx)

    const notify = vi.fn()
    startWatcher(xlsx, notify)
    // Give chokidar a moment to establish the watch, then touch the file
    await new Promise((r) => setTimeout(r, 500))
    writeFixtureWorkbook(xlsx)

    await vi.waitFor(
      () => {
        expect(notify).toHaveBeenCalledWith(
          'file-changed',
          expect.objectContaining({ ok: true })
        )
      },
      { timeout: 8000, interval: 100 }
    )
  }, 15000)

  it('watches a not-yet-existing file and fires on creation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-watch-add-'))
    const xlsx = join(dir, 'later.xlsx')

    const notify = vi.fn()
    startWatcher(xlsx, notify)
    await new Promise((r) => setTimeout(r, 500))
    writeFixtureWorkbook(xlsx)

    await vi.waitFor(
      () => {
        expect(notify).toHaveBeenCalledWith(
          'file-changed',
          expect.objectContaining({ ok: true })
        )
      },
      { timeout: 8000, interval: 100 }
    )
  }, 15000)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — watcher imports `electron` (`BrowserWindow`) and its second parameter is a `BrowserWindow`.

- [ ] **Step 3: Rewrite `src/main/watcher.ts`** (complete file):

```ts
import chokidar, { FSWatcher } from 'chokidar'
import { parseWorkbook } from './excel'
import type { ParseResponse } from '../shared/types'
import { broadcastDataUpdate, setLastSnapshot } from './server'

// Channel-style callback so the Electron entry can forward to webContents.send
// and the headless entry can omit it (WS broadcast covers browser clients).
export type WatcherNotify = (channel: string, payload: unknown) => void

let watcher: FSWatcher | null = null
let retryTimeout: ReturnType<typeof setTimeout> | null = null
const MAX_RETRIES = 5
const RETRY_INTERVAL_MS = 800
const DEBOUNCE_MS = 200

export function startWatcher(filePath: string, notify: WatcherNotify = () => {}): void {
  stopWatcher()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  watcher = chokidar.watch(filePath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 100 },
  })

  const onFsEvent = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => handleFileChange(filePath, notify, 0), DEBOUNCE_MS)
  }
  watcher.on('change', onFsEvent)
  // The OneDrive mirror may create the file after boot (or replace via temp+rename)
  watcher.on('add', onFsEvent)
}

export function stopWatcher(): void {
  if (watcher) { watcher.close(); watcher = null }
  if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null }
}

function handleFileChange(filePath: string, notify: WatcherNotify, retryCount: number): void {
  const response: ParseResponse = parseWorkbook(filePath)
  if (response.ok) {
    const payload = { ok: true, result: response.result }
    setLastSnapshot(response)
    notify('file-changed', payload)
    broadcastDataUpdate({ type: 'file-changed', ...payload })
  } else if (response.error.kind === 'read-error' && retryCount < MAX_RETRIES) {
    // File may be locked by Excel or mid-download — retry silently
    retryTimeout = setTimeout(
      () => handleFileChange(filePath, notify, retryCount + 1),
      RETRY_INTERVAL_MS
    )
    if (retryCount === 0) {
      const lockPayload = { retriesRemaining: MAX_RETRIES - retryCount }
      notify('file-locked', lockPayload)
      broadcastDataUpdate({ type: 'file-locked', ...lockPayload })
    }
  } else if (response.error.kind === 'read-error' && retryCount >= MAX_RETRIES) {
    const persistentPayload = { error: response.error.message }
    notify('file-locked-persistent', persistentPayload)
    broadcastDataUpdate({ type: 'file-locked-persistent', ...persistentPayload })
  } else {
    const errorPayload = { ok: false, error: response.error }
    notify('file-changed', errorPayload)
    broadcastDataUpdate({ type: 'file-changed', ...errorPayload })
  }
}
```

- [ ] **Step 4: Update both call sites in `src/main/index.ts`**

In the `did-finish-load` handler, replace `startWatcher(storedPath, mainWindow!)` with:

```ts
startWatcher(storedPath, (channel, payload) => mainWindow?.webContents.send(channel, payload))
```

In the `open-file-dialog` handler, replace `startWatcher(filePath, mainWindow)` with:

```ts
startWatcher(filePath, (channel, payload) => mainWindow?.webContents.send(channel, payload))
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test`
Expected: all pass. Verify: `grep -n "electron" src/main/watcher.ts` → no matches.

- [ ] **Step 6: Commit**

```powershell
git add src/main/watcher.ts src/main/index.ts tests/watcher.test.ts
git commit -m "refactor: watcher uses notify callback, broadcasts lock events, watches add"
```

---

### Task 5: Headless server entry point

**Files:**
- Create: `src/server/config.ts`, `src/server/index.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: `initDataDir` (Task 2), `startServer({ rendererRoot, preferredPort })` (Task 3), `startWatcher(path)` (Task 4), `parseWorkbook`, `setLastSnapshot`.
- Produces: `getConfig(env: NodeJS.ProcessEnv): ServerConfig` where `ServerConfig = { port: number; dataDir: string; xlsxPath: string; rendererRoot: string }`. Env vars: `BUDGET_XLSX_PATH` (required), `PORT` (default 3737), `APP_DATA_DIR` (default `/data/app`), `RENDERER_ROOT` (default `<bundle dir>/../renderer`).

- [ ] **Step 1: Write failing test**

Create `tests/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getConfig } from '../src/server/config'

describe('server config', () => {
  it('throws without BUDGET_XLSX_PATH', () => {
    expect(() => getConfig({})).toThrow(/BUDGET_XLSX_PATH/)
  })

  it('applies defaults', () => {
    const c = getConfig({ BUDGET_XLSX_PATH: '/data/budget/test.xlsx' })
    expect(c.port).toBe(3737)
    expect(c.dataDir).toBe('/data/app')
    expect(c.xlsxPath).toBe('/data/budget/test.xlsx')
    expect(c.rendererRoot).toContain('renderer')
  })

  it('honors overrides', () => {
    const c = getConfig({
      BUDGET_XLSX_PATH: '/x.xlsx',
      PORT: '4000',
      APP_DATA_DIR: '/custom/app',
      RENDERER_ROOT: '/custom/renderer',
    })
    expect(c.port).toBe(4000)
    expect(c.dataDir).toBe('/custom/app')
    expect(c.rendererRoot).toBe('/custom/renderer')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/server/config`.

- [ ] **Step 3: Create `src/server/config.ts`**

```ts
import { join } from 'path'

export interface ServerConfig {
  port: number
  dataDir: string
  xlsxPath: string
  rendererRoot: string
}

export function getConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const xlsxPath = env.BUDGET_XLSX_PATH
  if (!xlsxPath) {
    throw new Error('BUDGET_XLSX_PATH environment variable is required')
  }
  return {
    port: env.PORT ? parseInt(env.PORT, 10) : 3737,
    dataDir: env.APP_DATA_DIR ?? '/data/app',
    xlsxPath,
    rendererRoot: env.RENDERER_ROOT ?? join(__dirname, '../renderer'),
  }
}
```

- [ ] **Step 4: Create `src/server/index.ts`**

```ts
import { existsSync } from 'fs'
import { initDataDir } from '../main/data-dir'
import { parseWorkbook } from '../main/excel'
import { startServer, stopServer, setLastSnapshot } from '../main/server'
import { startWatcher, stopWatcher } from '../main/watcher'
import { getConfig } from './config'

async function main(): Promise<void> {
  const config = getConfig(process.env)
  initDataDir(config.dataDir)

  if (existsSync(config.xlsxPath)) {
    const response = parseWorkbook(config.xlsxPath)
    if (response.ok) {
      setLastSnapshot(response)
      console.log(`Parsed ${response.result.transactions.length} transactions from ${config.xlsxPath}`)
    } else {
      console.warn(`Workbook parse failed at boot: ${response.error.message}`)
    }
  } else {
    console.warn(`Workbook not found yet at ${config.xlsxPath} — waiting for OneDrive mirror`)
  }

  startWatcher(config.xlsxPath)
  const info = await startServer({ rendererRoot: config.rendererRoot, preferredPort: config.port })
  console.log(`budget-app listening on ${info.url}`)

  const shutdown = (): void => {
    console.log('Shutting down...')
    stopWatcher()
    stopServer().then(() => process.exit(0))
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add src/server/config.ts src/server/index.ts tests/config.test.ts
git commit -m "feat: headless server entry configured by env vars"
```

---

### Task 6: Web build tooling (vite + esbuild), local headless verification

**Files:**
- Create: `vite.web.config.ts`, `scripts/build-server.mjs`, `scripts/make-fixture.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `npm run build:web` → `out/renderer/` (static UI) + `out/server/index.js` (self-contained bundle, no node_modules needed at runtime). `npm run start:web` runs it. Task 7's Dockerfile calls `npm run build:web`.

- [ ] **Step 1: Create `vite.web.config.ts`** (mirrors the electron-vite renderer config, which is just the react plugin):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
  },
})
```

- [ ] **Step 2: Create `scripts/build-server.mjs`**

```js
import { build } from 'esbuild'

await build({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: 'out/server/index.js',
  // Optional native deps of chokidar/ws — not needed, excluded from bundle
  external: ['fsevents', 'bufferutil', 'utf-8-validate'],
  sourcemap: true,
})
console.log('Server bundle written to out/server/index.js')
```

- [ ] **Step 3: Create `scripts/make-fixture.mjs`** (generated workbook for local verification — never Eric's real files):

```js
import { createRequire } from 'module'
const XLSX = createRequire(import.meta.url)('xlsx')

const rows = [
  ['date', 'description', 'Budget', 'income', 'debit', 'balance'],
  ['2026-07-01', 'Paycheck', 'Income', 2500, '', 2500],
  ['2026-07-02', 'HEB', 'Groceries', '', 85.5, 2414.5],
  ['2026-07-03', 'Gas station', 'Auto & Gas', '', 40, 2374.5],
]
const ws = XLSX.utils.aoa_to_sheet(rows)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Logbook')
const out = process.argv[2] ?? 'fixture.xlsx'
XLSX.writeFile(wb, out)
console.log(`Fixture workbook written to ${out}`)
```

- [ ] **Step 4: Add npm scripts** to `package.json`:

```json
"build:web": "vite build --config vite.web.config.ts && node scripts/build-server.mjs",
"start:web": "node out/server/index.js"
```

- [ ] **Step 5: Build**

Run: `npm run build:web`
Expected: vite outputs `out/renderer/index.html` + assets; esbuild writes `out/server/index.js` with no errors.

- [ ] **Step 6: Verify headless server end-to-end locally** (PowerShell):

```powershell
node scripts/make-fixture.mjs "$env:TEMP\budget-fixture.xlsx"
$env:BUDGET_XLSX_PATH = "$env:TEMP\budget-fixture.xlsx"
$env:APP_DATA_DIR = "$env:TEMP\budget-app-data"
npm run start:web
```

Expected console: `Parsed 3 transactions from ...` then `budget-app listening on http://<lan-ip>:3737`.
In a second terminal / browser:
- `curl http://localhost:3737/api/health` → `{"ok":true,"hasSnapshot":true}`
- Open `http://localhost:3737` in a browser → dashboard renders the 3 fixture transactions (browser mode, no Electron).
- Re-run `node scripts/make-fixture.mjs "$env:TEMP\budget-fixture.xlsx"` → within ~1s the open browser page updates via WebSocket (watcher → broadcast).
Stop the server with Ctrl+C → `Shutting down...` and clean exit.

- [ ] **Step 7: Commit**

```powershell
git add vite.web.config.ts scripts/build-server.mjs scripts/make-fixture.mjs package.json
git commit -m "feat: web build tooling - vite renderer build + esbuild server bundle"
```

---

### Task 7: Dockerfile

**Files:**
- Create: `Dockerfile`, `.dockerignore`

**Interfaces:**
- Consumes: `npm run build:web` (Task 6), env contract from Task 5.
- Produces: image running `node server/index.js` as a non-root user, healthcheck on `/api/health`, renderer at `/app/renderer`.

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
out
.git
docs
*.md
tests
onedrive-conf
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
# Electron is a devDependency only needed for desktop mode; skip its binary download
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    RENDERER_ROOT=/app/renderer \
    APP_DATA_DIR=/data/app \
    PORT=3737
COPY --from=build /app/out/renderer ./renderer
COPY --from=build /app/out/server ./server
RUN mkdir -p /data/app && chown -R node:node /data/app /app
USER node
EXPOSE 3737
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3737/api/health || exit 1
CMD ["node", "server/index.js"]
```

- [ ] **Step 3: Build and smoke-test the image** (requires Docker; if Docker Desktop is not available on the Windows PC, defer this step's execution to the LXC in Task 9 and note it in the commit message):

```powershell
docker build -t budget-app:phase1 .
node scripts/make-fixture.mjs "$env:TEMP\budget-fixture.xlsx"
docker run --rm -p 3737:3737 `
  -v "$env:TEMP\budget-fixture.xlsx:/data/budget/fixture.xlsx:ro" `
  -e BUDGET_XLSX_PATH=/data/budget/fixture.xlsx `
  budget-app:phase1
```

Expected: `Parsed 3 transactions`, `listening`; `curl http://localhost:3737/api/health` → `{"ok":true,"hasSnapshot":true}`; browser at `http://localhost:3737` renders the dashboard; `docker ps` shows the container healthy after ~30s.

- [ ] **Step 4: Commit**

```powershell
git add Dockerfile .dockerignore
git commit -m "feat: multi-stage Dockerfile for headless budget-app"
```

---

### Task 8: docker-compose with OneDrive mirror sidecar

**Files:**
- Create: `docker-compose.yml`, `onedrive-conf/config`, `onedrive-conf/sync_list`, `.gitignore` additions

**Interfaces:**
- Consumes: image from Task 7; abraunegg client via `driveone/onedrive` image.
- Produces: `docker compose up -d` runs both services; mirror lands under the shared `budget_mirror` volume; budget-app reads it read-only.

- [ ] **Step 1: Create `onedrive-conf/config`**

```
sync_dir = "/onedrive/data"
download_only = "true"
monitor_interval = "30"
cleanup_local_files = "false"
skip_dotfiles = "true"
```

(`download_only` prevents any upload — the server is physically incapable of modifying the spreadsheet. `monitor_interval = "30"` per spec.)

- [ ] **Step 2: Create `onedrive-conf/sync_list`**

```
Desktop/BUDGET/2026/
```

NOTE for executor: the OneDrive-relative path must be verified during first sync on the LXC — with Windows folder backup, the Desktop folder usually appears as `Desktop/` at the OneDrive root, but confirm with `--display-config` / the first `--dry-run` and adjust `sync_list` if the actual path differs.

- [ ] **Step 3: Add to `.gitignore`** (create the file if the repo has none; append if it exists):

```
# onedrive client runtime state (auth tokens, sync db) — config and sync_list ARE committed
onedrive-conf/refresh_token
onedrive-conf/items.sqlite3*
onedrive-conf/*.log
```

- [ ] **Step 4: Create `docker-compose.yml`**

```yaml
services:
  budget-app:
    build: .
    container_name: budget-app
    restart: unless-stopped
    ports:
      - "3737:3737"
    environment:
      # POINTS AT THE TEST COPY. Do not switch to '2026 Budget.xlsx'
      # without Eric's explicit approval.
      BUDGET_XLSX_PATH: "/data/budget/Desktop/BUDGET/2026/2026 Budget - Copy.xlsx"
      APP_DATA_DIR: /data/app
    volumes:
      - budget_mirror:/data/budget:ro
      - app_data:/data/app
    depends_on:
      - onedrive

  onedrive:
    image: driveone/onedrive:edge
    container_name: onedrive-sync
    restart: unless-stopped
    environment:
      ONEDRIVE_DOWNLOADONLY: "1"
    volumes:
      - ./onedrive-conf:/onedrive/conf
      - budget_mirror:/onedrive/data

volumes:
  budget_mirror:
  app_data:
```

- [ ] **Step 5: Validate compose file syntax**

Run: `docker compose config` (or `docker compose config --quiet`)
Expected: renders the resolved config with no errors. (Full stack bring-up happens on the LXC — Task 9 — because OneDrive OAuth is interactive there.)

- [ ] **Step 6: Commit**

```powershell
git add docker-compose.yml onedrive-conf/config onedrive-conf/sync_list .gitignore
git commit -m "feat: compose stack with download-only OneDrive mirror sidecar"
```

---

### Task 9: Deployment guide (Proxmox LXC)

**Files:**
- Create: `docs/DEPLOY.md`

- [ ] **Step 1: Write `docs/DEPLOY.md`** with exactly this content:

````markdown
# Deploying budget-app (Phase 1)

Target: a dedicated LXC on the Proxmox node (alongside the Firefly III TEST
and PROD LXCs). The stack runs Docker inside the LXC.

## 1. Create the LXC

In the Proxmox UI: Debian 12 template, 2 vCPU, 2 GB RAM, 16 GB disk,
static LAN IP. In the container's **Options → Features**, enable
`nesting=1` and `keyctl=1` (required for Docker inside LXC). Unprivileged
container is fine.

## 2. Install Docker

```bash
apt update && apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code

```bash
git clone <repo-remote-or-bundle> /opt/budget-app
cd /opt/budget-app
git checkout feature/phase1-containerize
```

(If the repo has no remote: on the Windows PC run
`git bundle create budget.bundle feature/phase1-containerize` in the
worktree, copy it over with scp, then `git clone budget.bundle /opt/budget-app`.)

## 4. Authorize OneDrive (one-time, interactive)

```bash
cd /opt/budget-app
docker compose run --rm -it onedrive
```

Follow the printed URL, sign in with the Microsoft account, paste the
response URL back. Verify config, then dry-run:

```bash
docker compose run --rm -it onedrive onedrive --confdir /onedrive/conf --display-config
docker compose run --rm -it onedrive onedrive --confdir /onedrive/conf --sync --dry-run
```

Confirm the dry-run lists only files under `BUDGET/2026/`. If the path
prefix differs (Desktop backup naming), fix `onedrive-conf/sync_list`
accordingly and check `BUDGET_XLSX_PATH` in `docker-compose.yml` matches.

## 5. Start the stack

```bash
docker compose up -d --build
docker compose logs -f onedrive     # watch first sync complete
docker compose logs -f budget-app   # expect: Parsed N transactions ... listening
```

## 6. Verify

- `curl http://localhost:3737/api/health` → `{"ok":true,"hasSnapshot":true}`
- From a phone/PC on the LAN: `http://<lxc-ip>:3737` renders the dashboard.
- Edit + save the TEST workbook copy on the Windows PC; the dashboard
  updates within ~90 seconds (OneDrive upload + 30 s mirror poll).

## Rollback

`docker compose down` — nothing outside this LXC changes. The original
Electron app on the Windows PC is untouched and keeps working.

## Prod flip (NOT in this phase)

Changing `BUDGET_XLSX_PATH` to `2026 Budget.xlsx` requires Eric's explicit
approval. The mirror is download-only either way — the server can never
modify the spreadsheet.
````

- [ ] **Step 2: Commit**

```powershell
git add docs/DEPLOY.md
git commit -m "docs: Proxmox LXC deployment guide for phase 1"
```

---

### Task 10: Final verification and handoff

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass (data-dir, store, server, watcher, config, sanity).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit -p tsconfig.node.json; npx tsc --noEmit -p tsconfig.web.json`
Expected: no errors. (If `src/server/` isn't included by `tsconfig.node.json`, add `"src/server/**/*"` to its `include` array and re-run.)

- [ ] **Step 3: Both entry modes work**

- `npm run dev` → Electron window opens, dashboard loads (desktop fallback intact).
- `npm run build:web` then the Task 6 Step 6 verification → headless mode works.

- [ ] **Step 4: Report to Eric for UAT**

Deliverables to demonstrate: headless server running from a fixture workbook locally; Docker image built; compose stack + deployment guide ready for the LXC. Eric decides: deploy to LXC together (following docs/DEPLOY.md), point at the TEST copy (asking his approval per the Excel rule), and only then consider the merge. **No merge to master without Eric's explicit approval.**

---

## Self-review notes

- Spec coverage (Phase 1 scope only): containerized app ✓ (Tasks 5–7), OneDrive mirror with 30s/download-only ✓ (Task 8), chokidar unchanged against mirror ✓ (Task 4 + env path), Electron retirement path with fallback intact ✓ (Task 10), worktree isolation ✓ (Task 0, global constraints), staleness banner — deferred: the `file-locked` WS broadcasts added in Task 4 lay the groundwork; the last-synced UI banner ships with Phase 2's UI work (noted for the Phase 2 plan).
- Caddy/Pocket ID/chat/approvals/ntfy: Phases 2–4, separate plans.
- Type consistency: `startServer({ rendererRoot, preferredPort })` used identically in Tasks 3, 5; `WatcherNotify` signature matches Task 4 and 5 usage; `ServerConfig` fields consistent across Tasks 5–7 env vars.
