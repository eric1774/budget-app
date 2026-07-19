import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import WebSocket from 'ws'
import { openDb, closeDb } from '../src/server/db'
import { initAuth, type OidcFlow } from '../src/server/auth/runtime'
import { createSession, deleteSession } from '../src/server/auth/session-store'
import { startServer, stopServer, sweepWsSessions } from '../src/main/server'
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

  it('leaves PWA shell assets public (no auth redirect)', async () => {
    // Browsers fetch the manifest (and the SW fetches shell assets) without
    // credentials — these must not bounce to the IdP.
    for (const path of ['/manifest.webmanifest', '/sw.js', '/icon-192.png', '/icon-512.png']) {
      const r = await fetch(`${base}${path}`, { redirect: 'manual' })
      expect(r.status).toBe(200) // served (SPA fallback in this fixture), not 302/401
    }
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

  it('closes an open WebSocket when its session dies (sweep)', async () => {
    const s = createSession({ sub: 'u1', name: 'Eric', email: 'e@x.com', role: 'admin' }, 12)
    const ws = new WebSocket(`${base.replace('http', 'ws')}/`, {
      headers: { cookie: `budget_session=${s.id}` },
    })
    await new Promise<void>((resolve) => ws.on('open', () => resolve()))
    const closed = new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)))
    deleteSession(s.id)
    expect(sweepWsSessions()).toBeGreaterThanOrEqual(1)
    expect(await closed).toBe(4401)
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
