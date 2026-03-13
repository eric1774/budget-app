import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { Mortgage, MortgagePayment } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { EditMortgagePaymentModal } from './MortgageModals'
import * as api from '../api'

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

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

  const equity = mortgage.marketValue - mortgage.principalBalance
  const totalInterest = mortgage.payments.reduce((sum, p) => sum + p.interest, 0)
  const totalEscrow = mortgage.payments.reduce((sum, p) => sum + p.escrow, 0)
  const chartData = balanceChartData(mortgage)
  const sortedPayments = [...mortgage.payments].sort((a, b) => b.date.localeCompare(a.date))

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button
          className="btn-ghost"
          onClick={onBack}
          aria-label="Go back to assets list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          {mortgage.name}
        </h2>
        <span style={{
          display: 'inline-block',
          background: 'rgba(249,115,22,0.15)',
          color: '#f97316',
          borderRadius: 6,
          padding: '3px 10px',
          fontSize: 13,
          fontWeight: 600,
        }}>
          Mortgage
        </span>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <GlassCard>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Equity
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-accent)' }}>
            {cadFormatter.format(equity)}
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Principal Remaining
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--expense)' }}>
            {cadFormatter.format(mortgage.principalBalance)}
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Total Interest Paid
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {cadFormatter.format(totalInterest)}
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Total Escrow Paid
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {cadFormatter.format(totalEscrow)}
          </div>
        </GlassCard>
      </div>

      {/* Principal Balance Over Time chart */}
      <GlassCard style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 12 }}>
          Principal Balance Over Time
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => cadFormatter.format(v as number)}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{ background: 'rgba(30,34,45,0.95)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-primary)', marginBottom: 4 }}
                formatter={(value) => [cadFormatter.format(value as number), 'Balance'] as unknown as [string, string]}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '16px 0' }}>
            No payments yet — log your first payment below
          </div>
        )}
      </GlassCard>

      {/* Payment log section */}
      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Payments
          </div>
          {!showAddForm && (
            <button className="btn-primary" onClick={() => setShowAddForm(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Payment
            </button>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Principal</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formPrincipal}
                  onChange={(e) => setFormPrincipal(e.target.value)}
                  placeholder="0.00"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Interest</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formInterest}
                  onChange={(e) => setFormInterest(e.target.value)}
                  placeholder="0.00"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Escrow</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formEscrow}
                  onChange={(e) => setFormEscrow(e.target.value)}
                  placeholder="0.00"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Note (optional)</label>
              <input
                type="text"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="e.g. March 2026 payment"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !formDate}
                style={{ opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : undefined }}
              >
                {saving ? 'Saving...' : 'Save'}
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
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No payments yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedPayments.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.date}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', whiteSpace: 'nowrap' }}>
                    P: {cadFormatter.format(p.principal)}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    I: {cadFormatter.format(p.interest)}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    E: {cadFormatter.format(p.escrow)}
                  </span>
                  {p.note && (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.note}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="btn-icon"
                    onClick={() => setEditingPayment(p)}
                    aria-label="Edit payment"
                    style={{ width: 34, height: 34, minWidth: 34, minHeight: 34 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    className="btn-icon btn-icon--danger"
                    onClick={() => handleDelete(p.id)}
                    aria-label="Delete payment"
                    style={{ width: 34, height: 34, minWidth: 34, minHeight: 34 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
