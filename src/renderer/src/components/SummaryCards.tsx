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

export function SummaryCards({ transactions, onCardClick }: SummaryCardsProps): JSX.Element {
  const totalIncome    = transactions.reduce((s, t) => s + t.income, 0)
  const totalSavings   = transactions.reduce((s, t) => SAVINGS_CATEGORIES.has(t.category) ? s + t.debit : s, 0)
  const totalExpenses  = transactions.reduce((s, t) => SAVINGS_CATEGORIES.has(t.category) ? s : s + t.debit, 0)
  const netCashFlow    = totalIncome - totalExpenses
  const currentBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0

  const cards: {
    label: string
    value: number
    icon: React.ReactNode
    color: string
    iconBg: string
    clickType?: 'income' | 'expenses' | 'savings'
  }[] = [
    {
      label: 'Total Income',
      value: totalIncome,
      icon: icons.income,
      color: 'var(--income)',
      iconBg: 'rgba(52,211,153,0.10)',
      clickType: 'income',
    },
    {
      label: 'Total Expenses',
      value: totalExpenses,
      icon: icons.expenses,
      color: 'var(--expense)',
      iconBg: 'rgba(248,113,113,0.10)',
      clickType: 'expenses',
    },
    {
      label: 'Savings',
      value: totalSavings,
      icon: icons.savings,
      color: 'var(--savings)',
      iconBg: 'rgba(167,139,250,0.10)',
      clickType: 'savings',
    },
    {
      label: 'Net Cash Flow',
      value: netCashFlow,
      icon: icons.cashflow,
      color: netCashFlow >= 0 ? 'var(--income)' : 'var(--expense)',
      iconBg: netCashFlow >= 0 ? 'rgba(52,211,153,0.10)' : 'rgba(248,113,113,0.10)',
    },
    {
      label: 'Balance',
      value: currentBalance,
      icon: icons.balance,
      color: currentBalance >= 0 ? 'var(--balance)' : 'var(--expense)',
      iconBg: 'rgba(96,165,250,0.10)',
    },
  ]

  return (
    <div className="summary-cards">
      {cards.map((card) => (
        <GlassCard
          key={card.label}
          style={{
            padding: '16px 18px',
            cursor: card.clickType ? 'pointer' : 'default',
            transition: 'transform 150ms ease, box-shadow 150ms ease',
          }}
          onClick={card.clickType && onCardClick ? () => onCardClick(card.clickType!) : undefined}
          className={card.clickType ? 'summary-card-clickable' : undefined}
        >
          {/* Label row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
            }}>
              {card.label}
            </span>
            <span style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: card.iconBg,
              color: card.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {card.icon}
            </span>
          </div>

          {/* Value */}
          <div style={{
            fontSize: 'clamp(14px, 1.4vw, 20px)',
            fontWeight: 700,
            color: card.color,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(card.value)}
          </div>
        </GlassCard>
      ))}
    </div>
  )
}
