import React, { useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'

interface BalanceChartProps {
  transactions: Transaction[]
}

type ChartType = 'line' | 'bar'

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

const btnStyle = (active: boolean): React.CSSProperties => ({
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: active ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
  padding: 0,
})

const iconFill = (active: boolean): string => (active ? '#1a1d23' : 'var(--text-muted)')

export function BalanceChart({ transactions }: BalanceChartProps): JSX.Element {
  const [chartType, setChartType] = useState<ChartType>('line')

  // Sample if large dataset
  const step = transactions.length > 200 ? Math.ceil(transactions.length / 200) : 1
  const data = transactions
    .filter((_, i) => i % step === 0 || i === transactions.length - 1)
    .map((t) => ({
      date: t.date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
      balance: t.balance,
    }))

  const xAxisProps = {
    dataKey: 'date',
    tick: { fill: 'var(--text-muted)', fontSize: 10 },
    axisLine: false as const,
    tickLine: false as const,
    interval: 'preserveStartEnd' as const,
  }

  const yAxisProps = {
    tickFormatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
    tick: { fill: 'var(--text-muted)', fontSize: 11 },
    axisLine: false as const,
    tickLine: false as const,
    width: 48,
  }

  const tooltipProps = {
    contentStyle: { background: 'rgba(30,34,45,0.95)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 12 },
    labelStyle: { color: 'var(--text-primary)', marginBottom: 4 },
    formatter: (value: number): [string, string] => [fmt(value), 'Balance'],
  }

  return (
    <GlassCard style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Running Balance
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
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
        </div>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={220}>
          {chartType === 'line' ? (
            <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
              <Tooltip {...tooltipProps} />
              <Line type="monotone" dataKey="balance" stroke="var(--color-balance)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
              <Tooltip {...tooltipProps} />
              <Bar dataKey="balance" fill="var(--color-balance)" radius={[4, 4, 0, 0]} maxBarSize={16} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </GlassCard>
  )
}
