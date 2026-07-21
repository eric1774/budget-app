import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, Plus, PencilSimple, Trash } from '@phosphor-icons/react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { AssetAccount, AssetTransaction } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { ChartCard, ChartStat, TooltipShell, chartGridProps, axisTick, axisTickSmall } from './ChartCard'
import {
  AddTransactionModal,
  EditTransactionModal,
  DeleteTransactionModal,
} from './AccountModals'

interface AccountDetailPanelProps {
  account: AssetAccount
  onClose: () => void
  onTransactionChange: () => void
}

const fmtCAD = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
const fmtShort = (v: number): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

// Matches the assets grid / net-worth donut colors
const TYPE_COLORS: Record<string, string> = {
  Checkings: '#2DD4BF',
  Savings: '#60A5FA',
  Retirement: '#FBBF24',
  'Hard Asset': '#F87171',
  Investing: '#A78BFA',
  Goal: '#34D399',
}

function AccountTip({ active, payload, label, color }: {
  active?: boolean
  payload?: { value?: number }[]
  label?: string
  color: string
}): JSX.Element | null {
  if (!active || !payload?.length) return null
  const value = payload[0]?.value
  if (typeof value !== 'number') return null
  return <TooltipShell label={label} rows={[{ name: 'Balance', value: fmtCAD(value), color }]} />
}

type ModalState =
  | { kind: 'add' }
  | { kind: 'edit'; transaction: AssetTransaction }
  | { kind: 'delete'; transactionId: string }
  | null

