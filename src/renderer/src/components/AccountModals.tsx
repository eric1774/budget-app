import { useState } from 'react'
import type { AccountType, AssetAccount, BalanceSnapshot } from '../../../shared/types'

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

// ── 1. AddAccountModal ──────────────────────────────────────────────────────

interface AddAccountModalProps {
  onClose: () => void
  onSaved: () => void
}

export function AddAccountModal({ onClose, onSaved }: AddAccountModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('Standard')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) {
      setError('Account name is required')
      return
    }
    setSaving(true)
    try {
      await window.electronAPI.invoke('assets:add-account', { name: name.trim(), type })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Add Account</div>

        <div>
          <label style={labelStyle}>Account Name</label>
          <input
            style={inputStyle}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            placeholder="e.g. TFSA"
            autoFocus
          />
          {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
        </div>

        <div>
          <label style={labelStyle}>Account Type</label>
          <select
            style={inputStyle}
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            <option value="Standard">Standard</option>
            <option value="Goal">Goal</option>
            <option value="Certificate">Certificate</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={primaryBtn} disabled={saving}>
            {saving ? 'Adding…' : 'Add Account'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── 2. EditAccountModal ─────────────────────────────────────────────────────

interface EditAccountModalProps {
  account: AssetAccount
  onClose: () => void
  onSaved: () => void
}

export function EditAccountModal({ account, onClose, onSaved }: EditAccountModalProps): JSX.Element {
  const [name, setName] = useState(account.name)
  const [type, setType] = useState<AccountType>(account.type)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) {
      setError('Account name is required')
      return
    }
    setSaving(true)
    try {
      await window.electronAPI.invoke('assets:update-account', { id: account.id, name: name.trim(), type })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Edit Account</div>

        <div>
          <label style={labelStyle}>Account Name</label>
          <input
            style={inputStyle}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            autoFocus
          />
          {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
        </div>

        <div>
          <label style={labelStyle}>Account Type</label>
          <select
            style={inputStyle}
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            <option value="Standard">Standard</option>
            <option value="Goal">Goal</option>
            <option value="Certificate">Certificate</option>
          </select>
        </div>

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

// ── 3. DeleteAccountModal ───────────────────────────────────────────────────

interface DeleteAccountModalProps {
  account: AssetAccount
  onClose: () => void
  onDeleted: () => void
}

export function DeleteAccountModal({ account, onClose, onDeleted }: DeleteAccountModalProps): JSX.Element {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(): Promise<void> {
    setDeleting(true)
    try {
      await window.electronAPI.invoke('assets:delete-account', { id: account.id })
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Delete Account</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 }}>
          Delete &ldquo;{account.name}&rdquo;? This will also delete all {account.snapshots.length} snapshot(s). This cannot be undone.
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

// ── 4. AddSnapshotModal ─────────────────────────────────────────────────────

interface AddSnapshotModalProps {
  accountId: string
  onClose: () => void
  onSaved: () => void
}

export function AddSnapshotModal({ accountId, onClose, onSaved }: AddSnapshotModalProps): JSX.Element {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Please enter a valid amount (0 or more)')
      return
    }
    if (!date) {
      setError('Date is required')
      return
    }
    setSaving(true)
    try {
      await window.electronAPI.invoke('assets:add-snapshot', {
        accountId,
        amount: parsedAmount,
        date,
        note: note || undefined,
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Add Snapshot</div>

        <div>
          <label style={labelStyle}>Amount</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError('') }}
            placeholder="0.00"
            autoFocus
          />
        </div>

        <div>
          <label style={labelStyle}>Date</label>
          <input
            style={inputStyle}
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setError('') }}
          />
        </div>

        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input
            style={inputStyle}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
          />
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={primaryBtn} disabled={saving}>
            {saving ? 'Adding…' : 'Add Snapshot'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── 5. EditSnapshotModal ────────────────────────────────────────────────────

interface EditSnapshotModalProps {
  accountId: string
  snapshot: BalanceSnapshot
  onClose: () => void
  onSaved: () => void
}

export function EditSnapshotModal({ accountId, snapshot, onClose, onSaved }: EditSnapshotModalProps): JSX.Element {
  const [amount, setAmount] = useState(snapshot.amount.toString())
  const [date, setDate] = useState(snapshot.date)
  const [note, setNote] = useState(snapshot.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Please enter a valid amount (0 or more)')
      return
    }
    if (!date) {
      setError('Date is required')
      return
    }
    setSaving(true)
    try {
      await window.electronAPI.invoke('assets:update-snapshot', {
        accountId,
        snapshotId: snapshot.id,
        amount: parsedAmount,
        date,
        note: note || undefined,
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Edit Snapshot</div>

        <div>
          <label style={labelStyle}>Amount</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError('') }}
          />
        </div>

        <div>
          <label style={labelStyle}>Date</label>
          <input
            style={inputStyle}
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setError('') }}
          />
        </div>

        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input
            style={inputStyle}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
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

// ── 6. DeleteSnapshotModal ──────────────────────────────────────────────────

interface DeleteSnapshotModalProps {
  accountId: string
  snapshot: BalanceSnapshot
  onClose: () => void
  onDeleted: () => void
}

export function DeleteSnapshotModal({ accountId, snapshot, onClose, onDeleted }: DeleteSnapshotModalProps): JSX.Element {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(): Promise<void> {
    setDeleting(true)
    try {
      await window.electronAPI.invoke('assets:delete-snapshot', {
        accountId,
        snapshotId: snapshot.id,
      })
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Delete Snapshot</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 }}>
          Delete snapshot from {snapshot.date} (${snapshot.amount.toLocaleString()})? This cannot be undone.
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
