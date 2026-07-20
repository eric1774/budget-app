import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, Plus, PencilSimple, Trash } from '@phosphor-icons/react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { Mortgage, MortgagePayment } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { ChartCard, ChartStat, TooltipShell, chartGridProps, axisTick, axisTickSmall } from './ChartCard'
import { EditMortgagePaymentModal } from './MortgageModals'
import * as api from '../api'

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const cadShort = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function balanceChartData(mortgage: Mortgage): { date: string; balance: number }[] {
  const payments = [...mortgage.payments].sort((a, b) => a.date.localeCompare(b.date))
  // Reconstruct starting balance: current balance + sum of all principal payments already applied
  const totalPrincipalPaid = payments.reduce((sum, p) => sum + p.principal, 0)
  const startingBalance = mortgage.principalBalance + totalPrincipalPaid
  let running = startingBalance
  return payments.map((p) => {
    running -= p.principal
    return { date: p.date, balance: running }
  })
}

function BalanceTip({ active, payload, label }: {
  active?: boolean
  payload?: { value?: number }[]
  label?: string
}): JSX.Element | null {
  if (!active || !payload?.length) return null
  const value = payload[0]?.value
  if (typeof value !== 'number') return null
  return <TooltipShell label={label} rows={[{ name: 'Principal', value: cad.format(value), color: '#FB923C' }]} />
}

interface MortgageDetailViewProps {
  mortgage: Mortgage
  onBack: () => void
  onReload: () => Promise<void>
}

