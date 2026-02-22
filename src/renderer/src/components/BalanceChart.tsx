import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'

interface BalanceChartProps {
  transactions: Transaction[]
}

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

export function BalanceChart({ transactions }: BalanceChartProps): JSX.Element {
  // Sample if large dataset
  const step = transactions.length > 200 ? Math.ceil(transactions.length / 200) : 1
  const data = transactions
    .filter((_, i) => i % step === 0 || i === transactions.length - 1)
    .map((t) => ({
      date: t.date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
      balance: t.balance,
    }))

  return (
    <GlassCard style={{ padding: 24 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Running Balance
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{ background: 'rgba(30,34,45,0.95)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'var(--text-primary)', marginBottom: 4 }}
            formatter={(value: number) => [fmt(value), 'Balance']}
          />
          <Line type="monotone" dataKey="balance" stroke="var(--color-balance)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </GlassCard>
  )
}
