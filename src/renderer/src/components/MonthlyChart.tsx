import { useState } from 'react'
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
  CartesianGrid,
} from 'recharts'
import type { Transaction } from '../../../shared/types'
import { ChartCard, ChartToggle, chartIcons, chartTooltipProps, chartGridProps, axisTick } from './ChartCard'

interface MonthlyChartProps {
  transactions: Transaction[]
}

type ChartType = 'bar' | 'line'

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

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
    ...chartTooltipProps,
    formatter: (value: number | undefined, name: string | undefined): [string, string] => [fmt(value ?? 0), name === 'income' ? 'Income' : 'Expenses'],
    cursor: { fill: 'rgba(255,255,255,0.05)' },
  }

  const legendProps = {
    formatter: (v: string) => (v === 'income' ? 'Income' : 'Expenses'),
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
          <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F87171" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#F87171" stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid {...chartGridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip {...tooltipProps} />
            <Legend {...legendProps} />
            <Bar dataKey="income" fill="url(#gradIncome)" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="expense" fill="url(#gradExpense)" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid {...chartGridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip {...tooltipProps} />
            <Legend {...legendProps} />
            <Line type="monotone" dataKey="income" stroke="var(--color-income)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="expense" stroke="var(--color-expense)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  )
}
