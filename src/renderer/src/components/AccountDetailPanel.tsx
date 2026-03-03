import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import type { AssetAccount } from '../../../shared/types'
import { GlassCard } from './GlassCard'

interface AccountDetailPanelProps {
  account: AssetAccount
  onClose: () => void
}

const fmtCAD = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

export function AccountDetailPanel({ account, onClose }: AccountDetailPanelProps): JSX.Element {
  const sortedSnapshots = [...account.snapshots].sort((a, b) => a.date.localeCompare(b.date))

  const lineData = sortedSnapshots.map(s => ({ date: s.date, amount: s.amount }))

  const barData = sortedSnapshots.slice(1).map((s, i) => ({
    date: s.date,
    change: s.amount - sortedSnapshots[i].amount,
  }))

  return (
    <GlassCard style={{ padding: '20px', marginTop: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          {account.name}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
            padding: '0 4px',
          }}
          aria-label="Close detail panel"
        >
          ×
        </button>
      </div>

      {sortedSnapshots.length < 2 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Add at least 2 snapshots to see history charts.
        </p>
      ) : (
        <>
          {/* Balance over time */}
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, marginTop: 16 }}>
            Balance Over Time
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData} margin={{ top: 4, right: 12, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(0, 7)}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={fmtCAD}
                width={80}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-muted)', fontSize: 12 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: number) => [fmtCAD(value), 'Balance']) as any}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={{ fill: 'var(--color-accent)', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Period-to-period change */}
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, marginTop: 16 }}>
            Period-to-Period Change
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 4, right: 12, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(0, 7)}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={fmtCAD}
                width={80}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-muted)', fontSize: 12 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: number) => [fmtCAD(value), 'Change']) as any}
              />
              <Bar dataKey="change" radius={[3, 3, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.change >= 0 ? 'var(--color-accent)' : 'var(--color-expense)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </GlassCard>
  )
}
