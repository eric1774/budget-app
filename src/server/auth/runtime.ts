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
        console.log(`Signed in: ${user.name} (${user.sub}) as ${user.role}`)
        res.writeHead(302, {
          Location: '/',
          'Set-Cookie': [sessionCookie(session.id, env.sessionTtlHours * 3600), clearLoginCookie()],
        })
        res.end()
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
