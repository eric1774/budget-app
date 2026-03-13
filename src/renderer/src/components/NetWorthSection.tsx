import type { AssetAccount, Mortgage } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface NetWorthSectionProps {
  accounts: AssetAccount[]
  dashboardBalance?: number
  mortgages?: Mortgage[]
}

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function accountBalance(account: AssetAccount): number {
  return (account.transactions ?? []).reduce(
    (sum, t) => (t.type === 'deposit' ? sum + t.amount : sum - t.amount),
    0,
  )
}

function getDisplayBalance(account: AssetAccount, dashboardBalance?: number): number {
  if (account.syncedWithDashboard && dashboardBalance !== undefined) return dashboardBalance
  return accountBalance(account)
}

const TYPE_COLORS: Record<string, string> = {
  Checkings: '#20c8a0',
  Savings: '#5b8dee',
  Retirement: '#f5a623',
  'Hard Asset': '#e05a5a',
  Investing: '#a78bfa',
  Goal: '#34d399',
  Mortgage: '#f97316',
}

export function NetWorthSection({ accounts, dashboardBalance, mortgages = [] }: NetWorthSectionProps): JSX.Element {
  const accountsTotal = accounts.reduce(
    (sum, a) => sum + getDisplayBalance(a, dashboardBalance),
    0,
  )

  // Mortgage equity = market value - principal balance
  const totalEquity = mortgages.reduce((sum, m) => sum + (m.marketValue - m.principalBalance), 0)
  const totalLiabilities = mortgages.reduce((sum, m) => sum + m.principalBalance, 0)

  // Net worth = account balances + mortgage equity (equity already excludes liability)
  const totalNetWorth = accountsTotal + totalEquity

  // --- NW-02: Monthly history ---
  // Collect all YYYY-MM values from all transactions
  const monthSet = new Set<string>()
  for (const acct of accounts) {
    for (const t of acct.transactions ?? []) {
      const dateStr = t.date as unknown as string
      const ym = dateStr.slice(0, 7) // "YYYY-MM"
      monthSet.add(ym)
    }
  }
  const months = Array.from(monthSet).sort()

  // For each account, compute running balance up to end of each month (carry-forward)
  function balanceAtEndOfMonth(acct: AssetAccount, yearMonth: string): number {
    // Last day of yearMonth
    const [y, m] = yearMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).toISOString().slice(0, 10)
    // Sum all transactions on or before lastDay
    return (acct.transactions ?? [])
      .filter((t) => (t.date as unknown as string) <= lastDay)
      .reduce((sum, t) => (t.type === 'deposit' ? sum + t.amount : sum - t.amount), 0)
  }

  const monthlyHistory: { month: string; total: number }[] = months.map((ym) => {
    let total = 0
    for (const acct of accounts) {
      // Check if account has any transaction on or before end of this month
      const [y, m] = ym.split('-').map(Number)
      const lastDay = new Date(y, m, 0).toISOString().slice(0, 10)
      const hasTxn = (acct.transactions ?? []).some((t) => (t.date as unknown as string) <= lastDay)
      if (hasTxn) {
        total += balanceAtEndOfMonth(acct, ym)
      }
      // else: carry-forward handled below
    }
    return { month: ym, total }
  })

  // Apply carry-forward per account
  // Re-compute properly with carry-forward
  const carryForwardHistory: { month: string; total: number }[] = (() => {
    // For each account track lastKnown
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

  // Suppress unused variable warning
  void monthlyHistory

  // --- NW-03: Breakdown by account type ---
  const typeMap: Record<string, number> = {}
  for (const acct of accounts) {
    const bal = getDisplayBalance(acct, dashboardBalance)
    if (bal > 0) {
      typeMap[acct.type] = (typeMap[acct.type] ?? 0) + bal
    }
  }
  // Include mortgage equity in the breakdown
  if (totalEquity > 0) {
    typeMap['Mortgage'] = (typeMap['Mortgage'] ?? 0) + totalEquity
  }
  const breakdown = Object.entries(typeMap).map(([type, value]) => ({
    type,
    value,
    color: TYPE_COLORS[type] ?? '#888',
  }))

  const tickStyle = { fill: 'var(--text-muted)', fontSize: 11 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* NW-01: Total net worth + Total liabilities side by side */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <GlassCard style={{ padding: 24 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
            Total Net Worth
          </div>
          <div style={{ color: 'var(--color-accent)', fontSize: 32, fontWeight: 700 }}>
            {cadFormatter.format(totalNetWorth)}
          </div>
        </GlassCard>

        {totalLiabilities > 0 && (
          <GlassCard style={{ padding: 24 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
              Total Liabilities
            </div>
            <div style={{ color: '#ef4444', fontSize: 32, fontWeight: 700 }}>
              {cadFormatter.format(totalLiabilities)}
            </div>
          </GlassCard>
        )}
      </div>

      {/* NW-02: Monthly history line chart */}
      <GlassCard style={{ padding: 24 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Net Worth History
        </div>
        {carryForwardHistory.length < 2 ? (
          <div
            style={{
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            {accounts.length === 0
              ? 'Add accounts and record transactions to see your net worth history.'
              : 'Not enough data to show history'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={carryForwardHistory}>
              <XAxis
                dataKey="month"
                tick={tickStyle}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                tick={tickStyle}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-accent)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [cadFormatter.format(value as number), 'Net Worth']}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="var(--color-accent)"
                dot={false}
                activeDot={{ r: 4 }}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </GlassCard>

      {/* NW-03: Breakdown donut pie chart */}
      <GlassCard style={{ padding: 24 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Net Worth by Account Type
        </div>
        {breakdown.length === 0 ? (
          <div
            style={{
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            No balances to display
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={breakdown}
                dataKey="value"
                nameKey="type"
                cx="50%"
                cy={110}
                innerRadius={40}
                outerRadius={68}
              >
                {breakdown.map((entry) => (
                  <Cell key={entry.type} fill={entry.color} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                wrapperStyle={{ paddingTop: 12, fontSize: 12, lineHeight: '20px' }}
                formatter={(value: string) => {
                  const entry = breakdown.find((b) => b.type === value)
                  return `${value}: ${entry ? cadFormatter.format(entry.value) : ''}`
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </GlassCard>
    </div>
  )
}
