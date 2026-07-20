import { useState, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import type { Transaction } from '../../../shared/types'
import { ChartCard, ChartToggle, chartIcons, chartTooltipProps, axisTickSmall } from './ChartCard'

interface CategoryBreakdownChartProps {
  transactions: Transaction[]
  onCategoryDoubleClick?: (category: string) => void
}

type ChartType = 'bar' | 'pie'

const COLORS = ['#20c8a0', '#06b6d4', '#818cf8', '#fb923c', '#f472b6', '#a78bfa', '#34d399', '#60a5fa']

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

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

  return (
    <ChartCard
      title="Category Breakdown"
      actions={
        <ChartToggle<ChartType>
          value={chartType}
          onChange={setChartType}
          options={[
            { value: 'bar', label: 'Bar chart view', icon: chartIcons.bar },
            { value: 'pie', label: 'Pie chart view', icon: chartIcons.pie },
          ]}
        />
      }
    >
      {data.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '32px 0', fontSize: 13 }}>
          No categories selected
        </p>
      ) : chartType === 'bar' ? (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
            <XAxis
              type="number"
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={axisTickSmall}
              axisLine={false}
              tickLine={false}
            />
            <YAxis type="category" dataKey="category" tick={axisTickSmall} axisLine={false} tickLine={false} width={90} />
            <Tooltip
              {...chartTooltipProps}
              formatter={(value: number | undefined) => [fmt(value ?? 0), 'Spent']}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar
              dataKey="total"
              barSize={barSize}
              radius={[0, 4, 4, 0]}
              onClick={(entry) => handleCategoryClick((entry as unknown as { category: string }).category)}
              style={{ cursor: onCategoryDoubleClick ? 'pointer' : undefined }}
            >
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
              innerRadius={58}
              outerRadius={100}
              paddingAngle={2}
              stroke="var(--bg-surface)"
              strokeWidth={2}
              onClick={(entry) => handleCategoryClick((entry as unknown as { category: string }).category)}
              style={{ cursor: onCategoryDoubleClick ? 'pointer' : undefined }}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              {...chartTooltipProps}
              formatter={(value: number | undefined, name: string | undefined) => [fmt(value ?? 0), name ?? '']}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}
