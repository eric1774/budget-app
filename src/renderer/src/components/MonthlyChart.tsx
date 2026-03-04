import React, { useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'

interface MonthlyChartProps {
  transactions: Transaction[]
}

type ChartType = 'bar' | 'line'

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

const btnStyle = (active: boolean): React.CSSProperties => ({
  width: 28,
  height: 28,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 7,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
  padding: 0,
  transition: 'background 150ms ease, border-color 150ms ease',
})

const iconFill = (active: boolean): string => (active ? 'var(--accent)' : 'var(--text-muted)')

export function MonthlyChart({ transactions }: MonthlyChartProps): JSX.Element {
  const [chartType, setChartType] = useState<ChartType>('bar')

  const EXPENSE_EXCLUDE = new Set(['SAVINGS!', 'House Fund', 'Retirement'])

  // Group by YYYY-MM
  const monthMap = new Map<string, { income: number; expense: number; label: string }>()
  for (const t of transactions) {
    const key = t.date.toISOString().slice(0, 7)
    const label = t.date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short' })
    if (!monthMap.has(key)) monthMap.set(key, { income: 0, expense: 0, label })
    const entry = monthMap.get(key)!
    entry.income += t.income
    if (!EXPENSE_EXCLUDE.has(t.category)) entry.expense += t.debit
  }
  const data = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ month: v.label, income: v.income, expense: v.expense }))

  const tooltipProps = {
    contentStyle: { background: 'rgba(30,34,45,0.95)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 12 },
    labelStyle: { color: 'var(--text-primary)', marginBottom: 4 },
    formatter: (value: number, name: string): [string, string] => [fmt(value), name === 'income' ? 'Income' : 'Expenses'],
  }

  const legendProps = {
    formatter: (v: string) => (v === 'income' ? 'Income' : 'Expenses'),
    wrapperStyle: { fontSize: 12, color: 'var(--text-muted)' },
  }

  const xAxisProps = {
    dataKey: 'month',
    tick: { fill: 'var(--text-muted)', fontSize: 11 },
    axisLine: false as const,
    tickLine: false as const,
  }

  const yAxisProps = {
    tickFormatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
    tick: { fill: 'var(--text-muted)', fontSize: 11 },
    axisLine: false as const,
    tickLine: false as const,
    width: 48,
  }

  return (
    <GlassCard style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Monthly Income vs Expenses
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="chart-type-btn"
            style={btnStyle(chartType === 'bar')}
            onClick={() => setChartType('bar')}
            title="Bar chart"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill={iconFill(chartType === 'bar')}>
              <rect x="1" y="9" width="3" height="6" />
              <rect x="6" y="5" width="3" height="10" />
              <rect x="11" y="2" width="3" height="13" />
            </svg>
          </button>
          <button
            className="chart-type-btn"
            style={btnStyle(chartType === 'line')}
            onClick={() => setChartType('line')}
            title="Line chart"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={iconFill(chartType === 'line')} strokeWidth="2">
              <polyline points="1,13 5,8 9,10 15,3" />
            </svg>
          </button>
        </div>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={260}>
          {chartType === 'bar' ? (
            <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              <Line type="monotone" dataKey="income" stroke="var(--color-income)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="expense" stroke="var(--color-expense)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </GlassCard>
  )
}
