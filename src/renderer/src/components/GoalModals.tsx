import { useState } from 'react'
import type { Goal } from '../../../shared/types'

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

// ── 1. AddGoalModal ──────────────────────────────────────────────────────────

interface AddGoalModalProps {
  onClose: () => void
  onAdd: (name: string) => void
}

export function AddGoalModal({ onClose, onAdd }: AddGoalModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Goal name is required')
      return
    }
    onAdd(trimmed)
    onClose()
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Add Goal</div>

        <div>
          <label style={labelStyle}>Goal Name</label>
          <input
            style={inputStyle}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            placeholder="e.g. Emergency Fund"
            autoFocus
          />
          {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={primaryBtn}>Add Goal</button>
        </div>
      </form>
    </div>
  )
}

// ── 2. SetTargetModal ────────────────────────────────────────────────────────

interface SetTargetModalProps {
  goal: Goal
  onClose: () => void
  onSave: (targetAmount: number | null, targetDate: string | null) => void
}

export function SetTargetModal({ goal, onClose, onSave }: SetTargetModalProps): JSX.Element {
  const [amount, setAmount] = useState(goal.targetAmount != null ? goal.targetAmount.toString() : '')
  const [date, setDate] = useState(goal.targetDate ?? '')

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    const parsedAmount = amount.trim() !== '' ? parseFloat(amount) : null
    const parsedDate = date.trim() !== '' ? date.trim() : null
    onSave(parsedAmount, parsedDate)
    onClose()
  }

  const title = goal.targetAmount != null ? 'Edit Target' : 'Set Goal Target'

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>

        <div>
          <label style={labelStyle}>Target Amount (optional)</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 10000"
            autoFocus
          />
        </div>

        <div>
          <label style={labelStyle}>Target Date (optional)</label>
          <input
            style={{ ...inputStyle, colorScheme: 'dark' }}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={primaryBtn}>Save</button>
        </div>
      </form>
    </div>
  )
}

// ── 3. DeleteGoalModal ───────────────────────────────────────────────────────

interface DeleteGoalModalProps {
  goal: Goal
  onClose: () => void
  onConfirm: () => void
}

export function DeleteGoalModal({ goal, onClose, onConfirm }: DeleteGoalModalProps): JSX.Element {
  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Delete Goal</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 }}>
          Delete &ldquo;{goal.name}&rdquo;? This will remove all contributions. This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={cancelBtn} onClick={onClose}>Cancel</button>
          <button style={dangerBtn} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}
