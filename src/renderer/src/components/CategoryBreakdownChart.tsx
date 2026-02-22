import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'

interface CategoryBreakdownChartProps {
  transactions: Transaction[]
}

const COLORS = ['#20c8a0', '#06b6d4', '#818cf8', '#fb923c', '#f472b6', '#a78bfa', '#34d399', '#60a5fa']

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

export function CategoryBreakdownChart({ transactions }: CategoryBreakdownChartProps): JSX.Element {
  const currentYear = new Date().getFullYear()
  const ytd = transactions.filter((t) => t.date.getFullYear() === currentYear)

  const catMap = new Map<string, number>()
  for (const t of ytd) {
    catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.debit)
  }
  const data = Array.from(catMap.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)

  // Dynamic bar size: if many categories, reduce bar height for readability
  const barSize = Math.max(12, Math.min(28, Math.floor(180 / Math.max(data.length, 1))))
  const chartHeight = Math.max(220, data.length * (barSize + 10) + 40)

  return (
    <GlassCard style={{ padding: 24 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        YTD Category Breakdown
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="category" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
          <Tooltip
            contentStyle={{ background: 'rgba(30,34,45,0.95)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'var(--text-primary)', marginBottom: 4 }}
            formatter={(value: number) => [fmt(value), 'Spent YTD']}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="total" barSize={barSize} radius={[0, 4, 4, 0]}>
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassCard>
  )
}
