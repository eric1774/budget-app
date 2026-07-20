import { useState, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BudgetTab } from '../src/renderer/src/components/BudgetTab'
import { GoalsTab } from '../src/renderer/src/components/GoalsTab'
import { AssetsTab } from '../src/renderer/src/components/AssetsTab'
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
const MOCK_GOALS = [
  { id: 'g1', name: 'House Down Payment', targetAmount: 60000, targetDate: '2028-06-01', startingAmount: 18000, contributions: [{ amount: 9500 }], createdAt: '' },
  { id: 'g2', name: 'Family Vacation', targetAmount: 5000, targetDate: '2026-12-15', startingAmount: 1200, contributions: [{ amount: 1450 }], createdAt: '' },
  { id: 'g3', name: 'Emergency Fund', targetAmount: 15000, startingAmount: 15200, contributions: [], createdAt: '' },
  { id: 'g4', name: 'New Truck', targetAmount: 35000, targetDate: '2029-03-01', startingAmount: 4000, contributions: [{ amount: 2100 }], createdAt: '' },
  { id: 'g5', name: 'Kids College Fund', contributions: [{ amount: 3600 }], startingAmount: 2000, createdAt: '' },
]

const MOCK_ACCOUNTS = [
  { id: 'a1', name: 'Everyday Checking', type: 'Checkings', syncedWithDashboard: true, transactions: [], createdAt: '' },
  { id: 'a2', name: 'High-Yield Savings', type: 'Savings', transactions: [
    { id: 't1', date: '2026-01-15', type: 'deposit', amount: 12000 },
    { id: 't2', date: '2026-03-10', type: 'deposit', amount: 2500 },
    { id: 't3', date: '2026-05-02', type: 'deposit', amount: 1800 },
    { id: 't4', date: '2026-07-01', type: 'deposit', amount: 900 },
  ], createdAt: '' },
  { id: 'a3', name: 'Fidelity 401k', type: 'Retirement', transactions: [
    { id: 't5', date: '2026-02-01', type: 'deposit', amount: 41000 },
    { id: 't6', date: '2026-04-01', type: 'deposit', amount: 2400 },
    { id: 't7', date: '2026-06-01', type: 'deposit', amount: 2600 },
  ], createdAt: '' },
  { id: 'a4', name: 'Brokerage', type: 'Investing', transactions: [
    { id: 't8', date: '2026-03-01', type: 'deposit', amount: 8000 },
    { id: 't9', date: '2026-06-15', type: 'withdrawal', amount: 1200 },
  ], createdAt: '' },
]

const MOCK_MORTGAGES = [
  { id: 'm1', name: 'Primary Home', marketValue: 380000, principalBalance: 291000, payments: [], createdAt: '' },
]

const realFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.includes('/api/budgets')) {
    return Promise.resolve(new Response(JSON.stringify(MOCK_BUDGETS), { status: 200 }))
  }
  if (url.includes('/api/goals')) {
    return Promise.resolve(new Response(JSON.stringify(MOCK_GOALS), { status: 200 }))
  }
  if (url.includes('mortgage')) {
    return Promise.resolve(new Response(JSON.stringify(MOCK_MORTGAGES), { status: 200 }))
  }
  if (url.includes('/api/assets')) {
    return Promise.resolve(new Response(JSON.stringify(MOCK_ACCOUNTS), { status: 200 }))
  }
  return realFetch(input, init)
}) as typeof window.fetch

const page = new URLSearchParams(location.search).get('page') ?? 'dashboard'

function GoalsPreview(): JSX.Element {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <GoalsTab
        onGoalSelect={(g) => setSelectedGoalId(g?.id ?? null)}
        selectedGoalId={selectedGoalId}
      />
    </div>
  )
}

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
    {page === 'goals' ? (
      <GoalsPreview />
    ) : page === 'assets' ? (
      <AssetsTab onAccountSelect={() => {}} selectedAccountId={null} dashboardBalance={14211.22} />
    ) : page === 'log' ? (
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
