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
