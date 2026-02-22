import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'

interface MonthlyChartProps {
  transactions: Transaction[]
}

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

export function MonthlyChart({ transactions }: MonthlyChartProps): JSX.Element {
  // Group by YYYY-MM
  const monthMap = new Map<string, { income: number; expense: number; label: string }>()
  for (const t of transactions) {
    const key = t.date.toISOString().slice(0, 7)
    const label = t.date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short' })
    if (!monthMap.has(key)) monthMap.set(key, { income: 0, expense: 0, label })
    const entry = monthMap.get(key)!
    entry.income += t.income
    entry.expense += t.debit
  }
  const data = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ month: v.label, income: v.income, expense: v.expense }))

  return (
    <GlassCard style={{ padding: 24 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Monthly Income vs Expenses
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            contentStyle={{ background: 'rgba(30,34,45,0.95)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'var(--text-primary)', marginBottom: 4 }}
            formatter={(value: number, name: string) => [fmt(value), name === 'income' ? 'Income' : 'Expenses']}
          />
          <Legend formatter={(v) => v === 'income' ? 'Income' : 'Expenses'} wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
          <Line type="monotone" dataKey="income" stroke="var(--color-income)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="expense" stroke="var(--color-expense)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </GlassCard>
  )
}
