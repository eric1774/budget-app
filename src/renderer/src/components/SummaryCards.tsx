import React from 'react'
import type { Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { SAVINGS_CATEGORIES } from '../config'

interface SummaryCardsProps {
  transactions: Transaction[]
  onCardClick?: (cardType: 'income' | 'expenses' | 'savings') => void
}

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

// SVG icons — clean Lucide-style
const icons = {
  income: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  expenses: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>
    </svg>
  ),
  savings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  cashflow: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  ),
  balance: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  ),
}

const pctOf = (part: number, whole: number): string | undefined =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : undefined

export function SummaryCards({ transactions, onCardClick }: SummaryCardsProps): JSX.Element {
  const totalIncome    = transactions.reduce((s, t) => s + t.income, 0)
  const totalSavings   = transactions.reduce((s, t) => SAVINGS_CATEGORIES.has(t.category) ? s + t.debit : s, 0)
  const totalExpenses  = transactions.reduce((s, t) => SAVINGS_CATEGORIES.has(t.category) ? s : s + t.debit, 0)
  const netCashFlow    = totalIncome - totalExpenses
  const currentBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0
  const depositCount   = transactions.reduce((n, t) => (t.income > 0 ? n + 1 : n), 0)

  const expensesPct = pctOf(totalExpenses, totalIncome)
  const savingsPct  = pctOf(totalSavings, totalIncome)
  const netPct      = pctOf(Math.abs(netCashFlow), totalIncome)

  const cards: {
    label: string
    value: number
    icon: React.ReactNode
    color: string
    sub?: string
    clickType?: 'income' | 'expenses' | 'savings'
  }[] = [
    {
      label: 'Income',
      value: totalIncome,
      icon: icons.income,
      color: 'var(--income)',
      sub: depositCount > 0 ? `${depositCount} deposit${depositCount === 1 ? '' : 's'}` : undefined,
      clickType: 'income',
    },
    {
      label: 'Expenses',
      value: totalExpenses,
      icon: icons.expenses,
      color: 'var(--expense)',
      sub: expensesPct ? `${expensesPct} of income` : undefined,
      clickType: 'expenses',
    },
    {
      label: 'Savings',
      value: totalSavings,
      icon: icons.savings,
      color: 'var(--savings)',
      sub: savingsPct ? `${savingsPct} of income` : undefined,
      clickType: 'savings',
    },
    {
      label: 'Cash Flow',
      value: netCashFlow,
      icon: icons.cashflow,
      color: netCashFlow >= 0 ? 'var(--income)' : 'var(--expense)',
      sub: netPct ? (netCashFlow >= 0 ? `${netPct} of income kept` : `${netPct} over income`) : undefined,
    },
    {
      label: 'Balance',
      value: currentBalance,
      icon: icons.balance,
      color: currentBalance >= 0 ? 'var(--balance)' : 'var(--expense)',
    },
  ]

  return (
    <div className="summary-cards">
      {cards.map((card) => {
        // padding included so GlassCard's inline default doesn't override .summary-card
        const accentStyle = { '--card-accent': card.color, padding: '14px 16px' } as React.CSSProperties
        const body = (
          <>
            <div className="summary-card__top">
              <span className="summary-card__label">{card.label}</span>
              <span className="summary-card__icon" aria-hidden="true">{card.icon}</span>
            </div>
            <div className="summary-card__value">{fmt(card.value)}</div>
            {card.sub && <div className="summary-card__sub">{card.sub}</div>}
          </>
        )
        // Clickable cards are real buttons so they work with keyboard + screen readers
        if (card.clickType && onCardClick) {
          const type = card.clickType
          return (
            <button
              key={card.label}
              className="glass-card summary-card summary-card-clickable"
              style={accentStyle}
              onClick={() => onCardClick(type)}
              aria-label={`${card.label} ${fmt(card.value)} — view matching transactions`}
            >
              {body}
            </button>
          )
        }
        return (
          <GlassCard key={card.label} className="summary-card" style={accentStyle}>
            {body}
          </GlassCard>
        )
      })}
    </div>
  )
}
