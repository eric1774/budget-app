import React from 'react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
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

type Metric = 'income' | 'expenses' | 'savings' | 'net' | 'balance'

/**
 * Trend series for the sparklines. Buckets by month across multi-month
 * ranges, by day when the filter shows a single month. Balance uses the
 * last known balance per bucket; other metrics sum within the bucket.
 */
function buildSeries(transactions: Transaction[]): Record<Metric, { v: number }[]> {
  const empty: Record<Metric, { v: number }[]> = { income: [], expenses: [], savings: [], net: [], balance: [] }
  if (transactions.length === 0) return empty

  const monthKeys = new Set<string>()
  for (const t of transactions) monthKeys.add(t.date.toISOString().slice(0, 7))
  const byDay = monthKeys.size < 2

  const buckets = new Map<string, { income: number; expenses: number; savings: number; balance: number }>()
  for (const t of transactions) {
    const key = byDay ? t.date.toISOString().slice(0, 10) : t.date.toISOString().slice(0, 7)
    if (!buckets.has(key)) buckets.set(key, { income: 0, expenses: 0, savings: 0, balance: t.balance })
    const b = buckets.get(key)!
    b.income += t.income
    if (SAVINGS_CATEGORIES.has(t.category)) b.savings += t.debit
    else b.expenses += t.debit
    b.balance = t.balance
  }

  const ordered = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, b]) => b)
  return {
    income: ordered.map((b) => ({ v: b.income })),
    expenses: ordered.map((b) => ({ v: b.expenses })),
    savings: ordered.map((b) => ({ v: b.savings })),
    net: ordered.map((b) => ({ v: b.income - b.expenses })),
    balance: ordered.map((b) => ({ v: b.balance })),
  }
}

interface SparkProps {
  data: { v: number }[]
  hex: string
  id: string
}

function Sparkline({ data, hex, id }: SparkProps): JSX.Element | null {
  if (data.length < 2) return null
  return (
    <div className="summary-card__spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height={34}>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hex} stopOpacity={0.35} />
              <stop offset="100%" stopColor={hex} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={hex}
            strokeWidth={1.5}
            strokeOpacity={0.75}
            fill={`url(#${id})`}
            dot={false}
            isAnimationActive={true}
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

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

  const series = buildSeries(transactions)

  const cards: {
    key: Metric
    label: string
    value: number
    icon: React.ReactNode
    color: string
    hex: string
    sub?: string
    clickType?: 'income' | 'expenses' | 'savings'
  }[] = [
    {
      key: 'income',
      label: 'Income',
      value: totalIncome,
      icon: <TrendUp size={16} weight="duotone" />,
      color: 'var(--income)',
      hex: '#34D399',
      sub: depositCount > 0 ? `${depositCount} deposit${depositCount === 1 ? '' : 's'}` : undefined,
      clickType: 'income',
    },
    {
      key: 'expenses',
      label: 'Expenses',
      value: totalExpenses,
      icon: <TrendDown size={16} weight="duotone" />,
      color: 'var(--expense)',
      hex: '#F87171',
      sub: expensesPct ? `${expensesPct} of income` : undefined,
      clickType: 'expenses',
    },
    {
      key: 'savings',
      label: 'Savings',
      value: totalSavings,
      icon: <PiggyBank size={16} weight="duotone" />,
      color: 'var(--savings)',
      hex: '#A78BFA',
      sub: savingsPct ? `${savingsPct} of income` : undefined,
      clickType: 'savings',
    },
    {
      key: 'net',
      label: 'Cash Flow',
      value: netCashFlow,
      icon: <ArrowsLeftRight size={16} weight="duotone" />,
      color: netCashFlow >= 0 ? 'var(--income)' : 'var(--expense)',
      hex: netCashFlow >= 0 ? '#34D399' : '#F87171',
      sub: netPct ? (netCashFlow >= 0 ? `${netPct} of income kept` : `${netPct} over income`) : undefined,
    },
    {
      key: 'balance',
      label: 'Balance',
      value: currentBalance,
      icon: <Wallet size={16} weight="duotone" />,
      color: currentBalance >= 0 ? 'var(--balance)' : 'var(--expense)',
      hex: currentBalance >= 0 ? '#60A5FA' : '#F87171',
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
            <Sparkline data={series[card.key]} hex={card.hex} id={`spark-${card.key}`} />
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
