import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import {
  getAccounts, addAccount, addTransaction, updateTransaction, deleteTransaction, accountBalance,
  linkSimplefin, createLinkedAccount, unlinkSimplefin, applySyncedBalance,
} from '../src/main/assets-store'

beforeEach(() => {
  initDataDir(mkdtempSync(join(tmpdir(), 'sf-assets-test-')))
})

const LINK = { accountId: 'SF-1', org: 'Navy Federal Credit Union' }

describe('linked accounts', () => {
  it('linkSimplefin attaches a link and preserves existing transactions', () => {
    const acct = addAccount('NFCU Savings', 'Savings')
    addTransaction(acct.id, 'deposit', 100, '2026-01-05')
    const linked = linkSimplefin(acct.id, LINK)!
    expect(linked.simplefin).toEqual(LINK)
    expect(linked.transactions).toHaveLength(1)
  })

  it('accountBalance uses syncedBalance for linked accounts, transactions otherwise', () => {
    const acct = addAccount('NFCU Savings', 'Savings')
    addTransaction(acct.id, 'deposit', 100, '2026-01-05')
    linkSimplefin(acct.id, LINK)
    applySyncedBalance('SF-1', 5432.10, '2026-07-20', false)
    const fresh = getAccounts().find(a => a.id === acct.id)!
    expect(accountBalance(fresh)).toBe(5432.10)   // not 100
    unlinkSimplefin(acct.id)
    const reverted = getAccounts().find(a => a.id === acct.id)!
    expect(accountBalance(reverted)).toBe(100)    // frozen ledger takes over again
  })

  it('addTransaction is rejected on linked accounts (frozen ledger)', () => {
    const acct = addAccount('NFCU Savings', 'Savings')
    linkSimplefin(acct.id, LINK)
    expect(addTransaction(acct.id, 'deposit', 50, '2026-07-20')).toBeNull()
  })

  it('updateTransaction and deleteTransaction are rejected on linked accounts (frozen ledger)', () => {
    const acct = addAccount('NFCU Savings', 'Savings')
    const txn = addTransaction(acct.id, 'deposit', 100, '2026-01-05')!
    linkSimplefin(acct.id, LINK)

    expect(updateTransaction(acct.id, txn.id, { amount: 999 })).toBeNull()
    expect(deleteTransaction(acct.id, txn.id)).toBe(false)

    const fresh = getAccounts().find(a => a.id === acct.id)!
    expect(fresh.transactions).toEqual([txn])
  })

  it('applySyncedBalance upserts one snapshot per day and sets needsAttention', () => {
    const acct = createLinkedAccount('Fidelity Brokerage', 'Investing', { accountId: 'SF-2', org: 'Fidelity Investments' })
    applySyncedBalance('SF-2', 100, '2026-07-20', false)
    applySyncedBalance('SF-2', 150, '2026-07-20', true)   // same day → overwrite
    applySyncedBalance('SF-2', 200, '2026-07-21', false)
    const fresh = getAccounts().find(a => a.id === acct.id)!
    expect(fresh.snapshots).toEqual([
      { date: '2026-07-20', balance: 150 },
      { date: '2026-07-21', balance: 200 },
    ])
    expect(fresh.syncedBalance).toBe(200)
    expect(fresh.needsAttention).toBe(false)
  })

  it('applySyncedBalance returns null for unknown simplefin ids', () => {
    expect(applySyncedBalance('SF-nope', 1, '2026-07-20', false)).toBeNull()
  })
})
