import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
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
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

// Use CSS class btn-primary instead

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

  // Transaction log: descending by date
  const descSorted = [...(account.transactions ?? [])].sort((a, b) => b.date.localeCompare(a.date))

  function handleSuccess(): void {
    setModal(null)
    onTransactionChange()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto', overflowX: 'hidden', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Header with back button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <button
            className="btn-ghost"
            onClick={onClose}
            aria-label="Go back to accounts list"
            style={{ flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back
          </button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {account.name}
          </h2>
        </div>
        <button
          className="btn-primary"
          onClick={() => setModal({ kind: 'add' })}
          style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add
        </button>
      </div>

      <GlassCard style={{ padding: '20px', overflow: 'hidden', maxWidth: '100%', boxSizing: 'border-box' }}>

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
            <LineChart data={lineData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                tickFormatter={(v: string) => v.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                width={45}
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
                  padding: '8px 10px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{tx.date}</span>
                  <span style={{
                    fontSize: 11,
                    borderRadius: 4,
                    padding: '2px 6px',
                    background: tx.type === 'deposit' ? 'rgba(32,200,160,0.15)' : 'rgba(239,68,68,0.15)',
                    color: tx.type === 'deposit' ? 'var(--color-accent)' : '#ef4444',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    {tx.type === 'deposit' ? '+' : '-'}{fmtCAD(tx.amount)}
                  </span>
                  {tx.note && (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {tx.note}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    className="btn-icon"
                    title="Edit transaction"
                    aria-label="Edit transaction"
                    onClick={() => setModal({ kind: 'edit', transaction: tx })}
                    style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    className="btn-icon btn-icon--danger"
                    title="Delete transaction"
                    aria-label="Delete transaction"
                    onClick={() => setModal({ kind: 'delete', transactionId: tx.id })}
                    style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
    </div>
  )
}
