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
