import { useState, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LabelList } from 'recharts'
import type { Transaction } from '../../../shared/types'
import { ChartCard, ChartToggle, ChartStat, TooltipShell, chartIcons, axisTickSmall } from './ChartCard'

interface CategoryBreakdownChartProps {
  transactions: Transaction[]
  onCategoryDoubleClick?: (category: string) => void
}

type ChartType = 'bar' | 'pie'

const COLORS = ['#20c8a0', '#06b6d4', '#818cf8', '#fb923c', '#f472b6', '#a78bfa', '#34d399', '#60a5fa']

const fmt = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

const fmtShort = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

interface CatDatum {
  category: string
  total: number
  pct: number
}

function CategoryTip({ active, payload }: {
  active?: boolean
  payload?: { payload?: CatDatum }[]
}): JSX.Element | null {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <TooltipShell
      label={d.category}
      rows={[
        { name: 'Spent', value: fmt(d.total) },
        { name: 'Share', value: `${d.pct.toFixed(1)}%` },
      ]}
    />
  )
}

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
  const grandTotal = Array.from(catMap.values()).reduce((s, v) => s + v, 0)
  const data: CatDatum[] = Array.from(catMap.entries())
    .map(([category, total]) => ({
      category,
      total,
      pct: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  const top = data[0]

  // Dynamic bar size: if many categories, reduce bar height for readability
  const barSize = Math.max(12, Math.min(28, Math.floor(180 / Math.max(data.length, 1))))
  const chartHeight = Math.max(220, data.length * (barSize + 10) + 40)

  return (
    <ChartCard
      title="Category Breakdown"
      stat={
        top && grandTotal > 0 ? (
          <ChartStat color="var(--accent)">
            {top.category} leads · {top.pct.toFixed(0)}%
          </ChartStat>
        ) : undefined
      }
      actions={
        <ChartToggle<ChartType>
          value={chartType}
          onChange={setChartType}
          options={[
            { value: 'bar', label: 'Bar chart view', icon: chartIcons.bar },
            { value: 'pie', label: 'Donut chart view', icon: chartIcons.pie },
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
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 0 }}>
            <XAxis
              type="number"
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={axisTickSmall}
              axisLine={false}
              tickLine={false}
            />
            <YAxis type="category" dataKey="category" tick={axisTickSmall} axisLine={false} tickLine={false} width={90} />
            <Tooltip content={<CategoryTip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar
              dataKey="total"
              barSize={barSize}
              radius={[0, 4, 4, 0]}
              animationDuration={600}
              onClick={(entry) => handleCategoryClick((entry as unknown as { category: string }).category)}
              style={{ cursor: onCategoryDoubleClick ? 'pointer' : undefined }}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
              <LabelList
                dataKey="pct"
                position="right"
                formatter={(v: unknown) => `${typeof v === 'number' ? v.toFixed(0) : v}%`}
                style={{ fill: 'var(--text-secondary)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
              />
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
              innerRadius={62}
              outerRadius={100}
              paddingAngle={2}
              stroke="var(--bg-surface)"
              strokeWidth={2}
              animationDuration={700}
              onClick={(entry) => handleCategoryClick((entry as unknown as { category: string }).category)}
              style={{ cursor: onCategoryDoubleClick ? 'pointer' : undefined }}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            {/* Center KPI — total spend across selected categories */}
            <text
              x="50%"
              y="47%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fill: 'var(--text-primary)', fontSize: 17, fontWeight: 600, fontFamily: 'var(--font-mono)' }}
            >
              {fmtShort(grandTotal)}
            </text>
            <text
              x="50%"
              y="56%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fill: 'var(--text-secondary)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              total spent
            </text>
            <Tooltip content={<CategoryTip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}
