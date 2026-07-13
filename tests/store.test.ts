import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import { getBudgets, setBudget } from '../src/main/store'

describe('store with injected data dir', () => {
  beforeEach(() => {
    initDataDir(mkdtempSync(join(tmpdir(), 'budget-store-test-')))
  })

  it('round-trips a budget entry', () => {
    setBudget('2026-07', 'Groceries', 600)
    expect(getBudgets()).toEqual({ '2026-07': { Groceries: 600 } })
  })

  it('amount 0 removes the entry and empty months', () => {
    setBudget('2026-07', 'Groceries', 600)
    setBudget('2026-07', 'Groceries', 0)
    expect(getBudgets()).toEqual({})
  })
})
