import { useState, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BudgetTab } from '../src/renderer/src/components/BudgetTab'
import { LogTab } from '../src/renderer/src/components/LogTab'
import { LogFilterBar, DEFAULT_LOG_FILTER } from '../src/renderer/src/components/LogFilterBar'
import type { LogFilterState } from '../src/renderer/src/components/LogFilterBar'
import { MonthlyChart } from '../src/renderer/src/components/MonthlyChart'
import { CategoryBreakdownChart } from '../src/renderer/src/components/CategoryBreakdownChart'
import { BalanceChart } from '../src/renderer/src/components/BalanceChart'
import { SummaryCards } from '../src/renderer/src/components/SummaryCards'
import type { Transaction } from '../src/shared/types'
import '../src/renderer/src/index.css'

// Deterministic pseudo-random for stable screenshots
let seed = 42
const rand = (): number => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

const CATS = ['Groceries', 'Dining Out', 'Utilities / Gas / Insurance', 'Mortgage', 'Entertainment', 'Subscriptions', 'Baby Needs', 'Horse Budget', 'Tithe', 'SAVINGS!', 'House Fund', 'Retirement']

function makeData(): Transaction[] {
  const txns: Transaction[] = []
  let balance = 14000
  let row = 2
  for (let m = 0; m < 7; m++) {
    const year = 2026
    const month = m // Jan..Jul
    // Two paychecks
    for (const day of [1, 15]) {
      const income = 2900 + Math.round(rand() * 400)
      balance += income
      txns.push({ date: new Date(year, month, day), description: 'Payroll', category: 'Income', income, debit: 0, balance, rowIndex: row++ })
    }
    // Expenses
    const count = 22 + Math.floor(rand() * 8)
    for (let i = 0; i < count; i++) {
      const day = 1 + Math.floor(rand() * 27)
      const cat = CATS[Math.floor(rand() * CATS.length)]
      const base = cat === 'Mortgage' ? 1800 : cat === 'SAVINGS!' ? 400 : cat === 'Retirement' ? 300 : 30 + rand() * 180
      const debit = Math.round(base * 100) / 100
      balance -= debit
      txns.push({ date: new Date(year, month, day), description: `${cat} purchase`, category: cat, income: 0, debit, balance, rowIndex: row++ })
    }
  }
  return txns.sort((a, b) => a.date.getTime() - b.date.getTime())
}

const txns = makeData()

// Mock the budgets API for BudgetTab (preview runs without the real server)
const MOCK_BUDGETS = {
  '2026-07': {
    'Groceries': 600, 'Dining Out': 250, 'Utilities / Gas / Insurance': 450,
    'Mortgage': 1800, 'Entertainment': 150, 'Subscriptions': 80,
    'Baby Needs': 200, 'Horse Budget': 300, 'Tithe': 500,
  },
}
const realFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.includes('/api/budgets')) {
    return Promise.resolve(new Response(JSON.stringify(MOCK_BUDGETS), { status: 200 }))
  }
  return realFetch(input, init)
}) as typeof window.fetch

const page = new URLSearchParams(location.search).get('page') ?? 'dashboard'

function LogPreview(): JSX.Element {
  const [filter, setFilter] = useState<LogFilterState>(DEFAULT_LOG_FILTER)
  const filtered = useMemo(() => {
    let out = txns
    const now = new Date()
    if (filter.datePreset === 'this-month') {
      out = out.filter((t) => t.date.getFullYear() === now.getFullYear() && t.date.getMonth() === now.getMonth())
    } else if (filter.datePreset === 'specific-month' && filter.selectedMonthYear) {
      const [y, m] = filter.selectedMonthYear.split('-').map(Number)
      out = out.filter((t) => t.date.getFullYear() === y && t.date.getMonth() === m - 1)
    }
    if (filter.activeCategories.size > 0) out = out.filter((t) => filter.activeCategories.has(t.category))
    if (filter.incomeExpense === 'income') out = out.filter((t) => t.income > 0)
    else if (filter.incomeExpense === 'expenses') out = out.filter((t) => t.debit > 0)
    if (filter.descriptionSearch.trim() !== '') {
      const needle = filter.descriptionSearch.trim().toLowerCase()
      out = out.filter((t) => t.description.toLowerCase().includes(needle))
    }
    return out
  }, [filter])
  const months = useMemo(() => {
    const seen = new Set<string>()
    for (const t of txns) seen.add(`${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`)
    return Array.from(seen).sort((a, b) => b.localeCompare(a))
  }, [])
  return (
    <div className="log-tab-outer" style={{ height: '100vh' }}>
      <LogFilterBar
        filterState={filter}
        allCategories={[...CATS].sort()}
        availableMonths={months}
        onChange={setFilter}
      />
      <LogTab transactions={filtered} totalCount={txns.length} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
    {page === 'log' ? (
      <LogPreview />
    ) : page === 'budget' ? (
      <main className="budget-tab-outer">
        <BudgetTab
          transactions={txns}
          categories={CATS.filter((c) => c !== 'Income')}
        />
      </main>
    ) : (
      <main className="dashboard-main">
        <SummaryCards transactions={txns} onCardClick={() => {}} />
        <MonthlyChart transactions={txns} />
        <div className="charts-row">
          <CategoryBreakdownChart transactions={txns.filter((t) => t.debit > 0)} onCategoryDoubleClick={() => {}} />
          <BalanceChart transactions={txns} />
        </div>
      </main>
    )}
  </div>
)
