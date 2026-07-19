import { describe, it, expect } from 'vitest'
import { assertToolSafety, assertCallAllowed, filterTools, READ_TOOL_PATTERN, WRITE_TOOL_PATTERN, type McpTool } from '../src/server/chat/mcp-client'

const t = (name: string): McpTool => ({ name, inputSchema: { type: 'object' } })

describe('MCP tool safety', () => {
  it('filterTools keeps only get_/search_ tools', () => {
    const tools = [t('get_accounts'), t('search_transactions'), t('export_transactions'), t('download_attachment'), t('list_something')]
    expect(filterTools(tools).map((x) => x.name)).toEqual(['get_accounts', 'search_transactions'])
  })

  it('assertToolSafety passes on a clean read-only list', () => {
    expect(() => assertToolSafety([t('get_accounts'), t('export_transactions')])).not.toThrow()
  })

  it('assertToolSafety throws when a write tool leaked through', () => {
    for (const bad of ['create_transaction', 'update_account', 'delete_budget', 'store_rule', 'bulk_update_transactions', 'trigger_recurrence', 'upload_attachment', 'enable_currency', 'disable_currency', 'destroy_object']) {
      expect(() => assertToolSafety([t('get_accounts'), t(bad)]), bad).toThrow(/write/i)
    }
  })

  it('patterns are anchored at the start', () => {
    expect(READ_TOOL_PATTERN.test('forget_me')).toBe(false)
    expect(WRITE_TOOL_PATTERN.test('recreate_view')).toBe(false)
  })

  it('write tripwire is case-insensitive', () => {
    expect(() => assertToolSafety([t('get_accounts'), t('Create_transaction')])).toThrow(/write/i)
  })
})

describe('assertCallAllowed (call-time allowlist guard)', () => {
  const allowed = new Set(['get_accounts', 'search_transactions'])

  it('passes silently for an allowed name', () => {
    expect(() => assertCallAllowed(allowed, 'get_accounts')).not.toThrow()
  })

  it('throws for an unfiltered/unknown name', () => {
    expect(() => assertCallAllowed(allowed, 'export_transactions')).toThrow(/not allowed/)
  })

  it('throws for a write-verb name, proving the model can never reach it', () => {
    expect(() => assertCallAllowed(allowed, 'create_transaction')).toThrow(/not allowed/)
  })
})
