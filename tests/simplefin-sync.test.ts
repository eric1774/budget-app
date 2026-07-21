import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import { updateSimplefinData, getSimplefinData } from '../src/main/simplefin-store'
import { addAccount, linkSimplefin, getAccounts } from '../src/main/assets-store'
import { runSync, dueSlot, buildStatus, MANUAL_COOLDOWN_MS } from '../src/main/simplefin-sync'
import type { FetchLike } from '../src/main/simplefin-client'

beforeEach(() => {
  initDataDir(mkdtempSync(join(tmpdir(), 'sf-sync-test-')))
})

const ACCESS = 'https://u:p@bridge.example/simplefin'

function bridgeStub(body: unknown, status = 200): FetchLike {
  return async () => new Response(JSON.stringify(body), { status })
}

const NFCU = { id: 'SF-1', name: 'Share Savings', balance: '5000.10', 'balance-date': 1752987600, org: { name: 'Navy Federal Credit Union' }, transactions: [] }
const FIDO = { id: 'SF-2', name: 'Brokerage', balance: '82000.00', 'balance-date': 1752987600, org: { name: 'Fidelity Investments' }, transactions: [] }

describe('runSync', () => {
  it('refuses when not connected', async () => {
    const r = await runSync({ manual: true })
    expect(r).toMatchObject({ ok: false, reason: 'not-connected' })
  })

  it('updates linked accounts, discovered list, and lastSyncAt on success', async () => {
    updateSimplefinData({ accessUrl: ACCESS, connectedAt: '2026-07-19T00:00:00Z' })
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, { accountId: 'SF-1', org: 'Navy Federal Credit Union' })
    const r = await runSync({ manual: true, fetchImpl: bridgeStub({ errors: [], accounts: [NFCU, FIDO] }) })
    expect(r.ok).toBe(true)
    const fresh = getAccounts().find(a => a.id === acct.id)!
    expect(fresh.syncedBalance).toBe(5000.10)
    expect(fresh.snapshots).toHaveLength(1)
    const data = getSimplefinData()
    expect(data.lastSyncAt).not.toBeNull()
    expect(data.discovered.map(d => d.id).sort()).toEqual(['SF-1', 'SF-2'])
  })

  it('enforces the manual cooldown but not for scheduled syncs', async () => {
    updateSimplefinData({ accessUrl: ACCESS, lastSyncAt: new Date(Date.now() - MANUAL_COOLDOWN_MS / 2).toISOString() })
    const manual = await runSync({ manual: true, fetchImpl: bridgeStub({ errors: [], accounts: [] }) })
    expect(manual).toMatchObject({ ok: false, reason: 'cooldown' })
    const scheduled = await runSync({ manual: false, fetchImpl: bridgeStub({ errors: [], accounts: [] }) })
    expect(scheduled.ok).toBe(true)
  })

  it('never zeroes balances on failure: records lastSyncError, keeps account state', async () => {
    updateSimplefinData({ accessUrl: ACCESS })
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, { accountId: 'SF-1', org: 'Navy Federal Credit Union' })
    await runSync({ manual: true, fetchImpl: bridgeStub({ errors: [], accounts: [NFCU] }) })
    const failed = await runSync({ manual: false, fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
    expect(failed).toMatchObject({ ok: false, reason: 'error' })
    const fresh = getAccounts().find(a => a.id === acct.id)!
    expect(fresh.syncedBalance).toBe(5000.10)                 // untouched
    expect(getSimplefinData().lastSyncError).toMatch(/ECONNREFUSED/)
  })

  it('flags needsAttention from bridge errors mentioning the org', async () => {
    updateSimplefinData({ accessUrl: ACCESS })
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, { accountId: 'SF-1', org: 'Navy Federal Credit Union' })
    await runSync({ manual: true, fetchImpl: bridgeStub({ errors: ['Connection to Navy Federal Credit Union may need attention'], accounts: [NFCU] }) })
    expect(getAccounts().find(a => a.id === acct.id)!.needsAttention).toBe(true)
  })
})

describe('dueSlot', () => {
  it('is null before 6am, "am" slot 6am–5:59pm, "pm" slot after 6pm', () => {
    expect(dueSlot(new Date('2026-07-20T05:59:00'), null)).toBeNull()
    expect(dueSlot(new Date('2026-07-20T06:00:00'), null)).toBe('2026-07-20-am')
    expect(dueSlot(new Date('2026-07-20T17:59:00'), null)).toBe('2026-07-20-am')
    expect(dueSlot(new Date('2026-07-20T18:00:00'), null)).toBe('2026-07-20-pm')
  })

  it('does not re-fire an already-fired slot', () => {
    expect(dueSlot(new Date('2026-07-20T07:00:00'), '2026-07-20-am')).toBeNull()
    expect(dueSlot(new Date('2026-07-20T19:00:00'), '2026-07-20-am')).toBe('2026-07-20-pm')
  })
})

describe('buildStatus', () => {
  it('classifies discovered accounts and never leaks the access URL', async () => {
    updateSimplefinData({ accessUrl: ACCESS, ignoredAccountIds: ['SF-2'] })
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, { accountId: 'SF-1', org: 'Navy Federal Credit Union' })
    await runSync({ manual: true, fetchImpl: bridgeStub({ errors: [], accounts: [NFCU, FIDO, { ...NFCU, id: 'SF-3', name: 'Checking' }] }) })
    const status = buildStatus(true)
    expect(JSON.stringify(status)).not.toContain('u:p')
    const byId = Object.fromEntries(status.discovered.map(d => [d.id, d]))
    expect(byId['SF-1'].state).toBe('linked')
    expect(byId['SF-1'].linkedAccountId).toBe(acct.id)
    expect(byId['SF-2'].state).toBe('ignored')
    expect(byId['SF-3'].state).toBe('new')
  })
})
