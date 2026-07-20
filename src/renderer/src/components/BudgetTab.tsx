import { useState, useEffect, useMemo } from 'react'
import { CaretLeft, CaretRight, PencilSimple, Wallet } from '@phosphor-icons/react'
import type { Transaction, BudgetMap, CategoryBudgets } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { BudgetModal } from './BudgetModal'

interface BudgetTabProps {
  transactions: Transaction[]
  categories: string[]
}

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cadShort = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

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

/** 0-100: how far through the given month "today" is. 100 for past months, 0 for future. */
function monthElapsedPct(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  const now = new Date()
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 1)
  if (now >= end) return 100
  if (now < start) return 0
  const daysInMonth = new Date(y, m, 0).getDate()
  return (now.getDate() / daysInMonth) * 100
}

function daysLeftInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  return Math.max(0, daysInMonth - new Date().getDate())
}

type RowStatus = 'over' | 'ahead' | 'ontrack' | 'unbudgeted' | 'idle'

interface Row {
  category: string
  budgeted: number
  actual: number
  diff: number
  pctUsed: number
  status: RowStatus
}

const STATUS_META: Record<RowStatus, { label: (r: Row) => string; cls: string }> = {
  over:       { label: (r) => `Over by ${cadShort.format(Math.abs(r.diff))}`, cls: 'budget-chip--over' },
  ahead:      { label: () => 'Ahead of pace', cls: 'budget-chip--ahead' },
  ontrack:    { label: () => 'On track', cls: 'budget-chip--ok' },
  unbudgeted: { label: () => 'Unbudgeted', cls: 'budget-chip--muted' },
  idle:       { label: () => 'No activity', cls: 'budget-chip--muted' },
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

  const elapsedPct = monthElapsedPct(monthKey)
  const isCurrentMonth = monthKey === getCurrentMonthKey()

  const rows = useMemo<Row[]>(() => {
    return categories.filter((c) => c !== 'SAVINGS!').map((category) => {
      const budgeted = displayBudgets[category] ?? 0
      const actual = actualByCategory[category] ?? 0
      const diff = budgeted - actual
      const pctUsed = budgeted > 0 ? (actual / budgeted) * 100 : 0
      let status: RowStatus
      if (budgeted === 0) status = actual > 0 ? 'unbudgeted' : 'idle'
      else if (diff < 0) status = 'over'
      else if (isCurrentMonth && pctUsed > elapsedPct + 10) status = 'ahead'
      else status = 'ontrack'
      return { category, budgeted, actual, diff, pctUsed, status }
    })
  }, [categories, displayBudgets, actualByCategory, elapsedPct, isCurrentMonth])

  // Problems first: over-budget, then highest %-used, then unbudgeted spend, then idle
  const sortedRows = useMemo(() => {
    const rank: Record<RowStatus, number> = { over: 0, ahead: 1, ontrack: 1, unbudgeted: 2, idle: 3 }
    return [...rows].sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
      if (a.budgeted > 0 && b.budgeted > 0) return b.pctUsed - a.pctUsed
      return b.actual - a.actual
    })
  }, [rows])

  const totalBudgeted = useMemo(() => rows.reduce((s, r) => s + r.budgeted, 0), [rows])
  const totalActual   = useMemo(() => rows.reduce((s, r) => s + (r.budgeted > 0 ? r.actual : 0), 0), [rows])
  const netDiff       = totalBudgeted - totalActual
  const totalPct      = totalBudgeted > 0 ? (totalActual / totalBudgeted) * 100 : 0
  const heroOver      = netDiff < 0
  const daysLeft      = daysLeftInMonth(monthKey)

  const heroStatus: RowStatus = heroOver ? 'over' : isCurrentMonth && totalPct > elapsedPct + 10 ? 'ahead' : 'ontrack'

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

  return (
    <div className="budget-main">
      {/* Toolbar: month pager + edit CTA */}
      <div className="budget-toolbar">
        <div className="month-pager" role="group" aria-label="Month selection">
          <button className="month-pager__btn" onClick={() => setMonthKey((k) => adjustMonth(k, -1))} aria-label="Previous month">
            <CaretLeft size={14} weight="bold" />
          </button>
          <span className="month-pager__label">{formatMonthLabel(monthKey)}</span>
          <button className="month-pager__btn" onClick={() => setMonthKey((k) => adjustMonth(k, 1))} aria-label="Next month">
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <PencilSimple size={13} weight="bold" />
          Edit Budgets
        </button>
      </div>

      {/* Hero overview */}
      {totalBudgeted > 0 ? (
        <GlassCard className="budget-hero">
          <div className="budget-hero__main">
            <div className="budget-hero__label">Spent in {formatMonthLabel(monthKey)}</div>
            <div className="budget-hero__value">
              {cad.format(totalActual)}
              <span className="budget-hero__of"> of {cad.format(totalBudgeted)} budgeted</span>
            </div>
            <div
              className="budget-bar budget-bar--hero"
              role="progressbar"
              aria-valuenow={Math.round(totalPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${Math.round(totalPct)}% of total budget used`}
            >
              <div
                className={`budget-bar__fill${heroOver ? ' budget-bar__fill--over' : ''}`}
                style={{ width: `${Math.min(totalPct, 100)}%` }}
              />
              {isCurrentMonth && elapsedPct > 0 && elapsedPct < 100 && (
                <div className="budget-bar__tick" style={{ left: `${elapsedPct}%` }} title="Where today falls in the month" />
              )}
            </div>
            <div className="budget-hero__meta">
              {Math.round(totalPct)}% used
              {isCurrentMonth && ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
            </div>
          </div>
          <div className="budget-hero__side">
            <div className="budget-hero__side-label">{heroOver ? 'Over budget' : 'Remaining'}</div>
            <div className={`budget-hero__side-value ${heroOver ? 'budget-hero__side-value--over' : ''}`}>
              {heroOver ? '−' : ''}{cad.format(Math.abs(netDiff))}
            </div>
            <span className={`budget-chip ${STATUS_META[heroStatus].cls}`}>
              {STATUS_META[heroStatus].label({ diff: netDiff } as Row)}
            </span>
          </div>
        </GlassCard>
      ) : (
        <GlassCard className="budget-hero budget-hero--empty">
          <Wallet size={28} weight="duotone" style={{ color: 'var(--accent)' }} />
          <div>
            <div className="budget-hero__label">No budgets set for {formatMonthLabel(monthKey)}</div>
            <div className="budget-hero__meta">Set category budgets to start tracking progress.</div>
          </div>
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>Set Budgets</button>
        </GlassCard>
      )}

      {/* Category insight cards */}
      <div className="budget-grid">
        {sortedRows.map((row) => {
          const { category, budgeted, actual, diff, pctUsed, status } = row
          const hasBudget = budgeted > 0
          const over = status === 'over'
          const remainingText = hasBudget
            ? over ? `${cad.format(Math.abs(diff))} over` : `${cad.format(diff)} left`
            : actual > 0 ? 'no budget set' : 'no activity'
          const ariaLabel = hasBudget
            ? `${category}: ${cad.format(actual)} spent of ${cad.format(budgeted)}, ${remainingText}. Edit budget.`
            : `${category}: ${cad.format(actual)} spent, ${remainingText}. Edit budget.`
          return (
            <button
              key={category}
              className={`glass-card budget-card${over ? ' budget-card--over' : ''}${!hasBudget ? ' budget-card--nobudget' : ''}`}
              onClick={() => setIsModalOpen(true)}
              aria-label={ariaLabel}
            >
              <div className="budget-card__top">
                <span className="budget-card__name">{category}</span>
                <span className={`budget-chip ${STATUS_META[status].cls}`}>{STATUS_META[status].label(row)}</span>
              </div>
              <div className="budget-card__nums">
                <span className="budget-card__spent">{cad.format(actual)}</span>
                {hasBudget && <span className="budget-card__of">/ {cadShort.format(budgeted)}</span>}
              </div>
              {hasBudget && (
                <div
                  className="budget-bar"
                  role="progressbar"
                  aria-valuenow={Math.round(pctUsed)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`budget-bar__fill${over ? ' budget-bar__fill--over' : ''}`}
                    style={{ width: `${Math.min(pctUsed, 100)}%` }}
                  />
                  {isCurrentMonth && elapsedPct > 0 && elapsedPct < 100 && (
                    <div className="budget-bar__tick" style={{ left: `${elapsedPct}%` }} />
                  )}
                </div>
              )}
              <div className="budget-card__bottom">
                <span className={`budget-card__remaining${over ? ' budget-card__remaining--over' : ''}`}>
                  {remainingText}
                </span>
                {hasBudget && <span className="budget-card__pct">{Math.round(pctUsed)}%</span>}
              </div>
            </button>
          )
        })}
        {categories.length === 0 && (
          <p className="budget-grid__empty">No categories found</p>
        )}
      </div>

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