export function MortgageDetailView({ mortgage, onBack, onReload }: MortgageDetailViewProps): JSX.Element {
  const [showAddForm, setShowAddForm] = useState(false)
  const [formDate, setFormDate] = useState(todayISO())
  const [formPrincipal, setFormPrincipal] = useState('')
  const [formInterest, setFormInterest] = useState('')
  const [formEscrow, setFormEscrow] = useState('')
  const [formNote, setFormNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingPayment, setEditingPayment] = useState<MortgagePayment | null>(null)

  // ── Key insights ──
  const equity = mortgage.marketValue - mortgage.principalBalance
  const equityPct = mortgage.marketValue > 0 ? (equity / mortgage.marketValue) * 100 : 0
  const totalPrincipalPaid = mortgage.payments.reduce((sum, p) => sum + p.principal, 0)
  const totalInterest = mortgage.payments.reduce((sum, p) => sum + p.interest, 0)
  const totalEscrow = mortgage.payments.reduce((sum, p) => sum + p.escrow, 0)
  const startingBalance = mortgage.principalBalance + totalPrincipalPaid
  const paidOffPct = startingBalance > 0 ? (totalPrincipalPaid / startingBalance) * 100 : 0

  // Pace: average principal per distinct payment month → payoff projection
  const paymentMonths = new Set(mortgage.payments.map((p) => p.date.slice(0, 7))).size
  const avgPrincipalPerMonth = paymentMonths > 0 ? totalPrincipalPaid / paymentMonths : 0
  let payoffProjection: string | null = null
  if (avgPrincipalPerMonth > 0 && mortgage.principalBalance > 0) {
    const monthsLeft = Math.ceil(mortgage.principalBalance / avgPrincipalPerMonth)
    if (monthsLeft < 12 * 80) {
      const d = new Date()
      d.setMonth(d.getMonth() + monthsLeft)
      payoffProjection = d.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
    }
  }
  const interestPerDollar = totalPrincipalPaid > 0 ? totalInterest / totalPrincipalPaid : null

  const chartData = balanceChartData(mortgage)
  const sortedPayments = [...mortgage.payments].sort((a, b) => b.date.localeCompare(a.date))

  const statCards: { label: string; value: string; color: string; sub?: string }[] = [
    {
      label: 'Principal Remaining',
      value: cad.format(mortgage.principalBalance),
      color: 'var(--expense)',
      sub: payoffProjection ? `≈ paid off ${payoffProjection} at current pace` : undefined,
    },
    {
      label: 'Principal / Month',
      value: avgPrincipalPerMonth > 0 ? cad.format(avgPrincipalPerMonth) : '—',
      color: 'var(--income)',
      sub: paymentMonths > 0 ? `avg over ${paymentMonths} month${paymentMonths === 1 ? '' : 's'}` : 'no payments yet',
    },
    {
      label: 'Interest Paid',
      value: cad.format(totalInterest),
      color: 'var(--warning)',
      sub: interestPerDollar !== null ? `$${interestPerDollar.toFixed(2)} per $1 of principal` : undefined,
    },
    {
      label: 'Escrow Paid',
      value: cad.format(totalEscrow),
      color: 'var(--balance)',
      sub: mortgage.payments.length > 0 ? `across ${mortgage.payments.length} payment${mortgage.payments.length === 1 ? '' : 's'}` : undefined,
    },
  ]

  async function handleSave(): Promise<void> {
    const principal = parseFloat(formPrincipal) || 0
    const interest = parseFloat(formInterest) || 0
    const escrow = parseFloat(formEscrow) || 0
    if (principal === 0 && interest === 0 && escrow === 0) return
    if (!formDate) return
    setSaving(true)
    try {
      await api.addMortgagePayment(mortgage.id, formDate, principal, interest, escrow, formNote || undefined)
      await onReload()
      setShowAddForm(false)
      setFormPrincipal('')
      setFormInterest('')
      setFormEscrow('')
      setFormNote('')
      setFormDate(todayISO())
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(paymentId: string): Promise<void> {
    await api.deleteMortgagePayment(mortgage.id, paymentId)
    await onReload()
  }

  return (
    <div className="detail-outer">
      {/* Header */}
      <div className="detail-head">
        <button className="btn-ghost" onClick={onBack} aria-label="Go back to assets list">
          <ArrowLeft size={14} weight="bold" />
          Back
        </button>
        <h2 className="page-title">{mortgage.name}</h2>
        <span className="asset-chip" style={{ '--card-accent': '#FB923C' } as CSSProperties}>Mortgage</span>
      </div>

      {/* Payoff hero */}
      <GlassCard className="budget-hero">
        <div className="budget-hero__main">
          <div className="budget-hero__label">Loan paid off</div>
          <div className="budget-hero__value">
            {cad.format(totalPrincipalPaid)}
            <span className="budget-hero__of"> of {cad.format(startingBalance)} principal</span>
          </div>
          <div
            className="budget-bar budget-bar--hero"
            role="progressbar"
            aria-valuenow={Math.round(paidOffPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${Math.round(paidOffPct)}% of the loan principal paid off`}
          >
            <div className="budget-bar__fill asset-card__equity-fill" style={{ width: `${Math.min(paidOffPct, 100)}%` }} />
          </div>
          <div className="budget-hero__meta">
            {paidOffPct.toFixed(1)}% of principal
            {payoffProjection && ` · on pace for ${payoffProjection}`}
          </div>
        </div>
        <div className="budget-hero__side">
          <div className="budget-hero__side-label">Home Equity</div>
          <div className="budget-hero__side-value">{cad.format(equity)}</div>
          <span className="budget-chip budget-chip--ok">{Math.round(equityPct)}% of market value</span>
        </div>
      </GlassCard>

      {/* Insight stat cards */}
      <div className="summary-cards">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="glass-card summary-card"
            style={{ '--card-accent': card.color, padding: '14px 16px' } as CSSProperties}
          >
            <div className="summary-card__top">
              <span className="summary-card__label">{card.label}</span>
            </div>
            <div className="summary-card__value">{card.value}</div>
            {card.sub && <div className="summary-card__sub">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Principal curve */}
      <ChartCard
        title="Principal Balance Over Time"
        stat={totalPrincipalPaid > 0 ? (
          <ChartStat color="var(--income)">↓ {cadShort.format(totalPrincipalPaid)} paid down</ChartStat>
        ) : undefined}
      >
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id="gradMortgage" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FB923C" stopOpacity={0.26} />
                  <stop offset="100%" stopColor="#FB923C" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="date" tick={axisTickSmall} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<BalanceTip />} />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#FB923C"
                strokeWidth={2}
                fill="url(#gradMortgage)"
                dot={false}
                activeDot={{ r: 5, stroke: 'rgba(251,146,60,0.3)', strokeWidth: 6 }}
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">No payments yet — log your first payment below</div>
        )}
      </ChartCard>

      {/* Payment ledger */}
      <GlassCard style={{ padding: 20 }}>
        <div className="chart-card__header">
          <span className="chart-card__title">Payments</span>
          {!showAddForm && (
            <button className="btn-primary" onClick={() => setShowAddForm(true)}>
              <Plus size={13} weight="bold" />
              Add Payment
            </button>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="pay-form">
            <div className="pay-form__row">
              <label className="pay-form__field">
                <span>Date</span>
                <input type="date" className="date-input" value={formDate} onChange={(e) => setFormDate(e.target.value)} required />
              </label>
              <label className="pay-form__field">
                <span>Principal</span>
                <input type="number" step="0.01" min="0" className="date-input" value={formPrincipal} onChange={(e) => setFormPrincipal(e.target.value)} placeholder="0.00" />
              </label>
              <label className="pay-form__field">
                <span>Interest</span>
                <input type="number" step="0.01" min="0" className="date-input" value={formInterest} onChange={(e) => setFormInterest(e.target.value)} placeholder="0.00" />
              </label>
              <label className="pay-form__field">
                <span>Escrow</span>
                <input type="number" step="0.01" min="0" className="date-input" value={formEscrow} onChange={(e) => setFormEscrow(e.target.value)} placeholder="0.00" />
              </label>
            </div>
            <label className="pay-form__field">
              <span>Note (optional)</span>
              <input type="text" className="date-input" style={{ fontFamily: 'inherit' }} value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="e.g. March 2026 payment" />
            </label>
            <div className="pay-form__actions">
              <button className="btn-primary" onClick={handleSave} disabled={saving || !formDate}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => { setShowAddForm(false); setFormPrincipal(''); setFormInterest(''); setFormEscrow(''); setFormNote(''); setFormDate(todayISO()) }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Payment list */}
        {sortedPayments.length === 0 ? (
          <div className="asset-empty">No payments yet</div>
        ) : (
          <div className="pay-list">
            {sortedPayments.map((p) => (
              <div key={p.id} className="pay-row">
                <span className="pay-row__date">{p.date}</span>
                <span className="pay-row__amt pay-row__amt--principal" title="Principal">P {cad.format(p.principal)}</span>
                <span className="pay-row__amt pay-row__amt--interest" title="Interest">I {cad.format(p.interest)}</span>
                <span className="pay-row__amt pay-row__amt--escrow" title="Escrow">E {cad.format(p.escrow)}</span>
                {p.note && <span className="pay-row__note">{p.note}</span>}
                <div className="pay-row__actions">
                  <button
                    className="btn-icon"
                    onClick={() => setEditingPayment(p)}
                    aria-label="Edit payment"
                    style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                  >
                    <PencilSimple size={13} />
                  </button>
                  <button
                    className="btn-icon btn-icon--danger"
                    onClick={() => handleDelete(p.id)}
                    aria-label="Delete payment"
                    style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                  >
                    <Trash size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Edit Payment Modal */}
      {editingPayment && (
        <EditMortgagePaymentModal
          mortgageId={mortgage.id}
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={() => { setEditingPayment(null); onReload() }}
        />
      )}
    </div>
  )
}
