import type { CSSProperties } from 'react'
import { Scales, Bank, HandCoins } from '@phosphor-icons/react'
import type { AssetAccount, Mortgage } from '../../../shared/types'
import { ChartCard, ChartStat, TooltipShell, chartGridProps, axisTick, axisTickSmall } from './ChartCard'
import { getDisplayBalance, accountBalance } from '../lib/balances'
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

interface NetWorthSectionProps {
  accounts: AssetAccount[]
  dashboardBalance?: number
  mortgages?: Mortgage[]
}

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const cadShort = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

const TYPE_COLORS: Record<string, string> = {
  Checkings: '#2DD4BF',
  Savings: '#60A5FA',
  Retirement: '#FBBF24',
  'Hard Asset': '#F87171',
  Investing: '#A78BFA',
  Goal: '#34D399',
  Mortgage: '#FB923C',
}

function NetWorthTip({ active, payload, label }: {
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
      rows={[{ name: 'Net Worth', value: cad.format(value), color: 'var(--accent)' }]}
    />
  )
}

export function NetWorthSection({ accounts, dashboardBalance, mortgages = [] }: NetWorthSectionProps): JSX.Element {
  const accountsTotal = accounts.reduce(
    (sum, a) => sum + getDisplayBalance(a, dashboardBalance),
    0,
  )

  // Mortgage equity = market value - principal balance
  const totalEquity = mortgages.reduce((sum, m) => sum + (m.marketValue - m.principalBalance), 0)
  const totalLiabilities = mortgages.reduce((sum, m) => sum + m.principalBalance, 0)
  const totalAssets = accountsTotal + mortgages.reduce((sum, m) => sum + m.marketValue, 0)

  // Net worth = account balances + mortgage equity (equity already excludes liability)
  const totalNetWorth = accountsTotal + totalEquity

  // Monthly history — running balance per account with carry-forward
  const monthSet = new Set<string>()
  for (const acct of accounts) {
    for (const t of acct.transactions ?? []) {
      const dateStr = t.date as unknown as string
      monthSet.add(dateStr.slice(0, 7))
    }
  }
  const months = Array.from(monthSet).sort()

  function balanceAtEndOfMonth(acct: AssetAccount, yearMonth: string): number {
    const [y, m] = yearMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).toISOString().slice(0, 10)
    return (acct.transactions ?? [])
      .filter((t) => (t.date as unknown as string) <= lastDay)
      .reduce((sum, t) => (t.type === 'deposit' ? sum + t.amount : sum - t.amount), 0)
  }

  const carryForwardHistory: { month: string; total: number }[] = (() => {
    const lastKnown: Record<string, number> = {}
    for (const acct of accounts) {
      lastKnown[acct.id] = 0
    }
    return months.map((ym) => {
      let total = 0
      const [y, m] = ym.split('-').map(Number)
      const lastDay = new Date(y, m, 0).toISOString().slice(0, 10)
      for (const acct of accounts) {
        const hasTxn = (acct.transactions ?? []).some((t) => (t.date as unknown as string) <= lastDay)
        if (hasTxn) {
          lastKnown[acct.id] = balanceAtEndOfMonth(acct, ym)
        }
        total += lastKnown[acct.id]
      }
      return { month: ym, total }
    })
  })()

  const historyDelta = carryForwardHistory.length > 1
    ? carryForwardHistory[carryForwardHistory.length - 1].total - carryForwardHistory[0].total
    : null

  // Breakdown by account type (positive balances only) + mortgage equity
  const typeMap: Record<string, number> = {}
  for (const acct of accounts) {
    const bal = getDisplayBalance(acct, dashboardBalance)
    if (bal > 0) {
      typeMap[acct.type] = (typeMap[acct.type] ?? 0) + bal
    }
  }
  if (totalEquity > 0) {
    typeMap['Mortgage'] = (typeMap['Mortgage'] ?? 0) + totalEquity
  }
  const breakdownTotal = Object.values(typeMap).reduce((s, v) => s + v, 0)
  const breakdown = Object.entries(typeMap)
    .map(([type, value]) => ({
      type,
      value,
      pct: breakdownTotal > 0 ? (value / breakdownTotal) * 100 : 0,
      color: TYPE_COLORS[type] ?? '#8B9BB4',
    }))
    .sort((a, b) => b.value - a.value)

  const heroCards = [
    {
      label: 'Net Worth',
      value: totalNetWorth,
      color: 'var(--accent)',
      icon: <Scales size={16} weight="duotone" />,
      sub: `${accounts.length} account${accounts.length === 1 ? '' : 's'}${mortgages.length > 0 ? ` · ${mortgages.length} mortgage${mortgages.length === 1 ? '' : 's'}` : ''}`,
    },
    {
      label: 'Assets',
      value: totalAssets,
      color: 'var(--balance)',
      icon: <Bank size={16} weight="duotone" />,
      sub: totalEquity > 0 ? `incl. ${cadShort.format(totalEquity)} home equity` : undefined,
    },
    ...(totalLiabilities > 0 ? [{
      label: 'Liabilities',
      value: totalLiabilities,
      color: 'var(--expense)',
      icon: <HandCoins size={16} weight="duotone" />,
      sub: 'mortgage principal',
    }] : []),
  ]

  return (
    <div className="networth">
      {/* Headline numbers — same insight-card language as the dashboard */}
      <div className="summary-cards">
        {heroCards.map((card) => (
          <div
            key={card.label}
            className="glass-card summary-card"
            style={{ '--card-accent': card.color, padding: '14px 16px' } as CSSProperties}
          >
            <div className="summary-card__top">
              <span className="summary-card__label">{card.label}</span>
              <span className="summary-card__icon" aria-hidden="true">{card.icon}</span>
            </div>
            <div className="summary-card__value">{cad.format(card.value)}</div>
            {card.sub && <div className="summary-card__sub">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* History + breakdown */}
      <div className="charts-row">
        <ChartCard
          title="Net Worth History"
          stat={historyDelta !== null && historyDelta !== 0 ? (
            <ChartStat color={historyDelta >= 0 ? 'var(--income)' : 'var(--expense)'}>
              {historyDelta >= 0 ? '↑' : '↓'} {cadShort.format(Math.abs(historyDelta))} all time
            </ChartStat>
          ) : undefined}
        >
          {carryForwardHistory.length < 2 ? (
            <div className="chart-empty">
              {accounts.length === 0
                ? 'Add accounts and record transactions to see your net worth history.'
                : 'Not enough data to show history'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={carryForwardHistory} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <defs>
                  <linearGradient id="gradNetWorth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#2DD4BF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="month" tick={axisTickSmall} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<NetWorthTip />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill="url(#gradNetWorth)"
                  dot={false}
                  activeDot={{ r: 5, stroke: 'rgba(45,212,191,0.3)', strokeWidth: 6 }}
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Net Worth by Type">
          {breakdown.length === 0 ? (
            <div className="chart-empty">No balances to display</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={breakdown}
                    dataKey="value"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="var(--bg-surface)"
                    strokeWidth={2}
                    animationDuration={700}
                  >
                    {breakdown.map((entry) => (
                      <Cell key={entry.type} fill={entry.color} />
                    ))}
                  </Pie>
                  <text
                    x="50%"
                    y="45%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fill: 'var(--text-primary)', fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-mono)' }}
                  >
                    {cadShort.format(totalNetWorth)}
                  </text>
                  <text
                    x="50%"
                    y="57%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fill: 'var(--text-secondary)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                  >
                    net worth
                  </text>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]?.payload as { type: string; value: number; pct: number } | undefined
                      if (!d) return null
                      return (
                        <TooltipShell
                          label={d.type}
                          rows={[
                            { name: 'Value', value: cad.format(d.value) },
                            { name: 'Share', value: `${d.pct.toFixed(1)}%` },
                          ]}
                        />
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="cat-legend">
                {breakdown.map((b) => (
                  <div className="cat-legend__item" key={b.type} title={`${b.type} — ${cad.format(b.value)}`}>
                    <span className="cat-legend__dot" style={{ background: b.color }} />
                    <span className="cat-legend__name">{b.type}</span>
                    <span className="cat-legend__pct">{b.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
