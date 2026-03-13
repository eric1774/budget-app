import { useState } from 'react'
import type { Mortgage, MortgagePayment } from '../../../shared/types'
import * as api from '../api'

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '24px',
  minWidth: 320,
  maxWidth: 420,
  width: '90vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
}

const primaryBtn: React.CSSProperties = {
  background: 'var(--color-accent)',
  color: '#1a1d23',
  border: 'none',
  borderRadius: 6,
  padding: '8px 20px',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
}

const cancelBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--text-muted)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  padding: '8px 20px',
  fontSize: 14,
  cursor: 'pointer',
}

const dangerBtn: React.CSSProperties = {
  background: '#ef4444',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 20px',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 13,
  marginBottom: 4,
  display: 'block',
}

// ── AddMortgageModal ──────────────────────────────────────────────────────────

interface AddMortgageModalProps {
  onClose: () => void
  onSaved: () => void
}

export function AddMortgageModal({ onClose, onSaved }: AddMortgageModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [marketValue, setMarketValue] = useState('')
  const [principalBalance, setPrincipalBalance] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    const mv = parseFloat(marketValue)
    if (isNaN(mv) || mv < 0) { setError('Enter a valid market value'); return }
    const pb = parseFloat(principalBalance)
    if (isNaN(pb) || pb < 0) { setError('Enter a valid principal balance'); return }
    setSaving(true)
    try {
      await api.addMortgage(name.trim(), mv, pb)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Add Mortgage</div>

        <div>
          <label style={labelStyle}>Property Name</label>
          <input
            style={inputStyle}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            placeholder="e.g. Primary Home"
            autoFocus
          />
        </div>

        <div>
          <label style={labelStyle}>Home Market Value</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={marketValue}
            onChange={(e) => { setMarketValue(e.target.value); setError('') }}
            placeholder="0.00"
          />
        </div>

        <div>
          <label style={labelStyle}>Remaining Principal Balance</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={principalBalance}
            onChange={(e) => { setPrincipalBalance(e.target.value); setError('') }}
            placeholder="0.00"
          />
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={primaryBtn} disabled={saving}>
            {saving ? 'Adding…' : 'Add Mortgage'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── EditMortgageModal ─────────────────────────────────────────────────────────

interface EditMortgageModalProps {
  mortgage: Mortgage
  onClose: () => void
  onSaved: () => void
}

export function EditMortgageModal({ mortgage, onClose, onSaved }: EditMortgageModalProps): JSX.Element {
  const [name, setName] = useState(mortgage.name)
  const [marketValue, setMarketValue] = useState(mortgage.marketValue.toString())
  const [principalBalance, setPrincipalBalance] = useState(mortgage.principalBalance.toString())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    const mv = parseFloat(marketValue)
    if (isNaN(mv) || mv < 0) { setError('Enter a valid market value'); return }
    const pb = parseFloat(principalBalance)
    if (isNaN(pb) || pb < 0) { setError('Enter a valid principal balance'); return }
    setSaving(true)
    try {
      await api.updateMortgage(mortgage.id, name.trim(), mv, pb)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Edit Mortgage</div>

        <div>
          <label style={labelStyle}>Property Name</label>
          <input
            style={inputStyle}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            autoFocus
          />
        </div>

        <div>
          <label style={labelStyle}>Home Market Value</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={marketValue}
            onChange={(e) => { setMarketValue(e.target.value); setError('') }}
          />
        </div>

        <div>
          <label style={labelStyle}>Remaining Principal Balance</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={principalBalance}
            onChange={(e) => { setPrincipalBalance(e.target.value); setError('') }}
          />
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={primaryBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── DeleteMortgageModal ───────────────────────────────────────────────────────

interface DeleteMortgageModalProps {
  mortgage: Mortgage
  onClose: () => void
  onDeleted: () => void
}

export function DeleteMortgageModal({ mortgage, onClose, onDeleted }: DeleteMortgageModalProps): JSX.Element {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(): Promise<void> {
    setDeleting(true)
    try {
      await api.deleteMortgage(mortgage.id)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Delete Mortgage</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 }}>
          Delete &ldquo;{mortgage.name}&rdquo;? This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={cancelBtn} onClick={onClose}>Cancel</button>
          <button style={dangerBtn} onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── EditMortgagePaymentModal ──────────────────────────────────────────────────

interface EditMortgagePaymentModalProps {
  mortgageId: string
  payment: MortgagePayment
  onClose: () => void
  onSaved: () => void
}

export function EditMortgagePaymentModal({ mortgageId, payment, onClose, onSaved }: EditMortgagePaymentModalProps): JSX.Element {
  const [date, setDate] = useState(payment.date)
  const [principal, setPrincipal] = useState(payment.principal.toString())
  const [interest, setInterest] = useState(payment.interest.toString())
  const [escrow, setEscrow] = useState(payment.escrow.toString())
  const [note, setNote] = useState(payment.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!date) { setError('Date is required'); return }
    const p = parseFloat(principal)
    if (isNaN(p) || p < 0) { setError('Enter a valid principal'); return }
    const i = parseFloat(interest)
    if (isNaN(i) || i < 0) { setError('Enter a valid interest'); return }
    const esc = parseFloat(escrow)
    if (isNaN(esc) || esc < 0) { setError('Enter a valid escrow'); return }
    setSaving(true)
    try {
      await api.updateMortgagePayment(mortgageId, payment.id, { date, principal: p, interest: i, escrow: esc, note: note || undefined })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Edit Payment</div>

        <div>
          <label style={labelStyle}>Date</label>
          <input
            style={inputStyle}
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setError('') }}
            autoFocus
          />
        </div>

        <div>
          <label style={labelStyle}>Principal</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={principal}
            onChange={(e) => { setPrincipal(e.target.value); setError('') }}
          />
        </div>

        <div>
          <label style={labelStyle}>Interest</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={interest}
            onChange={(e) => { setInterest(e.target.value); setError('') }}
          />
        </div>

        <div>
          <label style={labelStyle}>Escrow</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={escrow}
            onChange={(e) => { setEscrow(e.target.value); setError('') }}
          />
        </div>

        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input
            style={inputStyle}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={primaryBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
