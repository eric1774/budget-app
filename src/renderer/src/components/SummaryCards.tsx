import React from 'react'
import type { Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { SAVINGS_CATEGORIES } from '../config'

interface SummaryCardsProps {
  transactions: Transaction[]
}

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

export function SummaryCards({ transactions }: SummaryCardsProps): JSX.Element {
  const totalIncome = transactions.reduce((s, t) => s + t.income, 0)
  const totalSavings = transactions.reduce((s, t) => SAVINGS_CATEGORIES.has(t.category) ? s + t.debit : s, 0)
  const totalExpenses = transactions.reduce((s, t) => SAVINGS_CATEGORIES.has(t.category) ? s : s + t.debit, 0)
  const netCashFlow = totalIncome - totalExpenses - totalSavings
  const currentBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0

  const cards = [
    { label: 'Total Income', value: totalIncome, icon: '↑', color: 'var(--color-income)' },
    { label: 'Total Expenses', value: totalExpenses, icon: '↓', color: 'var(--color-expense)' },
    { label: 'Savings', value: totalSavings, icon: '⬆', color: '#7c85f5' },
    { label: 'Net Cash Flow', value: netCashFlow, icon: '⇄', color: netCashFlow >= 0 ? 'var(--color-income)' : 'var(--color-expense)' },
    { label: 'Current Balance', value: currentBalance, icon: '◈', color: currentBalance >= 0 ? 'var(--color-income)' : 'var(--color-expense)' },
  ]

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {cards.map((card) => (
        <GlassCard key={card.label} style={{ flex: 1, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{card.icon}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: card.color }}>{fmt(card.value)}</div>
        </GlassCard>
      ))}
    </div>
  )
}
