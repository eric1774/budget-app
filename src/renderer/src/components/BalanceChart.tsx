import { useState } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid } from 'recharts'
import type { Transaction } from '../../../shared/types'
import { ChartCard, ChartToggle, ChartStat, TooltipShell, chartIcons, chartGridProps, axisTick, axisTickSmall } from './ChartCard'

interface BalanceChartProps {
  transactions: Transaction[]
}

type ChartType = 'line' | 'bar'

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

const fmtShort = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

function BalanceTip({ active, payload, label }: {
  active?: boolean
  payload?: { value?: number }[]
  label?: string
}): JSX.Element | null {
  if (!active || !payload?.length) return null
  const value = payload[0]?.value
  if (typeof value !== 'number') return null
  return (
    <TooltipShell
      label={label}
      rows={[{ name: 'Balance', value: fmt(value), color: 'var(--balance)' }]}
    />
  )
}

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

  // Insights: period change + peak/trough
  const startBalance = data.length > 0 ? data[0].balance : 0
  const endBalance = data.length > 0 ? data[data.length - 1].balance : 0
  const delta = endBalance - startBalance
  const deltaPct = startBalance !== 0 ? Math.abs((delta / Math.abs(startBalance)) * 100) : null

  let peak = data[0]
  let trough = data[0]
  for (const d of data) {
    if (d.balance > (peak?.balance ?? -Infinity)) peak = d
    if (d.balance < (trough?.balance ?? Infinity)) trough = d
  }
  const showExtrema = data.length > 2 && peak && trough && peak.date !== trough.date

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

  return (
    <ChartCard
      title="Running Balance"
      stat={
        data.length > 1 ? (
          <ChartStat color={delta >= 0 ? 'var(--income)' : 'var(--expense)'}>
            {delta >= 0 ? '↑' : '↓'} {fmtShort(Math.abs(delta))}
            {deltaPct !== null && ` · ${deltaPct.toFixed(1)}%`}
          </ChartStat>
        ) : undefined
      }
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
          <AreaChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.30} />
                <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...chartGridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
            <Tooltip content={<BalanceTip />} />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="var(--color-balance)"
              strokeWidth={2}
              fill="url(#gradBalance)"
              dot={false}
              activeDot={{ r: 5, stroke: 'rgba(96,165,250,0.3)', strokeWidth: 6 }}
              animationDuration={700}
            />
            {showExtrema && peak && (
              <ReferenceDot
                x={peak.date}
                y={peak.balance}
                r={4}
                fill="var(--income)"
                stroke="rgba(52,211,153,0.35)"
                strokeWidth={5}
                label={{ value: `High ${fmtShort(peak.balance)}`, position: 'top', fill: 'var(--income)', fontSize: 10 }}
              />
            )}
            {showExtrema && trough && (
              <ReferenceDot
                x={trough.date}
                y={trough.balance}
                r={4}
                fill="var(--expense)"
                stroke="rgba(248,113,113,0.35)"
                strokeWidth={5}
                label={{ value: `Low ${fmtShort(trough.balance)}`, position: 'bottom', fill: 'var(--expense)', fontSize: 10 }}
              />
            )}
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid {...chartGridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
            <Tooltip content={<BalanceTip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="balance" fill="var(--color-balance)" radius={[4, 4, 0, 0]} maxBarSize={16} animationDuration={600} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  )
}
