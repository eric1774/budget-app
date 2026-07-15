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
