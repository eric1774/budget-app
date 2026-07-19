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

describe('chat config', () => {
  const base = {
    BUDGET_XLSX_PATH: '/x.xlsx',
    AUTH_DISABLED: '1',
    ANTHROPIC_API_KEY: 'sk-test',
    FIREFLY_URL: 'http://192.168.1.113/',
    FIREFLY_TOKEN: 'pat-read',
  }

  it('is null when chat env vars are absent (chat optional)', () => {
    expect(getConfig({ BUDGET_XLSX_PATH: '/x.xlsx', AUTH_DISABLED: '1' }).chat).toBeNull()
  })

  it('is null when only some chat vars are present', () => {
    const { FIREFLY_TOKEN: _omit, ...partial } = base
    expect(getConfig(partial).chat).toBeNull()
  })

  it('parses the chat block with defaults', () => {
    const c = getConfig(base)
    expect(c.chat).toEqual({
      anthropicApiKey: 'sk-test',
      fireflyUrl: 'http://192.168.1.113',
      fireflyToken: 'pat-read',
      model: 'claude-haiku-4-5',
      dailyTokenBudget: 250000,
      mcpCommand: ['npx', '-y', '@daften/fireflyiii-mcp'],
    })
  })

  it('honors CHAT_MODEL, CHAT_DAILY_TOKEN_BUDGET and FIREFLY_MCP_COMMAND overrides', () => {
    const c = getConfig({
      ...base,
      CHAT_MODEL: 'claude-sonnet-5',
      CHAT_DAILY_TOKEN_BUDGET: '50000',
      FIREFLY_MCP_COMMAND: '/mcp/node_modules/.bin/fireflyiii-mcp',
    })
    expect(c.chat?.model).toBe('claude-sonnet-5')
    expect(c.chat?.dailyTokenBudget).toBe(50000)
    expect(c.chat?.mcpCommand).toEqual(['/mcp/node_modules/.bin/fireflyiii-mcp'])
  })

  it('throws on a non-positive CHAT_DAILY_TOKEN_BUDGET', () => {
    expect(() => getConfig({ ...base, CHAT_DAILY_TOKEN_BUDGET: '0' })).toThrow(/CHAT_DAILY_TOKEN_BUDGET/)
  })
})
