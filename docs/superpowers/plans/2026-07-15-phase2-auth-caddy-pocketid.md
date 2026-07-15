# Phase 2: Caddy + Pocket ID Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the containerized Budget Dashboard behind HTTPS (Caddy internal CA) with passkey login via Pocket ID (OIDC), server-side sessions in SQLite, and server-enforced admin/member roles.

**Architecture:** Caddy terminates TLS for two internal hostnames (`budget.home.arpa` → budget-app, `id.home.arpa` → Pocket ID) using its internal CA. budget-app becomes an OIDC confidential client (authorization code + PKCE via `openid-client` v6); on callback it derives the role from the Pocket ID `groups` claim (`budget-admin` → admin) and stores a server-side session in SQLite (`node:sqlite`, no native deps). A gate in the hand-rolled HTTP server rejects every unauthenticated request (401 for API, 302 → login for navigations) and authenticates WebSocket upgrades by session cookie.

**Tech Stack:** Node 24 (`node:sqlite` DatabaseSync), `openid-client` v6 (only new npm dependency), Caddy 2, Pocket ID v1, existing hand-rolled `http` server (no Express), vitest 3.

This is spec rollout phase 2 of `docs/superpowers/specs/2026-07-13-firefly-chat-approval-design.md`. Phases 3 (read-only Firefly chat) and 4 (approval queue + ntfy) get their own plans; the SQLite bootstrap added here is where their tables will live later.

## Global Constraints

- Working copy `C:\Users\eric1\OneDrive\Desktop\BUDGET\Dev` stays UNTOUCHED — all work in the `C:\dev\budget-phase1` worktree on branch `feature/phase2-auth`; merge only on Eric's explicit approval.
- `BUDGET_XLSX_PATH` keeps pointing at the TEST copy (`2026 Budget - Copy.xlsx`). Never the prod workbook.
- No new native npm modules (the LXC kills BuildKit `npm ci`; classic builder `DOCKER_BUILDKIT=0` is mandatory on the LXC — sessions therefore use built-in `node:sqlite`, not better-sqlite3).
- `TZ: America/Chicago` stays on budget-app (and is set on pocket-id).
- Admin group name: `budget-admin` (Pocket ID group; env `ADMIN_GROUP` default).
- Session lifetime: 12 hours (spec), env `SESSION_TTL_HOURS` default `12`.
- Cookies: `HttpOnly; Secure; SameSite=Lax`. App is only reachable via Caddy HTTPS; the 3737 port mapping is REMOVED from compose.
- Auth is ON by default: missing OIDC env vars must crash the server at boot unless `AUTH_DISABLED=1` is set explicitly (local dev only).
- OIDC scope requested: `openid profile email groups`. Redirect URI: `${APP_BASE_URL}/auth/callback`.
- Hostnames: `budget.home.arpa` and `id.home.arpa` (RFC 8375 home network domain), configurable via `.env` (`BUDGET_HOST`, `POCKET_ID_HOST`). Secrets live in `.env` (gitignored); `.env.example` is committed.
- Commit after every task; message style `feat:`/`fix:`/`chore:` as in Phase 1 history.

## File Structure

New files:

| File | Responsibility |
|---|---|
| `src/server/db.ts` | Open/own the SQLite handle (`/data/app/budget-app.db`), create schema (sessions now; later phases add proposals/audit/chat tables here) |
| `src/server/auth/cookies.ts` | Cookie parsing + `Set-Cookie` serialization for the session and login cookies |
| `src/server/auth/session-store.ts` | CRUD for the `sessions` table: create/get/delete/sweep, expiry |
| `src/server/auth/oidc.ts` | openid-client v6 wrapper: lazy discovery, beginLogin (PKCE+state), completeLogin (code exchange → claims), claims→user mapping |
| `src/server/auth/runtime.ts` | `initAuth()` → AuthRuntime: routes `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/logged-out`, `/api/me`; session lookup from a request |
| `caddy/Caddyfile` | TLS-internal sites for both hostnames |
| `.env.example` | Documented template for compose secrets/hostnames |
| `tests/db.test.ts`, `tests/cookies.test.ts`, `tests/session-store.test.ts`, `tests/oidc.test.ts`, `tests/auth-routes.test.ts`, `tests/auth-guard.test.ts` | Per-module tests |

Modified files:

| File | Change |
|---|---|
| `package.json` / `package-lock.json` | add `openid-client`, bump `@types/node` to ^24 |
| `Dockerfile` | `node:22-alpine` → `node:24-alpine` (node:sqlite is stable in 24) |
| `scripts/build-server.mjs` | `target: 'node22'` → `'node24'` |
| `src/shared/types.ts` | add `UserRole`, `AuthUser` |
| `src/server/config.ts` | add `auth: AuthEnvConfig \| null` (env validation, AUTH_DISABLED escape hatch) |
| `src/main/server.ts` | async request handler; auth gate (401/302), Origin check on mutations, WS upgrade auth; `StartServerOptions.auth` |
| `src/server/index.ts` | openDb, initAuth, hourly session sweep, loud auth-mode logging |
| `src/renderer/src/api.ts` | `getMe()`, `logout()`, redirect to `/auth/login` on any 401 |
| `src/renderer/src/App.tsx` + `index.css` | user badge + Sign out button in the header |
| `docker-compose.yml` | add caddy, pocket-id; wire budget-app env/volumes; drop published 3737 |
| `tests/config.test.ts` | auth-config cases; existing cases get `AUTH_DISABLED: '1'` |
| `docs/DEPLOY.md` | Phase 2 runbook: DNS, Pocket ID setup, OIDC client registration, CA trust |
| `.gitignore` | add `.env` |

---

### Task 1: Toolchain baseline — Node 24 + openid-client

**Files:**
- Modify: `package.json` (deps), `Dockerfile:1,10`, `scripts/build-server.mjs:7`

**Interfaces:**
- Produces: `openid-client` importable; `node:sqlite` available at runtime (Node 24 in image; local dev already on v24.13).

- [ ] **Step 1: Add dependency and bump types**

```bash
cd /c/dev/budget-phase1
npm install openid-client@^6
npm install -D @types/node@^24
```

- [ ] **Step 2: Bump Node in Dockerfile**

In `Dockerfile`, change both stage bases (lines 1 and 10):

```dockerfile
FROM node:24-alpine AS build
```
```dockerfile
FROM node:24-alpine
```

- [ ] **Step 3: Bump esbuild target**

In `scripts/build-server.mjs` change `target: 'node22'` to:

```js
  target: 'node24',
```

- [ ] **Step 4: Verify tests and web build still pass**

Run: `npm test`
Expected: all suites PASS (7 files, no failures)

Run: `npm run build:web`
Expected: exits 0, prints "Server bundle written to out/server/index.js"

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json Dockerfile scripts/build-server.mjs
git commit -m "chore: Node 24 baseline + openid-client dependency for Phase 2 auth"
```

---

### Task 2: Auth config block in config.ts

**Files:**
- Modify: `src/server/config.ts`, `src/shared/types.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 5–8):

```ts
// src/shared/types.ts
export type UserRole = 'admin' | 'member'
export interface AuthUser { sub: string; name: string; email: string; role: UserRole }

// src/server/config.ts
export interface AuthEnvConfig {
  appBaseUrl: string      // no trailing slash
  issuer: string          // no trailing slash
  clientId: string
  clientSecret: string
  adminGroup: string      // default 'budget-admin'
  sessionTtlHours: number // default 12
}
export interface ServerConfig { /* existing fields */; auth: AuthEnvConfig | null }
```