export function AccountDetailPanel({ account, onClose, onTransactionChange }: AccountDetailPanelProps): JSX.Element {
  const [modal, setModal] = useState<ModalState>(null)

  const isLinked = !!account.simplefin

  const accent = TYPE_COLORS[account.type] ?? '#2DD4BF'
  const sorted = [...(account.transactions ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date))

  // Running balance area chart data (ascending by date)
  let running = 0
  const runningLineData = sorted.map(t => {
    running += t.type === 'deposit' ? t.amount : -t.amount
    return { date: t.date, balance: running }
  })
  // Linked accounts chart daily snapshots instead of the running ledger.
  const lineData = isLinked
    ? (account.snapshots ?? []).map((s) => ({ date: s.date, balance: s.balance }))
    : runningLineData
  const currentBalance = isLinked && account.syncedBalance !== undefined ? account.syncedBalance : running
  const totalIn = sorted.reduce((s, t) => (t.type === 'deposit' ? s + t.amount : s), 0)
  const totalOut = sorted.reduce((s, t) => (t.type === 'deposit' ? s : s + t.amount), 0)

  // Transaction log: descending by date
  const descSorted = [...(account.transactions ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date))

  function handleSuccess(): void {
    setModal(null)
    onTransactionChange()
  }

  return (
    <div className="detail-outer">
      {/* Header */}
      <div className="detail-head">
        <button className="btn-ghost" onClick={onClose} aria-label="Go back to accounts list">
          <ArrowLeft size={14} weight="bold" />
          Back
        </button>
        <h2 className="page-title">{account.name}</h2>
        <span className="asset-chip" style={{ '--card-accent': accent } as CSSProperties}>{account.type}</span>
        {isLinked ? (
          <span className="asset-card__meta" style={{ marginLeft: 'auto' }}>
            <span className="status-dot status-dot--online" />
            Live · {account.simplefin!.org}
          </span>
        ) : (
          <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({ kind: 'add' })}>
            <Plus size={13} weight="bold" />
            Add
          </button>
        )}
      </div>

      {(account.transactions ?? []).length === 0 && !isLinked ? (
        <GlassCard style={{ padding: 20 }}>
          <div className="asset-empty">No transactions yet. Add a deposit or withdrawal to get started.</div>
        </GlassCard>
      ) : (
        <>
          {/* Stat cards */}
          <div className="summary-cards">
            {[
              { label: 'Balance', value: currentBalance, color: accent, sub: `${sorted.length} transaction${sorted.length === 1 ? '' : 's'}` },
              ...(!isLinked ? [
                { label: 'Deposits', value: totalIn, color: 'var(--income)', sub: undefined },
                { label: 'Withdrawals', value: totalOut, color: 'var(--expense)', sub: undefined },
              ] : []),
            ].map((card) => (
              <div
                key={card.label}
                className="glass-card summary-card"
                style={{ '--card-accent': card.color, padding: '14px 16px' } as CSSProperties}
              >
                <div className="summary-card__top">
                  <span className="summary-card__label">{card.label}</span>
                </div>
                <div className="summary-card__value">{fmtCAD(card.value)}</div>
                {card.sub && <div className="summary-card__sub">{card.sub}</div>}
              </div>
            ))}
          </div>

          {/* Running balance / balance history */}
          <ChartCard
            title={isLinked ? 'Balance History' : 'Running Balance'}
            stat={lineData.length > 1 ? (
              <ChartStat color={currentBalance >= lineData[0].balance ? 'var(--income)' : 'var(--expense)'}>
                {currentBalance >= lineData[0].balance ? '↑' : '↓'} {fmtShort(Math.abs(currentBalance - lineData[0].balance))} all time
              </ChartStat>
            ) : undefined}
          >
            {isLinked && lineData.length < 2 ? (
              <div className="chart-empty">Balance history builds up as syncs run — check back tomorrow.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={lineData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                  <defs>
                    <linearGradient id="gradAccount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis
                    dataKey="date"
                    tick={axisTickSmall}
                    tickFormatter={(v: string) => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={axisTick}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip content={<AccountTip color={accent} />} />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={accent}
                    strokeWidth={2}
                    fill="url(#gradAccount)"
                    dot={false}
                    activeDot={{ r: 5 }}
                    animationDuration={700}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Transaction log */}
          {isLinked ? (
            (account.transactions ?? []).length > 0 && (
              <GlassCard style={{ padding: 20 }}>
                <details>
                  <summary className="chart-card__title" style={{ cursor: 'pointer' }}>
                    Historical entries ({account.transactions.length}) — frozen since linking
                  </summary>
                  <div className="pay-list" style={{ marginTop: 12 }}>
                    {descSorted.map((tx) => (
                      <div key={tx.id} className="pay-row">
                        <span className="pay-row__date">{tx.date}</span>
                        <span className={`pay-row__amt ${tx.type === 'deposit' ? 'pay-row__amt--principal' : 'pay-row__amt--out'}`}>
                          {tx.type === 'deposit' ? '+' : '−'}{fmtCAD(tx.amount)}
                        </span>
                        {tx.note && <span className="pay-row__note">{tx.note}</span>}
                      </div>
                    ))}
                  </div>
                </details>
              </GlassCard>
            )
          ) : (
            <GlassCard style={{ padding: 20 }}>
              <div className="chart-card__header">
                <span className="chart-card__title">Transaction Log</span>
              </div>
              <div className="pay-list">
                {descSorted.map((tx) => (
                  <div key={tx.id} className="pay-row">
                    <span className="pay-row__date">{tx.date}</span>
                    <span className={`pay-row__amt ${tx.type === 'deposit' ? 'pay-row__amt--principal' : 'pay-row__amt--out'}`}>
                      {tx.type === 'deposit' ? '+' : '−'}{fmtCAD(tx.amount)}
                    </span>
                    {tx.note && <span className="pay-row__note">{tx.note}</span>}
                    <div className="pay-row__actions">
                      <button
                        className="btn-icon"
                        title="Edit transaction"
                        aria-label="Edit transaction"
                        onClick={() => setModal({ kind: 'edit', transaction: tx })}
                        style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                      >
                        <PencilSimple size={13} />
                      </button>
                      <button
                        className="btn-icon btn-icon--danger"
                        title="Delete transaction"
                        aria-label="Delete transaction"
                        onClick={() => setModal({ kind: 'delete', transactionId: tx.id })}
                        style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
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
    </div>
  )
}
