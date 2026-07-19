import { describe, it, expect } from 'vitest'
import { getConfig } from '../src/server/config'

describe('server config', () => {
  it('throws without BUDGET_XLSX_PATH', () => {
    expect(() => getConfig({ AUTH_DISABLED: '1' })).toThrow(/BUDGET_XLSX_PATH/)
  })

  it('applies defaults', () => {
    const c = getConfig({ BUDGET_XLSX_PATH: '/data/budget/test.xlsx', AUTH_DISABLED: '1' })
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
      AUTH_DISABLED: '1',
    })
    expect(c.port).toBe(4000)
    expect(c.dataDir).toBe('/custom/app')
    expect(c.rendererRoot).toBe('/custom/renderer')
  })

  it('throws on non-numeric PORT', () => {
    expect(() => getConfig({ BUDGET_XLSX_PATH: '/x.xlsx', PORT: 'abc', AUTH_DISABLED: '1' })).toThrow(/PORT/)
  })
})

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
