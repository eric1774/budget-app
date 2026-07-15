import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseWorkbook } from '../src/main/excel'
import { writeFixtureWorkbook, writeFixtureWorkbookWithBothColumns } from './helpers/fixture'

describe('parseWorkbook category column', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'budget-excel-test-'))
  })

  it('accepts a workbook with only a literal category column', () => {
    const xlsx = join(dir, 'category-only.xlsx')
    writeFixtureWorkbook(xlsx)
    const parsed = parseWorkbook(xlsx)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.result.transactions.map((t) => t.category)).toEqual([
      'Income',
      'Groceries',
      'Auto & Gas',
    ])
  })

  it('uses the Budget column when both Budget and category exist', () => {
    const xlsx = join(dir, 'both-columns.xlsx')
    writeFixtureWorkbookWithBothColumns(xlsx)
    const parsed = parseWorkbook(xlsx)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    // Budget values, not the rightmost 'category' values
    expect(parsed.result.transactions.map((t) => t.category)).toEqual([
      'Income',
      'Dining Out',
      'Subscriptions',
    ])
    // Row with blank rightmost 'category' but filled Budget is NOT skipped
    expect(parsed.result.transactions).toHaveLength(3)
    expect(parsed.result.skippedRows).toBe(0)
  })
})
