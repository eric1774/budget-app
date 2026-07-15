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
