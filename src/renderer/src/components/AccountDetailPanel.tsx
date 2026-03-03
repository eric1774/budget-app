import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import type { AssetAccount, Transaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import {
  AddTransactionModal,
  EditTransactionModal,
  DeleteTransactionModal,
} from './AccountModals'
import { useState } from 'react'

interface AccountDetailPanelProps {
  account: AssetAccount
  onClose: () => void
  onTransactionChange: () => void
}

const fmtCAD = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

const primaryBtn: React.CSSProperties = {
  background: 'var(--color-accent)',
  color: '#1a1d23',
  border: 'none',
  borderRadius: 6,
  padding: '6px 16px',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
}

type ModalState =
  | { kind: 'add' }
  | { kind: 'edit'; transaction: Transaction }
  | { kind: 'delete'; transactionId: string }
  | null

export function AccountDetailPanel({ account, onClose, onTransactionChange }: AccountDetailPanelProps): JSX.Element {
  const [modal, setModal] = useState<ModalState>(null)

  const sorted = [...(account.transactions ?? [])].sort((a, b) => a.date.localeCompare(b.date))

  // Running balance line chart data (ascending by date)
  let running = 0
  const lineData = sorted.map(t => {
    running += t.type === 'deposit' ? t.amount : -t.amount
    return { date: t.date, balance: running }
  })

  // Bar chart: per-transaction amount (positive for deposit, negative for withdrawal)
  const barData = sorted.map(t => ({
    date: t.date,
    amount: t.type === 'deposit' ? t.amount : -t.amount,
    type: t.type,
  }))

  // Transaction log: descending by date
  const descSorted = [...(account.transactions ?? [])].sort((a, b) => b.date.localeCompare(a.date))

  function handleSuccess(): void {
    setModal(null)
    onTransactionChange()
  }

  return (
    <GlassCard style={{ padding: '20px', marginTop: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          {account.name}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            style={primaryBtn}
            onClick={() => setModal({ kind: 'add' })}
          >
            + Add Transaction
          </button>
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
            x
          </button>
        </div>
      </div>

      {(account.transactions ?? []).length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          No transactions yet. Add a deposit or withdrawal to get started.
        </p>
      ) : (
        <>
          {/* Running Balance Line Chart */}
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, marginTop: 8 }}>
            Running Balance
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData} margin={{ top: 4, right: 12, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
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
                dataKey="balance"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={{ fill: 'var(--color-accent)', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Per-transaction Bar Chart */}
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, marginTop: 16 }}>
            Transactions
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 4, right: 12, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
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
                formatter={((value: number) => [fmtCAD(Math.abs(value)), value >= 0 ? 'Deposit' : 'Withdrawal']) as any}
              />
              <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.type === 'deposit' ? 'var(--color-accent)' : 'var(--color-expense)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Transaction Log */}
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, marginTop: 16 }}>
            Transaction Log
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {descSorted.map((tx) => (
              <li
                key={tx.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'var(--text-muted)', minWidth: 90 }}>{tx.date}</span>
                  <span style={{
                    fontSize: 11,
                    borderRadius: 4,
                    padding: '2px 7px',
                    background: tx.type === 'deposit' ? 'rgba(32,200,160,0.15)' : 'rgba(239,68,68,0.15)',
                    color: tx.type === 'deposit' ? 'var(--color-accent)' : '#ef4444',
                    fontWeight: 600,
                  }}>
                    {tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                  </span>
                  <span style={{ fontWeight: 600, color: tx.type === 'deposit' ? 'var(--color-accent)' : '#ef4444' }}>
                    {tx.type === 'deposit' ? '+' : '-'}{fmtCAD(tx.amount)}
                  </span>
                  {tx.note && (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{tx.note}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    title="Edit transaction"
                    onClick={() => setModal({ kind: 'edit', transaction: tx })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '2px 4px' }}
                  >
                    &#9999;
                  </button>
                  <button
                    title="Delete transaction"
                    onClick={() => setModal({ kind: 'delete', transactionId: tx.id })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '2px 4px' }}
                  >
                    &times;
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Modals */}
      {modal?.kind === 'add' && (
        <AddTransactionModal
          accountId={account.id}
          onClose={() => setModal(null)}
          onSaved={handleSuccess}
        />
      )}
      {modal?.kind === 'edit' && (
        <EditTransactionModal
          accountId={account.id}
          transaction={modal.transaction}
          onClose={() => setModal(null)}
          onSaved={handleSuccess}
        />
      )}
      {modal?.kind === 'delete' && (
        <DeleteTransactionModal
          accountId={account.id}
          transactionId={modal.transactionId}
          onClose={() => setModal(null)}
          onDeleted={handleSuccess}
        />
      )}
    </GlassCard>
  )
}