- [ ] **Step 1: Write the failing tests**

In `tests/config.test.ts`, add `AUTH_DISABLED: '1'` to the env object of each of the four existing cases (they must keep passing once auth is required), then append:

```ts
describe('auth config', () => {
  const base = {
    BUDGET_XLSX_PATH: '/x.xlsx',
    APP_BASE_URL: 'https://budget.home.arpa/',
    OIDC_ISSUER: 'https://id.home.arpa/',
    OIDC_CLIENT_ID: 'abc',
    OIDC_CLIENT_SECRET: 'shh',
  }

  it('throws when auth env vars are missing and AUTH_DISABLED is not set', () => {
    expect(() => getConfig({ BUDGET_XLSX_PATH: '/x.xlsx' })).toThrow(/AUTH_DISABLED/)
  })

  it('returns null auth when AUTH_DISABLED=1', () => {
    const c = getConfig({ BUDGET_XLSX_PATH: '/x.xlsx', AUTH_DISABLED: '1' })
    expect(c.auth).toBeNull()
  })

  it('parses the auth block and strips trailing slashes', () => {
    const c = getConfig(base)
    expect(c.auth).toEqual({
      appBaseUrl: 'https://budget.home.arpa',
      issuer: 'https://id.home.arpa',
      clientId: 'abc',
      clientSecret: 'shh',
      adminGroup: 'budget-admin',
      sessionTtlHours: 12,
    })
  })

  it('honors ADMIN_GROUP and SESSION_TTL_HOURS overrides', () => {
    const c = getConfig({ ...base, ADMIN_GROUP: 'chiefs', SESSION_TTL_HOURS: '48' })
    expect(c.auth?.adminGroup).toBe('chiefs')
    expect(c.auth?.sessionTtlHours).toBe(48)
  })

  it('throws on a non-positive SESSION_TTL_HOURS', () => {
    expect(() => getConfig({ ...base, SESSION_TTL_HOURS: '0' })).toThrow(/SESSION_TTL_HOURS/)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/config.test.ts`
Expected: 4 existing pass, 5 new FAIL (`c.auth` undefined / no throw)

- [ ] **Step 3: Implement**

In `src/shared/types.ts` append:

```ts
// ── Auth (Phase 2) ────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'member'

export interface AuthUser {
  sub: string
  name: string
  email: string
  role: UserRole
}
```

In `src/server/config.ts`, add the interface, extend `ServerConfig` with `auth: AuthEnvConfig | null`, and implement:

```ts
export interface AuthEnvConfig {
  appBaseUrl: string
  issuer: string
  clientId: string
  clientSecret: string
  adminGroup: string
  sessionTtlHours: number
}

function getAuthConfig(env: NodeJS.ProcessEnv): AuthEnvConfig | null {
  if (env.AUTH_DISABLED === '1') return null
  const { APP_BASE_URL, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = env
  if (!APP_BASE_URL || !OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) {
    throw new Error(
      'Auth is enabled by default and requires APP_BASE_URL, OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET. ' +
        'Set AUTH_DISABLED=1 to run without authentication (local development only).'
    )
  }
  const ttl = env.SESSION_TTL_HOURS ? Number(env.SESSION_TTL_HOURS) : 12
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error('SESSION_TTL_HOURS must be a positive number')
  }
  return {
    appBaseUrl: APP_BASE_URL.replace(/\/+$/, ''),
    issuer: OIDC_ISSUER.replace(/\/+$/, ''),
    clientId: OIDC_CLIENT_ID,
    clientSecret: OIDC_CLIENT_SECRET,
    adminGroup: env.ADMIN_GROUP ?? 'budget-admin',
    sessionTtlHours: ttl,
  }
}
```

and in `getConfig`'s returned object add `auth: getAuthConfig(env),`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config.test.ts`
Expected: 9 PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/server/config.ts tests/config.test.ts
git commit -m "feat: auth env config with AUTH_DISABLED escape hatch"
```

---

### Task 3: SQLite bootstrap (db.ts)

**Files:**
- Create: `src/server/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `openDb(dataDir: string): DatabaseSync` (idempotent singleton), `getDb(): DatabaseSync` (throws if not opened), `closeDb(): void`. Table `sessions(id TEXT PK, sub, name, email, role CHECK admin|member, created_at INTEGER, expires_at INTEGER)`.

- [ ] **Step 1: Write the failing test**

Create `tests/db.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, getDb, closeDb } from '../src/server/db'

describe('db', () => {
  afterEach(() => closeDb())

  it('getDb throws before openDb', () => {
    expect(() => getDb()).toThrow(/openDb/)
  })

  it('creates the database file and sessions table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-db-test-'))
    openDb(dir)
    expect(existsSync(join(dir, 'budget-app.db'))).toBe(true)
    const row = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
      .get() as { name: string } | undefined
    expect(row?.name).toBe('sessions')
  })

  it('openDb is idempotent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-db-test-'))
    const a = openDb(dir)
    const b = openDb(dir)
    expect(a).toBe(b)
  })

  it('rejects an invalid role via CHECK constraint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-db-test-'))
    openDb(dir)
    expect(() =>
      getDb()
        .prepare('INSERT INTO sessions (id, sub, name, email, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('s1', 'u1', 'n', 'e', 'superuser', 0, 0)
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — cannot resolve `../src/server/db`

- [ ] **Step 3: Implement**

Create `src/server/db.ts`:

```ts
import { join } from 'path'
import { mkdirSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'

let db: DatabaseSync | null = null

// Phase 2: sessions. Later phases add proposals / audit_log / chat tables here.
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
`

export function openDb(dataDir: string): DatabaseSync {
  if (db) return db
  mkdirSync(dataDir, { recursive: true })
  db = new DatabaseSync(join(dataDir, 'budget-app.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database not opened — call openDb(dataDir) first')
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/db.ts tests/db.test.ts
git commit -m "feat: SQLite bootstrap via node:sqlite with sessions schema"
```

---

### Task 4: Cookie helpers + session store

**Files:**
- Create: `src/server/auth/cookies.ts`, `src/server/auth/session-store.ts`
- Test: `tests/cookies.test.ts`, `tests/session-store.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 6–7):

```ts
// cookies.ts
export const SESSION_COOKIE = 'budget_session'
export const LOGIN_COOKIE = 'budget_login'
export function parseCookies(header: string | undefined): Record<string, string>
export function sessionCookie(id: string, maxAgeSeconds: number): string
export function clearSessionCookie(): string
export function loginCookie(id: string): string   // Max-Age 600
export function clearLoginCookie(): string

// session-store.ts
export interface SessionRecord extends AuthUser { id: string; expiresAt: number }
export function createSession(user: AuthUser, ttlHours: number): SessionRecord
export function getSession(id: string): SessionRecord | null  // expired ⇒ deleted, null
export function deleteSession(id: string): void
export function sweepExpiredSessions(): number
```

- [ ] **Step 1: Write the failing cookie tests**

Create `tests/cookies.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseCookies, sessionCookie, clearSessionCookie, loginCookie, SESSION_COOKIE, LOGIN_COOKIE } from '../src/server/auth/cookies'

