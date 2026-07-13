import { describe, it, expect } from 'vitest'
import { getConfig } from '../src/server/config'

describe('server config', () => {
  it('throws without BUDGET_XLSX_PATH', () => {
    expect(() => getConfig({})).toThrow(/BUDGET_XLSX_PATH/)
  })

  it('applies defaults', () => {
    const c = getConfig({ BUDGET_XLSX_PATH: '/data/budget/test.xlsx' })
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
    })
    expect(c.port).toBe(4000)
    expect(c.dataDir).toBe('/custom/app')
    expect(c.rendererRoot).toBe('/custom/renderer')
  })

  it('throws on non-numeric PORT', () => {
    expect(() => getConfig({ BUDGET_XLSX_PATH: '/x.xlsx', PORT: 'abc' })).toThrow(/PORT/)
  })
})
