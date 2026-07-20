import { useState } from 'react'
import {
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import type { Transaction } from '../../../shared/types'
import { ChartCard, ChartToggle, ChartStat, TooltipShell, chartIcons, chartGridProps, axisTick } from './ChartCard'

interface MonthlyChartProps {
  transactions: Transaction[]
}

type ChartType = 'bar' | 'line'

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

const fmtShort = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

interface MonthDatum {
  month: string
  income: number
  expense: number
  net: number
}

function MonthlyTip({ active, payload, label }: {
  active?: boolean
  payload?: { payload?: MonthDatum }[]
  label?: string
}): JSX.Element | null {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <TooltipShell
      label={label}
      rows={[
        { name: 'Income', value: fmt(d.income), color: 'var(--income)' },
        { name: 'Expenses', value: fmt(d.expense), color: 'var(--expense)' },
      ]}
      footer={{ name: 'Net', value: fmt(d.net), color: d.net >= 0 ? 'var(--income)' : 'var(--expense)' }}
    />
  )
}

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
  const data: MonthDatum[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ month: v.label, income: v.income, expense: v.expense, net: v.income - v.expense }))

  // Insight: average monthly net across the visible range
  const avgNet = data.length > 0 ? data.reduce((s, d) => s + d.net, 0) / data.length : 0
  const hasNegativeNet = data.some((d) => d.net < 0)

  const legendProps = {
    formatter: (v: string) => (v === 'income' ? 'Income' : v === 'expense' ? 'Expenses' : 'Net'),
    wrapperStyle: { fontSize: 12, color: 'var(--text-secondary)' },
    iconType: 'circle' as const,
    iconSize: 8,
  }

  const xAxisProps = {
    dataKey: 'month',
    tick: axisTick,
    axisLine: false as const,
    tickLine: false as const,
  }

  const yAxisProps = {
    tickFormatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
    tick: axisTick,
    axisLine: false as const,
    tickLine: false as const,
    width: 48,
  }

  return (
    <ChartCard
      title="Monthly Income vs Expenses"
      stat={
        data.length > 0 ? (
          <ChartStat color={avgNet >= 0 ? 'var(--income)' : 'var(--expense)'}>
            {avgNet >= 0 ? '↑' : '↓'} {fmtShort(Math.abs(avgNet))}/mo avg net
          </ChartStat>
        ) : undefined
      }
      actions={
        <ChartToggle<ChartType>
          value={chartType}
          onChange={setChartType}
          options={[
            { value: 'bar', label: 'Bar chart view', icon: chartIcons.bar },
            { value: 'line', label: 'Line chart view', icon: chartIcons.line },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        {chartType === 'bar' ? (
          <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0.5} />
              </linearGradient>
              <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F87171" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#F87171" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid {...chartGridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            {hasNegativeNet && <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />}
            <Tooltip content={<MonthlyTip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Legend {...legendProps} />
            <Bar dataKey="income" fill="url(#gradIncome)" radius={[4, 4, 0, 0]} maxBarSize={32} animationDuration={600} />
            <Bar dataKey="expense" fill="url(#gradExpense)" radius={[4, 4, 0, 0]} maxBarSize={32} animationDuration={600} />
            <Line
              type="monotone"
              dataKey="net"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: 'rgba(45,212,191,0.3)', strokeWidth: 6 }}
              animationDuration={700}
            />
          </ComposedChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid {...chartGridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            {hasNegativeNet && <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />}
            <Tooltip content={<MonthlyTip />} />
            <Legend {...legendProps} />
            <Line type="monotone" dataKey="income" stroke="var(--color-income)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} animationDuration={600} />
            <Line type="monotone" dataKey="expense" stroke="var(--color-expense)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} animationDuration={600} />
            <Line type="monotone" dataKey="net" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} animationDuration={700} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  )
}
