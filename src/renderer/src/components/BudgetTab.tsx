import { useState, useEffect, useMemo } from 'react'
import type { Transaction, BudgetMap, CategoryBudgets } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { BudgetModal } from './BudgetModal'

interface BudgetTabProps {
  transactions: Transaction[]
  categories: string[]
}

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

function getCurrentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function adjustMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function BudgetTab({ transactions, categories }: BudgetTabProps): JSX.Element {
  const [monthKey, setMonthKey] = useState<string>(getCurrentMonthKey)
  const [allBudgets, setAllBudgets] = useState<BudgetMap>({})
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Load budgets from IPC on mount and on monthKey change
  useEffect(() => {
    window.electronAPI.invoke('get-budgets').then((data) => {
      setAllBudgets((data as BudgetMap) ?? {})
    })
  }, [monthKey])

  const prevMonthKey = useMemo(() => adjustMonth(monthKey, -1), [monthKey])

  // Current month budgets — if none, pre-fill from prev month
  const displayBudgets = useMemo<CategoryBudgets>(() => {
    if (allBudgets[monthKey]) return allBudgets[monthKey]
    return allBudgets[prevMonthKey] ?? {}
  }, [allBudgets, monthKey, prevMonthKey])

  // Actual spend per category for selected month
  const actualByCategory = useMemo<Record<string, number>>(() => {
    const [y, m] = monthKey.split('-').map(Number)
    const result: Record<string, number> = {}
    for (const t of transactions) {
      if (t.date.getFullYear() === y && t.date.getMonth() === m - 1) {
        result[t.category] = (result[t.category] ?? 0) + t.debit
      }
    }
    return result
  }, [transactions, monthKey])

  const tableRows = useMemo(() => {
    return categories.map((category) => {
      const budgeted = displayBudgets[category] ?? 0
      const actual = actualByCategory[category] ?? 0
      const diff = budgeted - actual
      return { category, budgeted, actual, diff }
    })
  }, [categories, displayBudgets, actualByCategory])

  const totalBudgeted = useMemo(() => tableRows.reduce((s, r) => s + r.budgeted, 0), [tableRows])
  const totalActual = useMemo(() => tableRows.reduce((s, r) => s + r.actual, 0), [tableRows])
  const netDiff = totalBudgeted - totalActual

  const handleBudgetChange = async (category: string, amount: number): Promise<void> => {
    await window.electronAPI.invoke('set-budget', { monthKey, category, amount })
    // Optimistic update
    setAllBudgets((prev) => {
      const monthBudgets = { ...(prev[monthKey] ?? {}) }
      if (amount === 0) {
        delete monthBudgets[category]
      } else {
        monthBudgets[category] = amount
      }
      return { ...prev, [monthKey]: monthBudgets }
    })
  }

  return (
    <div className="budget-main" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Month selector row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setMonthKey((k) => adjustMonth(k, -1))}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '4px 10px',
              fontSize: 16,
            }}
            aria-label="Previous month"
          >
            &#9664;
          </button>
          <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', minWidth: 140, textAlign: 'center' }}>
            {formatMonthLabel(monthKey)}
          </span>
          <button
            onClick={() => setMonthKey((k) => adjustMonth(k, 1))}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '4px 10px',
              fontSize: 16,
            }}
            aria-label="Next month"
          >
            &#9654;
          </button>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            padding: '6px 16px',
            fontSize: 13,
            cursor: 'pointer',
            background: 'var(--color-accent)',
            color: '#1a1d23',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          Edit Budgets
        </button>
      </div>

      {/* Summary cards */}
      <div className="budget-summary-cards" style={{ display: 'flex', gap: 16 }}>
        <GlassCard style={{ flex: 1, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Total Budgeted</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{cad.format(totalBudgeted)}</div>
        </GlassCard>
        <GlassCard style={{ flex: 1, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Total Spent</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{cad.format(totalActual)}</div>
        </GlassCard>
        <GlassCard style={{ flex: 1, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Net Over/Under</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: netDiff >= 0 ? 'var(--color-income)' : 'var(--color-expense)' }}>
            {netDiff >= 0 ? '+' : ''}{cad.format(netDiff)}
          </div>
        </GlassCard>
      </div>

      {/* Comparison table */}
      <GlassCard style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Category', 'Budgeted', 'Actual', 'Over/Under'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '10px 16px',
                    textAlign: 'left',
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map(({ category, budgeted, actual, diff }) => {
              const overUnderLabel = (() => {
                if (budgeted === 0) return '—'
                const sign = diff >= 0 ? '+' : '-'
                const pct = Math.round(Math.abs(diff) / budgeted * 100)
                return `${sign}${cad.format(Math.abs(diff))} (${pct}%)`
              })()
              const overUnderColor = budgeted === 0 ? 'var(--text-muted)' : diff >= 0 ? 'var(--color-income)' : 'var(--color-expense)'

              return (
                <tr key={category}>
                  <td style={{ padding: '10px 16px', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                    {category}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                    {budgeted === 0 ? '—' : cad.format(budgeted)}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                    {cad.format(actual)}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.05)', color: overUnderColor, fontWeight: 500 }}>
                    {overUnderLabel}
                  </td>
                </tr>
              )
            })}
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  No categories found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </GlassCard>

      {/* BudgetModal */}
      {isModalOpen && (
        <BudgetModal
          categories={categories}
          monthKey={monthKey}
          budgets={displayBudgets}
          onBudgetChange={handleBudgetChange}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  )
}
