import { useState, useEffect, useMemo } from 'react'
import type { Transaction, BudgetMap, CategoryBudgets } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { BudgetModal } from './BudgetModal'

interface BudgetTabProps {
  transactions: Transaction[]
  categories: string[]
}

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
  const [monthKey, setMonthKey] = useState<string>(() => {
    if (!transactions.length) return getCurrentMonthKey()
    const latest = transactions.reduce((max, t) => (t.date > max ? t.date : max), transactions[0].date)
    return `${latest.getFullYear()}-${String(latest.getMonth() + 1).padStart(2, '0')}`
  })
  const [allBudgets, setAllBudgets] = useState<BudgetMap>({})
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.invoke('get-budgets').then((data) => {
        setAllBudgets((data as BudgetMap) ?? {})
      })
    } else {
      fetch('/api/budgets')
        .then((r) => r.json())
        .then((data) => setAllBudgets((data as BudgetMap) ?? {}))
        .catch(() => {})
    }
  }, [monthKey])

  const prevMonthKey = useMemo(() => adjustMonth(monthKey, -1), [monthKey])

  const displayBudgets = useMemo<CategoryBudgets>(() => {
    if (allBudgets[monthKey]) return allBudgets[monthKey]
    return allBudgets[prevMonthKey] ?? {}
  }, [allBudgets, monthKey, prevMonthKey])

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
    return categories.filter((c) => c !== 'SAVINGS!').map((category) => {
      const budgeted = displayBudgets[category] ?? 0
      const actual   = actualByCategory[category] ?? 0
      const diff     = budgeted - actual
      const pct      = budgeted > 0 ? Math.min((actual / budgeted) * 100, 100) : 0
      const overPct  = budgeted > 0 ? Math.round(Math.abs(diff) / budgeted * 100) : 0
      return { category, budgeted, actual, diff, pct, overPct }
    })
  }, [categories, displayBudgets, actualByCategory])

  const totalBudgeted = useMemo(() => tableRows.reduce((s, r) => s + r.budgeted, 0), [tableRows])
  const totalActual   = useMemo(() => tableRows.reduce((s, r) => s + r.actual, 0), [tableRows])
  const netDiff       = totalBudgeted - totalActual

  const handleBudgetChange = async (category: string, amount: number): Promise<void> => {
    if (window.electronAPI) {
      await window.electronAPI.invoke('set-budget', { monthKey, category, amount })
    } else {
      await fetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthKey, category, amount }),
      }).catch(() => {})
    }
    setAllBudgets((prev) => {
      const monthBudgets = { ...(prev[monthKey] ?? {}) }
      if (amount === 0) delete monthBudgets[category]
      else monthBudgets[category] = amount
      return { ...prev, [monthKey]: monthBudgets }
    })
  }

  const navBtn: React.CSSProperties = {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease',
    fontSize: 14,
  }

  return (
    <div className="budget-main">
      {/* Month selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setMonthKey((k) => adjustMonth(k, -1))}
            style={navBtn}
            aria-label="Previous month"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', minWidth: 150, textAlign: 'center' }}>
            {formatMonthLabel(monthKey)}
          </span>
          <button
            onClick={() => setMonthKey((k) => adjustMonth(k, 1))}
            style={navBtn}
            aria-label="Next month"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          Edit Budgets
        </button>
      </div>

      {/* Summary cards */}
      <div className="budget-summary-cards">
        {[
          { label: 'Budgeted', value: totalBudgeted, color: 'var(--text-primary)' },
          { label: 'Spent',    value: totalActual,   color: 'var(--text-primary)' },
          { label: netDiff >= 0 ? 'Under Budget' : 'Over Budget',
            value: Math.abs(netDiff),
            color: netDiff >= 0 ? 'var(--income)' : 'var(--expense)',
          },
        ].map((card) => (
          <GlassCard key={card.label} style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
              {card.label !== 'Budgeted' && card.label !== 'Spent' && (netDiff >= 0 ? '+' : '−')}
              {cad.format(card.value)}
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Comparison table */}
      <GlassCard style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Category', 'Budgeted', 'Spent', 'Over / Under'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px',
                      textAlign: i === 0 ? 'left' : 'right',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--bg-surface)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map(({ category, budgeted, actual, diff, pct, overPct }) => {
                const isOver    = budgeted > 0 && diff < 0
                const barColor  = isOver ? 'var(--expense)' : 'var(--income)'
                const diffColor = budgeted === 0 ? 'var(--text-muted)' : diff >= 0 ? 'var(--income)' : 'var(--expense)'
                const diffLabel = budgeted === 0 ? '—' : `${diff >= 0 ? '+' : '−'}${cad.format(Math.abs(diff))}${budgeted > 0 ? ` (${overPct}%)` : ''}`

                return (
                  <tr key={category}>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: budgeted > 0 ? 4 : 0 }}>
                        {category}
                      </div>
                      {budgeted > 0 && (
                        <div className="progress-bar-track">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${pct}%`, background: barColor }}
                          />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {budgeted === 0 ? <span style={{ color: 'var(--text-muted)' }}>—</span> : cad.format(budgeted)}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {cad.format(actual)}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid var(--border-subtle)', color: diffColor, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {diffLabel}
                    </td>
                  </tr>
                )
              })}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                    No categories found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

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
