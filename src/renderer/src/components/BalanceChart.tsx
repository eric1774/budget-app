import { useState } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import type { Transaction } from '../../../shared/types'
import { ChartCard, ChartToggle, chartIcons, chartTooltipProps, chartGridProps, axisTick, axisTickSmall } from './ChartCard'

interface BalanceChartProps {
  transactions: Transaction[]
}

type ChartType = 'line' | 'bar'

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

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
    tick: axisTickSmall,
    axisLine: false as const,
    tickLine: false as const,
    interval: 'preserveStartEnd' as const,
  }

  const yAxisProps = {
    tickFormatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
    tick: axisTick,
    axisLine: false as const,
    tickLine: false as const,
    width: 48,
  }

  const tooltipProps = {
    ...chartTooltipProps,
    formatter: (value: number | undefined): [string, string] => [fmt(value ?? 0), 'Balance'],
  }

  return (
    <ChartCard
      title="Running Balance"
      actions={
        <ChartToggle<ChartType>
          value={chartType}
          onChange={setChartType}
          options={[
            { value: 'line', label: 'Line chart view', icon: chartIcons.line },
            { value: 'bar', label: 'Bar chart view', icon: chartIcons.bar },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={220}>
        {chartType === 'line' ? (
          <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...chartGridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
            <Tooltip {...tooltipProps} />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="var(--color-balance)"
              strokeWidth={2}
              fill="url(#gradBalance)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid {...chartGridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
            <Tooltip {...tooltipProps} />
            <Bar dataKey="balance" fill="var(--color-balance)" radius={[4, 4, 0, 0]} maxBarSize={16} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  )
}
