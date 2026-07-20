import React from 'react'
import { TrendUp, TrendDown, PiggyBank, ArrowsLeftRight, Wallet } from '@phosphor-icons/react'
import type { Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { SAVINGS_CATEGORIES } from '../config'

interface SummaryCardsProps {
  transactions: Transaction[]
  onCardClick?: (cardType: 'income' | 'expenses' | 'savings') => void
}

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

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
      icon: <TrendUp size={16} weight="duotone" />,
      color: 'var(--income)',
      sub: depositCount > 0 ? `${depositCount} deposit${depositCount === 1 ? '' : 's'}` : undefined,
      clickType: 'income',
    },
    {
      label: 'Expenses',
      value: totalExpenses,
      icon: <TrendDown size={16} weight="duotone" />,
      color: 'var(--expense)',
      sub: expensesPct ? `${expensesPct} of income` : undefined,
      clickType: 'expenses',
    },
    {
      label: 'Savings',
      value: totalSavings,
      icon: <PiggyBank size={16} weight="duotone" />,
      color: 'var(--savings)',
      sub: savingsPct ? `${savingsPct} of income` : undefined,
      clickType: 'savings',
    },
    {
      label: 'Cash Flow',
      value: netCashFlow,
      icon: <ArrowsLeftRight size={16} weight="duotone" />,
      color: netCashFlow >= 0 ? 'var(--income)' : 'var(--expense)',
      sub: netPct ? (netCashFlow >= 0 ? `${netPct} of income kept` : `${netPct} over income`) : undefined,
    },
    {
      label: 'Balance',
      value: currentBalance,
      icon: <Wallet size={16} weight="duotone" />,
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
