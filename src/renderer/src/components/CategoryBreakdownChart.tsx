import React, { useState, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import type { Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'

interface CategoryBreakdownChartProps {
  transactions: Transaction[]
  onCategoryDoubleClick?: (category: string) => void
}

type ChartType = 'bar' | 'pie'

const COLORS = ['#20c8a0', '#06b6d4', '#818cf8', '#fb923c', '#f472b6', '#a78bfa', '#34d399', '#60a5fa']

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

export function CategoryBreakdownChart({ transactions, onCategoryDoubleClick }: CategoryBreakdownChartProps): JSX.Element {
  const [chartType, setChartType] = useState<ChartType>('bar')
  const lastClickRef = useRef<{ category: string; time: number } | null>(null)

  const handleCategoryClick = (category: string): void => {
    if (!onCategoryDoubleClick) return
    const now = Date.now()
    if (lastClickRef.current && lastClickRef.current.category === category && now - lastClickRef.current.time < 350) {
      onCategoryDoubleClick(category)
      lastClickRef.current = null
    } else {
      lastClickRef.current = { category, time: now }
    }
  }

  const catMap = new Map<string, number>()
  for (const t of transactions) {
    catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.debit)
  }
  const data = Array.from(catMap.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)

  // Dynamic bar size: if many categories, reduce bar height for readability
  const barSize = Math.max(12, Math.min(28, Math.floor(180 / Math.max(data.length, 1))))
  const chartHeight = Math.max(220, data.length * (barSize + 10) + 40)

  const tooltipStyle = {
    contentStyle: { background: 'rgba(30,34,45,0.95)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 12 },
    labelStyle: { color: 'var(--text-primary)', marginBottom: 4 },
    itemStyle: { color: '#ffffff' },
  }

  return (
    <GlassCard style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Category Breakdown
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
            style={btnStyle(chartType === 'pie')}
            onClick={() => setChartType('pie')}
            title="Pie chart"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill={iconFill(chartType === 'pie')}>
              <path d="M8 8 L8 1 A7 7 0 0 1 15 8 Z" />
              <circle cx="8" cy="8" r="7" fill="none" stroke={iconFill(chartType === 'pie')} strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>
      <div className="chart-container">
        {data.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>No categories selected</p>
        ) : chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="category" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number) => [fmt(value), 'Spent YTD']}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="total" barSize={barSize} radius={[0, 4, 4, 0]} onClick={(entry) => handleCategoryClick(entry.category)} style={{ cursor: onCategoryDoubleClick ? 'pointer' : undefined }}>
                {data.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                nameKey="category"
                dataKey="total"
                cx="50%"
                cy="50%"
                outerRadius={100}
                onClick={(entry) => handleCategoryClick(entry.category)}
                style={{ cursor: onCategoryDoubleClick ? 'pointer' : undefined }}
              >
                {data.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number, name: string) => [fmt(value), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </GlassCard>
  )
}
