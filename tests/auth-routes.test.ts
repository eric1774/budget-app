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

let failBeginLogin = false

const stubFlow: OidcFlow = {
  beginLogin: async () => {
    if (failBeginLogin) throw new Error('discovery failed')
    return { url: 'https://id.home.arpa/authorize?fake=1', loginId: 'login-1' }
  },
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

  it('GET /auth/login is a 502 when the IdP is unreachable', async () => {
    failBeginLogin = true
    try {
      const r = await fetch(`${base}/auth/login`, { redirect: 'manual' })
      expect(r.status).toBe(502)
      expect(await r.text()).toContain('identity provider')
    } finally {
      failBeginLogin = false
    }
  })

  it('GET /auth/callback creates a session and redirects home', async () => {
    const r = await fetch(`${base}/auth/callback?code=x&state=y`, {
      redirect: 'manual',
      headers: { cookie: 'budget_login=login-1' },
    })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('/')
    const setCookies = r.headers.getSetCookie()
    expect(setCookies.some((c) => c.includes('budget_session=') && c.includes('HttpOnly'))).toBe(true)
    expect(setCookies.some((c) => c.includes('Max-Age=43200'))).toBe(true)
    expect(setCookies.some((c) => c.includes('budget_login=') && c.includes('Max-Age=0'))).toBe(true)
  })

  it('GET /auth/callback without the login cookie is a 400', async () => {
    const r = await fetch(`${base}/auth/callback?code=x&state=y`, { redirect: 'manual' })
    expect(r.status).toBe(400)
    const setCookie = r.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('budget_login=')
    expect(setCookie).toContain('Max-Age=0')
  })

  it('GET /auth/callback with an invalid login cookie is a 400 and clears the login cookie', async () => {
    const r = await fetch(`${base}/auth/callback?code=x&state=y`, {
      redirect: 'manual',
      headers: { cookie: 'budget_login=bogus' },
    })
    expect(r.status).toBe(400)
    const setCookie = r.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('budget_login=')
    expect(setCookie).toContain('Max-Age=0')
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
    const r = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { cookie: `budget_session=${s.id}`, origin: 'https://budget.home.arpa' },
    })
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0')
    const me = await fetch(`${base}/api/me`, { headers: { cookie: `budget_session=${s.id}` } })
    expect(me.status).toBe(401)
  })

  it('POST /auth/logout from a cross-origin request is rejected without clearing the session', async () => {
    const s = createSession({ sub: 'u9', name: 'Member', email: 'm@x.com', role: 'member' }, 12)
    const r = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { cookie: `budget_session=${s.id}`, origin: 'https://evil.example' },
    })
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'Cross-origin request rejected' })
    const setCookies = r.headers.getSetCookie()
    expect(setCookies.some((c) => c.includes('budget_session='))).toBe(false)
    const me = await fetch(`${base}/api/me`, { headers: { cookie: `budget_session=${s.id}` } })
    expect(me.status).toBe(200)
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
