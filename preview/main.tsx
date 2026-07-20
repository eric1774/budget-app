import { createRoot } from 'react-dom/client'
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

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
    <main className="dashboard-main">
      <SummaryCards transactions={txns} onCardClick={() => {}} />
      <MonthlyChart transactions={txns} />
      <div className="charts-row">
        <CategoryBreakdownChart transactions={txns.filter((t) => t.debit > 0)} onCategoryDoubleClick={() => {}} />
        <BalanceChart transactions={txns} />
      </div>
    </main>
  </div>
)