describe('cookies', () => {
  it('parses a cookie header', () => {
    expect(parseCookies('a=1; budget_session=abc%3D; b = 2')).toEqual({ a: '1', budget_session: 'abc=', b: '2' })
  })

  it('returns empty object for undefined header', () => {
    expect(parseCookies(undefined)).toEqual({})
  })

  it('serializes a hardened session cookie', () => {
    const c = sessionCookie('xyz', 43200)
    expect(c).toBe(`${SESSION_COOKIE}=xyz; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`)
  })

  it('clears the session cookie with Max-Age=0', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0')
  })

  it('login cookie is short-lived', () => {
    expect(loginCookie('l1')).toBe(`${LOGIN_COOKIE}=l1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/cookies.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cookies.ts**

Create `src/server/auth/cookies.ts`:

```ts
export const SESSION_COOKIE = 'budget_session'
export const LOGIN_COOKIE = 'budget_login'

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!name) continue
    try {
      out[name] = decodeURIComponent(value)
    } catch {
      out[name] = value
    }
  }
  return out
}

function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`
}

export function sessionCookie(id: string, maxAgeSeconds: number): string {
  return cookie(SESSION_COOKIE, id, maxAgeSeconds)
}

export function clearSessionCookie(): string {
  return cookie(SESSION_COOKIE, '', 0)
}

export function loginCookie(id: string): string {
  return cookie(LOGIN_COOKIE, id, 600)
}

export function clearLoginCookie(): string {
  return cookie(LOGIN_COOKIE, '', 0)
}
```

Run: `npx vitest run tests/cookies.test.ts` — Expected: 5 PASS

- [ ] **Step 4: Write the failing session-store tests**

Create `tests/session-store.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, closeDb } from '../src/server/db'
import { createSession, getSession, deleteSession, sweepExpiredSessions } from '../src/server/auth/session-store'
import type { AuthUser } from '../src/shared/types'

const eric: AuthUser = { sub: 'u-1', name: 'Eric', email: 'eric@example.com', role: 'admin' }

describe('session store', () => {
  beforeAll(() => openDb(mkdtempSync(join(tmpdir(), 'budget-sess-test-'))))
  afterAll(() => closeDb())

  it('creates and reads back a session', () => {
    const s = createSession(eric, 12)
    expect(s.id).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 random bytes, base64url
    expect(s.expiresAt).toBeGreaterThan(Date.now())
    expect(getSession(s.id)).toEqual(s)
  })

  it('returns null for an unknown id', () => {
    expect(getSession('nope')).toBeNull()
  })

  it('expired sessions read as null and are deleted', () => {
    const s = createSession(eric, -1) // already expired
    expect(getSession(s.id)).toBeNull()
    expect(getSession(s.id)).toBeNull()
  })

  it('deleteSession removes the row', () => {
    const s = createSession(eric, 12)
    deleteSession(s.id)
    expect(getSession(s.id)).toBeNull()
  })

  it('sweepExpiredSessions removes only expired rows', () => {
    const live = createSession(eric, 12)
    createSession(eric, -1)
    createSession(eric, -1)
    expect(sweepExpiredSessions()).toBe(2)
    expect(getSession(live.id)).not.toBeNull()
  })
})
```

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run tests/session-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 6: Implement session-store.ts**

Create `src/server/auth/session-store.ts`:

```ts
import { randomBytes } from 'crypto'
import type { AuthUser, UserRole } from '../../shared/types'
import { getDb } from '../db'

export interface SessionRecord extends AuthUser {
  id: string
  expiresAt: number
}

interface SessionRow {
  id: string
  sub: string
  name: string
  email: string
  role: UserRole
  expires_at: number
}

export function createSession(user: AuthUser, ttlHours: number): SessionRecord {
  const id = randomBytes(32).toString('base64url')
  const now = Date.now()
  const expiresAt = now + ttlHours * 3_600_000
  getDb()
    .prepare('INSERT INTO sessions (id, sub, name, email, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, user.sub, user.name, user.email, user.role, now, expiresAt)
  return { id, expiresAt, sub: user.sub, name: user.name, email: user.email, role: user.role }
}

export function getSession(id: string): SessionRecord | null {
  const row = getDb()
    .prepare('SELECT id, sub, name, email, role, expires_at FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined
  if (!row) return null
  if (row.expires_at <= Date.now()) {
    deleteSession(id)
    return null
  }
  return { id: row.id, sub: row.sub, name: row.name, email: row.email, role: row.role, expiresAt: row.expires_at }
}

export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function sweepExpiredSessions(): number {
  const result = getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  return Number(result.changes)
}
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run tests/session-store.test.ts tests/cookies.test.ts`
Expected: 10 PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/auth/cookies.ts src/server/auth/session-store.ts tests/cookies.test.ts tests/session-store.test.ts
git commit -m "feat: SQLite session store and hardened cookie helpers"
```

---

### Task 5: OIDC flow module

**Files:**
- Create: `src/server/auth/oidc.ts`
- Test: `tests/oidc.test.ts`

**Interfaces:**
- Consumes: `AuthEnvConfig` (Task 2), `AuthUser` (Task 2).
- Produces (consumed by Task 6):

```ts
export function userFromClaims(claims: Record<string, unknown>, adminGroup: string): AuthUser  // throws without sub
export function takePendingLogin(loginId: string): { verifier: string; state: string; createdAt: number } | null
export async function beginLogin(env: AuthEnvConfig): Promise<{ url: string; loginId: string }>
export async function completeLogin(env: AuthEnvConfig, loginId: string, callbackUrl: URL): Promise<AuthUser>
```

Note: `beginLogin`/`completeLogin` hit the network (OIDC discovery + token endpoint) and are exercised in UAT against real Pocket ID, not unit tests. Unit tests cover the pure parts: claims mapping and the pending-login table.

- [ ] **Step 1: Write the failing tests**

Create `tests/oidc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { userFromClaims, takePendingLogin, _setPendingLogin } from '../src/server/auth/oidc'

describe('userFromClaims', () => {
  it('maps an admin from the groups claim', () => {
    const u = userFromClaims(
      { sub: 'u1', name: 'Eric', email: 'e@x.com', groups: ['family', 'budget-admin'] },
      'budget-admin'
    )
    expect(u).toEqual({ sub: 'u1', name: 'Eric', email: 'e@x.com', role: 'admin' })
  })

  it('defaults to member without the admin group', () => {
    expect(userFromClaims({ sub: 'u2', name: 'Kid', groups: ['family'] }, 'budget-admin').role).toBe('member')
  })

  it('treats a missing or malformed groups claim as member', () => {
    expect(userFromClaims({ sub: 'u3' }, 'budget-admin').role).toBe('member')
    expect(userFromClaims({ sub: 'u3', groups: 'budget-admin' }, 'budget-admin').role).toBe('member')
  })

  it('falls back name → preferred_username → email → sub', () => {
    expect(userFromClaims({ sub: 'u4', preferred_username: 'ricky' }, 'g').name).toBe('ricky')
    expect(userFromClaims({ sub: 'u4', email: 'r@x.com' }, 'g').name).toBe('r@x.com')
    expect(userFromClaims({ sub: 'u4' }, 'g').name).toBe('u4')
  })

  it('throws without a sub claim', () => {
    expect(() => userFromClaims({ name: 'ghost' }, 'g')).toThrow(/sub/)
  })
})

describe('pending logins', () => {
  it('returns an entry exactly once', () => {
    _setPendingLogin('l1', { verifier: 'v', state: 's', createdAt: Date.now() })
    expect(takePendingLogin('l1')).toMatchObject({ verifier: 'v', state: 's' })
    expect(takePendingLogin('l1')).toBeNull()
  })

  it('expires entries older than 10 minutes', () => {
    _setPendingLogin('l2', { verifier: 'v', state: 's', createdAt: Date.now() - 11 * 60 * 1000 })
    expect(takePendingLogin('l2')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/oidc.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `src/server/auth/oidc.ts`:

```ts
import { randomBytes } from 'crypto'
import * as oidc from 'openid-client'
import type { AuthEnvConfig } from '../config'
import type { AuthUser } from '../../shared/types'

// ── Claims → user (pure) ─────────────────────────────────────────────────────

function firstString(...values: unknown[]): string | undefined {
  return values.find((v): v is string => typeof v === 'string' && v.length > 0)
}

export function userFromClaims(claims: Record<string, unknown>, adminGroup: string): AuthUser {
  const sub = typeof claims.sub === 'string' ? claims.sub : ''
  if (!sub) throw new Error('ID token has no sub claim')
  const groups = Array.isArray(claims.groups)
    ? (claims.groups as unknown[]).filter((g): g is string => typeof g === 'string')
    : []
  return {
    sub,
    name: firstString(claims.name, claims.preferred_username, claims.email) ?? sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    role: groups.includes(adminGroup) ? 'admin' : 'member',
  }
}

// ── Pending login attempts (PKCE verifier + state, keyed by login cookie) ────

export interface PendingLogin {
  verifier: string
  state: string
  createdAt: number
}

const LOGIN_TTL_MS = 10 * 60 * 1000
const pending = new Map<string, PendingLogin>()

/** Test seam — pending logins are otherwise only created by beginLogin. */
export function _setPendingLogin(loginId: string, entry: PendingLogin): void {
  pending.set(loginId, entry)
}

export function takePendingLogin(loginId: string): PendingLogin | null {
  const now = Date.now()
  for (const [key, entry] of pending) {
    if (now - entry.createdAt > LOGIN_TTL_MS) pending.delete(key)
  }
  const entry = pending.get(loginId) ?? null
  pending.delete(loginId)
  return entry
}

// ── openid-client v6 wiring ──────────────────────────────────────────────────

let discovered: Promise<oidc.Configuration> | null = null

function getOidcConfiguration(env: AuthEnvConfig): Promise<oidc.Configuration> {
  if (!discovered) {
    // Lazy + memoized: Pocket ID may still be booting when budget-app starts.
    discovered = oidc.discovery(new URL(env.issuer), env.clientId, env.clientSecret).catch((err) => {
      discovered = null // allow retry on the next login attempt
      throw err
    })
  }
  return discovered
}

export async function beginLogin(env: AuthEnvConfig): Promise<{ url: string; loginId: string }> {
  const config = await getOidcConfiguration(env)
  const verifier = oidc.randomPKCECodeVerifier()
  const challenge = await oidc.calculatePKCECodeChallenge(verifier)
  const state = oidc.randomState()
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${env.appBaseUrl}/auth/callback`,
    scope: 'openid profile email groups',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  const loginId = randomBytes(16).toString('hex')
  pending.set(loginId, { verifier, state, createdAt: Date.now() })
  return { url: url.href, loginId }
}

export async function completeLogin(env: AuthEnvConfig, loginId: string, callbackUrl: URL): Promise<AuthUser> {
  const entry = takePendingLogin(loginId)
  if (!entry) throw new Error('Login attempt expired or unknown — start again at /auth/login')
  const config = await getOidcConfiguration(env)
  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: entry.verifier,
    expectedState: entry.state,
  })
  const claims = tokens.claims()
  if (!claims) throw new Error('Token response contained no ID token')
  let merged: Record<string, unknown> = { ...claims }
  if (!Array.isArray(merged.groups)) {
    // Some IdP configs expose groups only via the userinfo endpoint
    const info = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub)
    merged = { ...merged, ...info }
  }
  return userFromClaims(merged, env.adminGroup)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/oidc.test.ts`
Expected: 7 PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/oidc.ts tests/oidc.test.ts
git commit -m "feat: OIDC login flow (PKCE) and groups-claim role mapping"
```

---

### Task 6: Auth runtime + HTTP routes

**Files:**
- Create: `src/server/auth/runtime.ts`
- Test: `tests/auth-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5 exports.
- Produces (consumed by Tasks 7–8):

```ts
export interface OidcFlow {
  beginLogin(env: AuthEnvConfig): Promise<{ url: string; loginId: string }>
  completeLogin(env: AuthEnvConfig, loginId: string, callbackUrl: URL): Promise<AuthUser>
}
export interface AuthRuntime {
  env: AuthEnvConfig
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> // true = handled (/auth/*, /api/me)
  getSessionUser(req: IncomingMessage): SessionRecord | null
}
export function initAuth(env: AuthEnvConfig, flow?: OidcFlow): AuthRuntime  // flow defaults to the real oidc module
```

- [ ] **Step 1: Write the failing tests**

Create `tests/auth-routes.test.ts`. It boots a bare `http` server around `handleRequest` with a stubbed `OidcFlow` — no network, no openid-client:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'http'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, closeDb } from '../src/server/db'
import { initAuth, type OidcFlow } from '../src/server/auth/runtime'
import { createSession } from '../src/server/auth/session-store'
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
  beginLogin: async () => ({ url: 'https://id.home.arpa/authorize?fake=1', loginId: 'login-1' }),
  completeLogin: async (_env, loginId) => {
    if (loginId !== 'login-1') throw new Error('unknown login')
    return { sub: 'u1', name: 'Eric', email: 'e@x.com', role: 'admin' }
  },
}

let server: Server
let base: string

beforeAll(async () => {
  openDb(mkdtempSync(join(tmpdir(), 'budget-auth-routes-')))
  const auth = initAuth(env, stubFlow)
  server = createServer((req, res) => {
    void auth.handleRequest(req, res).then((handled) => {
      if (!handled) {
        res.writeHead(418)
        res.end()
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  closeDb()
})

describe('auth routes', () => {
  it('GET /auth/login 302s to the IdP and sets the login cookie', async () => {
    const r = await fetch(`${base}/auth/login`, { redirect: 'manual' })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('https://id.home.arpa/authorize?fake=1')
    expect(r.headers.get('set-cookie')).toContain('budget_login=login-1')
  })

  it('GET /auth/callback creates a session and redirects home', async () => {
    const r = await fetch(`${base}/auth/callback?code=x&state=y`, {
      redirect: 'manual',
      headers: { cookie: 'budget_login=login-1' },
    })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('/')
    const setCookie = r.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('budget_session=')
    expect(setCookie).toContain('HttpOnly')
  })

  it('GET /auth/callback without the login cookie is a 400', async () => {
    const r = await fetch(`${base}/auth/callback?code=x&state=y`, { redirect: 'manual' })
    expect(r.status).toBe(400)
  })

  it('GET /api/me returns the session user', async () => {
    const s = createSession({ sub: 'u9', name: 'Member', email: 'm@x.com', role: 'member' }, 12)
    const r = await fetch(`${base}/api/me`, { headers: { cookie: `budget_session=${s.id}` } })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ sub: 'u9', name: 'Member', email: 'm@x.com', role: 'member' })
  })

  it('GET /api/me without a session is a 401', async () => {
    const r = await fetch(`${base}/api/me`)
    expect(r.status).toBe(401)
  })

  it('POST /auth/logout deletes the session and clears the cookie', async () => {
    const s = createSession({ sub: 'u9', name: 'Member', email: 'm@x.com', role: 'member' }, 12)
    const r = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie: `budget_session=${s.id}` } })
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0')
    const me = await fetch(`${base}/api/me`, { headers: { cookie: `budget_session=${s.id}` } })
    expect(me.status).toBe(401)
  })

  it('GET /auth/logged-out serves a page with a sign-in link', async () => {
    const r = await fetch(`${base}/auth/logged-out`)
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('/auth/login')
  })

  it('passes through unrelated paths', async () => {
    const r = await fetch(`${base}/api/snapshot`)
    expect(r.status).toBe(418) // our test server's "not handled" marker
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `src/server/auth/runtime.ts`:

```ts
import type { IncomingMessage, ServerResponse } from 'http'
import type { AuthEnvConfig } from '../config'
import type { AuthUser } from '../../shared/types'
import { createSession, deleteSession, getSession, type SessionRecord } from './session-store'
import {
  parseCookies,
  sessionCookie,
  clearSessionCookie,
  loginCookie,
  clearLoginCookie,
  SESSION_COOKIE,
  LOGIN_COOKIE,
} from './cookies'
import * as realFlow from './oidc'

export interface OidcFlow {
  beginLogin(env: AuthEnvConfig): Promise<{ url: string; loginId: string }>
  completeLogin(env: AuthEnvConfig, loginId: string, callbackUrl: URL): Promise<AuthUser>
}

export interface AuthRuntime {
  env: AuthEnvConfig
  /** Handles /auth/* and /api/me. Returns true when the request was handled. */
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean>
  getSessionUser(req: IncomingMessage): SessionRecord | null
}

const LOGGED_OUT_HTML = `<!doctype html>
<html><head><title>Signed out</title></head>
<body style="font-family: system-ui; background: #0d1220; color: #e6ecf5; display: grid; place-items: center; height: 100vh; margin: 0">
<div style="text-align: center"><h1>Signed out</h1><p><a href="/auth/login" style="color: #7aa2ff">Sign in again</a></p></div>
</body></html>`

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

function text(res: ServerResponse, status: number, body: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { 'Content-Type': 'text/plain', ...headers })
  res.end(body)
}

export function initAuth(env: AuthEnvConfig, flow: OidcFlow = realFlow): AuthRuntime {
  function getSessionUser(req: IncomingMessage): SessionRecord | null {
    const id = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    return id ? getSession(id) : null
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const urlPath = (req.url ?? '/').split('?')[0]

    if (urlPath === '/auth/login' && req.method === 'GET') {
      try {
        const { url, loginId } = await flow.beginLogin(env)
        res.writeHead(302, { Location: url, 'Set-Cookie': loginCookie(loginId) })
        res.end()
      } catch (err) {
        console.error('OIDC login failed:', err)
        text(res, 502, 'Sign-in is unavailable (identity provider unreachable). Try again shortly.')
      }
      return true
    }

    if (urlPath === '/auth/callback' && req.method === 'GET') {
      const loginId = parseCookies(req.headers.cookie)[LOGIN_COOKIE]
      if (!loginId) {
        text(res, 400, 'Login attempt expired — go to /auth/login and try again.', {
          'Set-Cookie': clearLoginCookie(),
        })
        return true
      }
      try {
        const user = await flow.completeLogin(env, loginId, new URL(req.url ?? '/', env.appBaseUrl))
        const session = createSession(user, env.sessionTtlHours)
        res.writeHead(302, {
          Location: '/',
          'Set-Cookie': [sessionCookie(session.id, env.sessionTtlHours * 3600), clearLoginCookie()],
        })
        res.end()
        console.log(`Signed in: ${user.name} (${user.sub}) as ${user.role}`)
      } catch (err) {
        console.error('OIDC callback failed:', err)
        text(res, 400, 'Sign-in failed — go to /auth/login and try again.', { 'Set-Cookie': clearLoginCookie() })
      }
      return true
    }

    if (urlPath === '/auth/logout' && req.method === 'POST') {
      const id = parseCookies(req.headers.cookie)[SESSION_COOKIE]
      if (id) deleteSession(id)
      json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() })
      return true
    }

    if (urlPath === '/auth/logged-out' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(LOGGED_OUT_HTML)
      return true
    }

    if (urlPath === '/api/me' && req.method === 'GET') {
      const session = getSessionUser(req)
      if (!session) {
        json(res, 401, { error: 'Not signed in' })
      } else {
        json(res, 200, { sub: session.sub, name: session.name, email: session.email, role: session.role })
      }
      return true
    }

    return false
  }

  return { env, handleRequest, getSessionUser }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: 8 PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/runtime.ts tests/auth-routes.test.ts
git commit -m "feat: auth runtime with login/callback/logout routes and /api/me"
```

---

### Task 7: Server gate — HTTP, Origin check, WebSocket

**Files:**
- Modify: `src/main/server.ts`
- Test: `tests/auth-guard.test.ts`

**Interfaces:**
- Consumes: `AuthRuntime` (Task 6), `createSession` (Task 4).
- Produces: `StartServerOptions` gains `auth?: AuthRuntime | null`. Without `auth` (Electron mode, existing tests) behavior is unchanged. With `auth`:
  - `/auth/*` and `/api/me` are delegated to `auth.handleRequest`.
  - `/api/health` stays public.
  - Everything else without a valid session: `401` JSON for `/api/*`, `302 → /auth/login` otherwise.
  - Non-GET/HEAD requests with a session and an `Origin` header not matching `appBaseUrl`'s origin: `403`.
  - WebSocket connections without a valid session cookie are closed with code `4401`.

- [ ] **Step 1: Write the failing tests**

Create `tests/auth-guard.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import WebSocket from 'ws'
import { openDb, closeDb } from '../src/server/db'
import { initAuth, type OidcFlow } from '../src/server/auth/runtime'
import { createSession } from '../src/server/auth/session-store'
import { startServer, stopServer } from '../src/main/server'
import { initDataDir } from '../src/main/data-dir'
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
let cookie: string

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-guard-test-'))
  initDataDir(dir)
  openDb(dir)
  writeFileSync(join(dir, 'index.html'), '<html><body>app</body></html>')
  const info = await startServer({ rendererRoot: dir, preferredPort: 4111, auth: initAuth(env, stubFlow) })
  base = `http://127.0.0.1:${info.port}`
  const s = createSession({ sub: 'u1', name: 'Eric', email: 'e@x.com', role: 'admin' }, 12)
  cookie = `budget_session=${s.id}`
})

afterAll(async () => {
  await stopServer()
  closeDb()
})

describe('auth gate', () => {
  it('leaves /api/health public', async () => {
    const r = await fetch(`${base}/api/health`)
    expect(r.status).toBe(200)
  })

  it('401s API requests without a session', async () => {
    const r = await fetch(`${base}/api/snapshot`)
    expect(r.status).toBe(401)
  })

  it('302s page navigations without a session to /auth/login', async () => {
    const r = await fetch(`${base}/`, { redirect: 'manual' })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('/auth/login')
  })

  it('401s with an expired session cookie', async () => {
    const dead = createSession({ sub: 'u1', name: 'Eric', email: 'e@x.com', role: 'admin' }, -1)
    const r = await fetch(`${base}/api/snapshot`, { headers: { cookie: `budget_session=${dead.id}` } })
    expect(r.status).toBe(401)
  })

  it('serves API and static content with a valid session', async () => {
    const api = await fetch(`${base}/api/budgets`, { headers: { cookie } })
    expect(api.status).toBe(200)
    const page = await fetch(`${base}/`, { headers: { cookie } })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('app')
  })

  it('routes /api/me through the auth runtime', async () => {
    const r = await fetch(`${base}/api/me`, { headers: { cookie } })
    expect(r.status).toBe(200)
    expect((await r.json()).role).toBe('admin')
  })

  it('403s mutations from a foreign Origin', async () => {
    const r = await fetch(`${base}/api/budgets`, {
      method: 'PUT',
      headers: { cookie, origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthKey: '2026-07', category: 'Dining Out', amount: 1 }),
    })
    expect(r.status).toBe(403)
  })

  it('allows mutations from the app origin', async () => {
    const r = await fetch(`${base}/api/budgets`, {
      method: 'PUT',
      headers: { cookie, origin: 'https://budget.home.arpa', 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthKey: '2026-07', category: 'Dining Out', amount: 1 }),
    })
    expect(r.status).toBe(200)
  })

  it('closes WebSocket connections without a session (4401)', async () => {
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${base.replace('http', 'ws')}/`)
      ws.on('close', (c) => resolve(c))
    })
    expect(code).toBe(4401)
  })

  it('keeps WebSocket connections with a session open', async () => {
    const opened = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`${base.replace('http', 'ws')}/`, { headers: { cookie } })
      const timer = setTimeout(() => {
        ws.terminate()
        resolve(true) // still open after 300ms = accepted
      }, 300)
      ws.on('close', (c) => {
        if (c === 4401) {
          clearTimeout(timer)
          resolve(false)
        }
      })
    })
    expect(opened).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/auth-guard.test.ts`
Expected: FAIL — `auth` is not a known option / gate not enforced (401 tests get 200/503)

- [ ] **Step 3: Implement the gate in src/main/server.ts**

3a. Add the import at the top:

```ts
import type { AuthRuntime } from '../server/auth/runtime'
```

3b. Extend the options interface:

```ts
export interface StartServerOptions {
  rendererRoot: string
  preferredPort?: number
  auth?: AuthRuntime | null
}
```

3c. Make the handler async and gate it. Replace

```ts
  httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    // Strip query strings; decode URI; prevent directory traversal
    let urlPath = (req.url ?? '/').split('?')[0]
    try { urlPath = decodeURIComponent(urlPath) } catch { urlPath = '/' }
```

with

```ts
  const appOrigin = opts.auth ? new URL(opts.auth.env.appBaseUrl).origin : null

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Strip query strings; decode URI; prevent directory traversal
    let urlPath = (req.url ?? '/').split('?')[0]
    try { urlPath = decodeURIComponent(urlPath) } catch { urlPath = '/' }

    // ── Auth gate (web mode only; Electron passes no auth runtime) ──────────
    if (opts.auth) {
      if (await opts.auth.handleRequest(req, res)) return
      if (urlPath !== '/api/health') {
        const session = opts.auth.getSessionUser(req)
        if (!session) {
          if (urlPath.startsWith('/api/')) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Not signed in' }))
          } else {
            res.writeHead(302, { Location: '/auth/login' })
            res.end()
          }
          return
        }
        // CSRF backstop: cookies are SameSite=Lax, but reject any cross-origin mutation outright
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const origin = req.headers.origin
          if (origin && origin !== appOrigin) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Cross-origin request rejected' }))
            return
          }
        }
      }
    }
```

and close the function where the old callback ended, changing the `createHttpServer` call to:

```ts
  httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    void handleRequest(req, res)
  })
```

(The body of the existing routing — everything from the `/api/health` check to the static-file fallback — moves inside `handleRequest` unchanged.)

3d. Authenticate WebSocket upgrades. After `wss = new WebSocketServer({ server: httpServer })` add:

```ts
  if (opts.auth) {
    const auth = opts.auth
    wss.on('connection', (socket, req) => {
      if (!auth.getSessionUser(req)) socket.close(4401, 'Authentication required')
    })
  }
```

- [ ] **Step 4: Run the new and existing server tests**

Run: `npx vitest run tests/auth-guard.test.ts tests/server.test.ts`
Expected: all PASS (existing server tests pass no `auth`, so they see pre-Phase-2 behavior)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/server.ts tests/auth-guard.test.ts
git commit -m "feat: enforce sessions on every HTTP route and WebSocket upgrade"
```

---

### Task 8: Server entry wiring (index.ts)

**Files:**
- Modify: `src/server/index.ts`

**Interfaces:**
- Consumes: `openDb` (Task 3), `initAuth` (Task 6), `sweepExpiredSessions` (Task 4), `config.auth` (Task 2).

- [ ] **Step 1: Implement**

Replace `src/server/index.ts` with:

```ts
import { existsSync } from 'fs'
import { initDataDir } from '../main/data-dir'
import { parseWorkbook } from '../main/excel'
import { startServer, stopServer, setLastSnapshot } from '../main/server'
import { startWatcher, stopWatcher } from '../main/watcher'
import { getConfig } from './config'
import { openDb, closeDb } from './db'
import { initAuth, type AuthRuntime } from './auth/runtime'
import { sweepExpiredSessions } from './auth/session-store'

async function main(): Promise<void> {
  const config = getConfig(process.env)
  initDataDir(config.dataDir)
  openDb(config.dataDir)

  let auth: AuthRuntime | null = null
  if (config.auth) {
    auth = initAuth(config.auth)
    console.log(
      `Auth enabled — OIDC issuer ${config.auth.issuer}, admin group "${config.auth.adminGroup}", sessions ${config.auth.sessionTtlHours}h`
    )
    const swept = sweepExpiredSessions()
    if (swept > 0) console.log(`Swept ${swept} expired session(s)`)
    setInterval(() => sweepExpiredSessions(), 60 * 60 * 1000).unref()
  } else {
    console.warn('AUTH DISABLED — every request is anonymous. Local development only; never deploy this mode.')
  }

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

  startWatcher(config.xlsxPath, undefined, { usePolling: true })
  const info = await startServer({ rendererRoot: config.rendererRoot, preferredPort: config.port, auth })
  console.log(`budget-app listening on ${info.url}`)

  const shutdown = (): void => {
    console.log('Shutting down...')
    stopWatcher()
    stopServer().then(() => {
      closeDb()
      process.exit(0)
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Verify build + boot smoke test (auth disabled)**

Run: `npm run build:web`
Expected: bundle written, exit 0.

Run (Git Bash):
```bash
AUTH_DISABLED=1 BUDGET_XLSX_PATH=/nonexistent.xlsx APP_DATA_DIR="$(mktemp -d)" node out/server/index.js &
sleep 2 && curl -s http://127.0.0.1:3737/api/health && kill %1
```
Expected: log line `AUTH DISABLED — ...` and `{"ok":true,"hasSnapshot":false}`

- [ ] **Step 3: Verify boot refuses silently-unauthenticated prod config**

Run: `BUDGET_XLSX_PATH=/x.xlsx node out/server/index.js; echo "exit=$?"`
Expected: error mentioning `AUTH_DISABLED`, `exit=1`

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: wire SQLite, auth runtime and session sweep into server boot"
```

---

### Task 9: Renderer — user badge, sign-out, 401 redirect

**Files:**
- Modify: `src/renderer/src/api.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/index.css`

**Interfaces:**
- Consumes: `GET /api/me` → `AuthUser` JSON (Task 6), `POST /auth/logout` (Task 6), `AuthUser` type (Task 2).

- [ ] **Step 1: Add auth calls to api.ts**

In `src/renderer/src/api.ts`, extend the type import and add at the end of the file:

```ts
import type { AccountType, AuthUser } from '../../shared/types'
```

```ts
// ── Auth ──────────────────────────────────────────────────────────────────────

/** Current signed-in user, or null (Electron mode, auth disabled, or not signed in). */
export async function getMe(): Promise<AuthUser | null> {
  if (isElectron()) return null
  try {
    const r = await fetch('/api/me')
    if (!r.ok) return null
    // Auth-disabled servers have no /api/me; the SPA fallback answers with HTML
    if (!(r.headers.get('content-type') ?? '').includes('application/json')) return null
    return (await r.json()) as AuthUser
  } catch {
    return null
  }
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' })
  window.location.href = '/auth/logged-out'
}
```

- [ ] **Step 2: Redirect to login when the session dies mid-use**

In the same file, add above `httpGet`:

```ts
function bounceToLoginOn401(r: Response): void {
  if (r.status === 401) window.location.href = '/auth/login'
}
```

and in each of `httpGet`, `httpPost`, `httpPut`, `httpDelete`, insert `bounceToLoginOn401(r)` immediately before the existing `if (!r.ok) throw ...` line.

- [ ] **Step 3: Header badge in App.tsx**

In `src/renderer/src/App.tsx`:

Add to the imports:

```ts
import { getMe, logout } from './api'
import type { AuthUser } from '../../shared/types'
```

Inside the `App` component (near the other `useState` calls around line 123):

```ts
const [user, setUser] = useState<AuthUser | null>(null)

useEffect(() => {
  getMe().then(setUser)
}, [])
```

In the header's `app-header__actions` div (line ~562), add as the FIRST children:

```tsx
{user && (
  <span className="app-header__user" title={user.email}>
    {user.name}
    {user.role === 'admin' && <span className="app-header__role">admin</span>}
    <button className="app-header__signout" onClick={() => { void logout() }}>
      Sign out
    </button>
  </span>
)}
```

- [ ] **Step 4: Styles**

Append to `src/renderer/src/index.css`:

```css
/* ── Auth badge (Phase 2) ── */
.app-header__user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}
.app-header__role {
  border: 1px solid var(--border-hover);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.app-header__signout {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.app-header__signout:hover {
  color: var(--text-primary);
  border-color: var(--border-hover);
}
```

- [ ] **Step 5: Verify build and tests**

Run: `npm run build:web && npm test`
Expected: build exit 0, all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/api.ts src/renderer/src/App.tsx src/renderer/src/index.css
git commit -m "feat: user badge, sign-out and 401 login redirect in the web UI"
```

---

### Task 10: Compose stack — Caddy + Pocket ID + budget-app wiring

**Files:**
- Create: `caddy/Caddyfile`, `.env.example`
- Modify: `docker-compose.yml`, `.gitignore`

**Interfaces:**
- Consumes: env vars defined in Task 2 (`APP_BASE_URL`, `OIDC_*`, `ADMIN_GROUP`).
- Produces: hostnames `budget.home.arpa` / `id.home.arpa` resolving inside the compose network to Caddy (network aliases), so budget-app performs OIDC discovery against the same HTTPS URL browsers use; Caddy's internal root CA trusted by budget-app via `NODE_EXTRA_CA_CERTS`.

- [ ] **Step 1: Caddyfile**

Create `caddy/Caddyfile`:

```
# Both sites use Caddy's internal CA (passkeys/WebAuthn require HTTPS).
# The root cert is at /data/caddy/pki/authorities/local/root.crt — see docs/DEPLOY.md
# for trusting it on family devices.

{$BUDGET_HOST} {
	tls internal
	reverse_proxy budget-app:3737
}

{$POCKET_ID_HOST} {
	tls internal
	reverse_proxy pocket-id:1411
}
```

- [ ] **Step 2: .env.example + .gitignore**

Create `.env.example`:

```bash
# Copy to .env (gitignored) and fill in. docker compose reads this automatically.

# LAN hostnames — must resolve to the Docker host's IP on your LAN DNS
# (router DNS entry, Pi-hole, or per-device hosts file).
BUDGET_HOST=budget.home.arpa
POCKET_ID_HOST=id.home.arpa

# Pocket ID data encryption key — generate once: openssl rand -base64 32
POCKET_ID_ENCRYPTION_KEY=

# From Pocket ID admin UI → OIDC Clients → "Budget Dashboard"
# (create the client first — see docs/DEPLOY.md Phase 2; secret is shown once)
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
```

Append to `.gitignore`:

```
.env
```

- [ ] **Step 3: docker-compose.yml**

Replace `docker-compose.yml` with:

```yaml
services:
  budget-app:
    build: .
    container_name: budget-app
    restart: unless-stopped
    environment:
      # POINTS AT THE TEST COPY. Do not switch to '2026 Budget.xlsx'
      # without Eric's explicit approval.
      BUDGET_XLSX_PATH: "/data/budget/Desktop/BUDGET/2026/2026 Budget - Copy.xlsx"
      APP_DATA_DIR: /data/app
      # Must match the household's local timezone. Excel dates parse at
      # midnight server-time; on UTC they render as the previous day in
      # Central-time browsers, shifting month-boundary transactions.
      TZ: America/Chicago
      # ── Auth (Phase 2) ──
      APP_BASE_URL: https://${BUDGET_HOST}
      OIDC_ISSUER: https://${POCKET_ID_HOST}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID}
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET}
      ADMIN_GROUP: budget-admin
      # Trust Caddy's internal CA for OIDC discovery/token calls to https://${POCKET_ID_HOST}
      NODE_EXTRA_CA_CERTS: /caddy-ca/caddy/pki/authorities/local/root.crt
    volumes:
      - budget_mirror:/data/budget:ro
      - app_data:/data/app
      - caddy_data:/caddy-ca:ro
    depends_on:
      onedrive:
        condition: service_started
      pocket-id:
        condition: service_started
      caddy:
        # Healthy = internal CA root exists, so NODE_EXTRA_CA_CERTS resolves at boot
        condition: service_healthy

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      BUDGET_HOST: ${BUDGET_HOST}
      POCKET_ID_HOST: ${POCKET_ID_HOST}
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    healthcheck:
      test: ["CMD", "test", "-f", "/data/caddy/pki/authorities/local/root.crt"]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 5s
    networks:
      default:
        aliases:
          # budget-app resolves the public hostnames to Caddy inside the
          # compose network, so OIDC discovery uses the same URLs as browsers.
          - ${BUDGET_HOST}
          - ${POCKET_ID_HOST}

  pocket-id:
    image: ghcr.io/pocket-id/pocket-id:v1
    container_name: pocket-id
    restart: unless-stopped
    environment:
      APP_URL: https://${POCKET_ID_HOST}
      TRUST_PROXY: "true"
      ENCRYPTION_KEY: ${POCKET_ID_ENCRYPTION_KEY}
      TZ: America/Chicago
    volumes:
      - pocket_id_data:/app/data

  onedrive:
    image: driveone/onedrive:edge
    container_name: onedrive-sync
    restart: unless-stopped
    environment:
      ONEDRIVE_DOWNLOADONLY: "1"
      # Must match the UID:GID of the 'node' user in budget-app's image;
      # otherwise the mirror is written root-owned and budget-app gets EACCES.
      ONEDRIVE_UID: "1000"
      ONEDRIVE_GID: "1000"
    volumes:
      - ./onedrive-conf:/onedrive/conf
      - budget_mirror:/onedrive/data

volumes:
  budget_mirror:
  app_data:
  caddy_data:
  caddy_config:
  pocket_id_data:
```

Note the removed `ports: "3737:3737"` on budget-app — the dashboard is now reachable only through Caddy. The Dockerfile HEALTHCHECK still works (it probes localhost inside the container).

- [ ] **Step 4: Validate compose config**

Run (Git Bash, repo root):
```bash
cp .env.example .env.compose-check && sed -i 's/^POCKET_ID_ENCRYPTION_KEY=$/POCKET_ID_ENCRYPTION_KEY=x/;s/^OIDC_CLIENT_ID=$/OIDC_CLIENT_ID=x/;s/^OIDC_CLIENT_SECRET=$/OIDC_CLIENT_SECRET=x/' .env.compose-check
docker compose --env-file .env.compose-check config > /dev/null && echo COMPOSE-OK
rm .env.compose-check
```
Expected: `COMPOSE-OK`

- [ ] **Step 5: Commit**

```bash
git add caddy/Caddyfile .env.example .gitignore docker-compose.yml
git commit -m "feat: Caddy TLS + Pocket ID services; budget-app behind the proxy"
```

---

### Task 11: DEPLOY.md Phase 2 runbook

**Files:**
- Modify: `docs/DEPLOY.md`

- [ ] **Step 1: Append the Phase 2 section**

Append to `docs/DEPLOY.md`:

```markdown
## Phase 2: HTTPS + passkey login (Caddy + Pocket ID)

Everything below happens once, on the LXC (`/opt/budget-app`), after `git pull`.
Reminder: builds on this LXC MUST use the classic builder — `DOCKER_BUILDKIT=0`.

### 1. LAN DNS

Point both hostnames at this LXC's IP (192.168.1.x) in your LAN DNS — router DNS
entries or Pi-hole "Local DNS records". Per-device hosts files work as a fallback.

- `budget.home.arpa` → LXC IP
- `id.home.arpa` → LXC IP

Verify from a family device: `nslookup budget.home.arpa` returns the LXC IP.

### 2. Environment file

    cp .env.example .env
    openssl rand -base64 32   # → paste as POCKET_ID_ENCRYPTION_KEY

Leave OIDC_CLIENT_ID / OIDC_CLIENT_SECRET empty for now (step 4 fills them).

### 3. First start — Pocket ID setup

    DOCKER_BUILDKIT=0 docker compose up -d --build caddy pocket-id

budget-app will not start yet (missing OIDC vars) — expected.

1. Open `https://id.home.arpa/setup` on Eric's machine (accept the TLS warning
   this once, or do step 5 first).
2. Create the admin account (Eric) and register a passkey.
3. Admin UI → **User Groups** → create group `budget-admin` → add Eric.
4. Create accounts for each family member (no group needed — they become members).

### 4. Register the OIDC client

Pocket ID admin UI → **OIDC Clients** → Add:

- Name: `Budget Dashboard`
- Callback URL: `https://budget.home.arpa/auth/callback`
- PKCE: enabled
- Leave it a confidential client; copy the **Client ID** and the **Client Secret**
  (shown once) into `.env`.

Then:

    DOCKER_BUILDKIT=0 docker compose up -d --build

`docker logs budget-app` should show
`Auth enabled — OIDC issuer https://id.home.arpa, admin group "budget-admin", sessions 12h`.

### 5. Trust the internal CA on family devices

Export the root cert:

    docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./budget-ca.crt

- **Windows:** double-click → Install Certificate → Local Machine →
  "Trusted Root Certification Authorities".
- **iPhone/iPad:** AirDrop or email `budget-ca.crt` → install profile →
  Settings → General → About → Certificate Trust Settings → enable full trust.
- **Android:** Settings → Security → Encryption & credentials → Install a certificate → CA.

### 6. Verify

1. `https://budget.home.arpa` from a family device → redirected to Pocket ID →
   passkey tap → dashboard loads with your name in the header.
2. Eric's header badge shows `admin`; a member account shows no badge role.
3. `https://budget.home.arpa/api/snapshot` in a private/incognito window → 401
   (JSON error, not data) — the API is closed to the unauthenticated LAN.
4. Sign out → "Signed out" page → Sign in again works with one passkey tap.

### Ops notes

- Sessions last 12h (`SESSION_TTL_HOURS`); expired sessions are swept hourly.
- `AUTH_DISABLED=1` exists for local development ONLY. The server refuses to
  boot without OIDC config unless it is set, so auth cannot fall off silently.
- Pocket ID data (users, passkeys, its own login audit log) lives in the
  `pocket_id_data` volume — include it in volume backups.
- If Pocket ID is down, existing sessions keep working until expiry; only new
  logins fail (with a clear 502 from `/auth/login`).
- Rollback: `git checkout master && DOCKER_BUILDKIT=0 docker compose up -d --build`
  (the Phase 1 compose file has no caddy/pocket-id services; stray containers:
  `docker compose down` first).
```

- [ ] **Step 2: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs: Phase 2 deployment runbook (DNS, Pocket ID, OIDC client, CA trust)"
```

---

### Task 12: Final verification + PR

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: 13 test files, all PASS

- [ ] **Step 2: Web build**

Run: `npm run build:web`
Expected: exit 0

- [ ] **Step 3: Docker build**

Run: `docker build -t budget-app:phase2 .`
Expected: image builds; `docker run --rm -e AUTH_DISABLED=1 -e BUDGET_XLSX_PATH=/tmp/none.xlsx budget-app:phase2 node -e "require('node:sqlite'); console.log('sqlite-ok')"` prints `sqlite-ok`

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feature/phase2-auth
gh pr create --title "Phase 2: HTTPS + passkey auth (Caddy + Pocket ID, server-side roles)" --body "..."
```

PR body summarizes: what's new, UAT checklist mirroring DEPLOY.md §6, and the note that merge waits for Eric's explicit approval.

---

## Deferred to UAT (real Pocket ID + LXC required)

- Full OIDC handshake against live Pocket ID (discovery, PKCE exchange, groups claim content — including whether Pocket ID puts `groups` in the ID token or only userinfo; `completeLogin` handles both).
- `ghcr.io/pocket-id/pocket-id:v1` tag validity (fallback: pin the current exact release).
- Caddy CA race on very first boot (healthcheck gates budget-app on the root cert existing).
- Passkey ceremony on family devices after CA trust.
- Whether the LXC's port 80/443 bind works post-`lxc-pve` upgrade (Phase 1 fixed the sysctl EACCES class of problem).
