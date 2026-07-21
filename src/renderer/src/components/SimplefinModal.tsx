import { useState } from 'react'
import { ArrowSquareOut, LinkSimple, Prohibit, Plus } from '@phosphor-icons/react'
import type { AccountType, AssetAccount, SimplefinStatus } from '../../../shared/types'
import * as api from '../api'

const ACCOUNT_TYPES: AccountType[] = ['Checkings', 'Savings', 'Retirement', 'Hard Asset', 'Investing', 'Goal']
const BRIDGE_URL = 'https://beta-bridge.simplefin.org/'

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
  maxWidth: 560,
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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  colorScheme: 'dark',
  background: '#1e2128',
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

interface SimplefinModalProps {
  status: SimplefinStatus
  accounts: AssetAccount[]
  onClose: () => void
  onChanged: () => Promise<void>
}

export function SimplefinModal({ status, accounts, onClose, onChanged }: SimplefinModalProps): JSX.Element {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Per-row draft state for "create new": name + type
  const [drafts, setDrafts] = useState<Record<string, { name: string; type: AccountType }>>({})
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  async function run(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await fn()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const unmappedManualAccounts = accounts.filter((a) => !a.simplefin)

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyle} role="dialog" aria-label="Linked accounts">
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Linked Accounts</div>

        {!status.connected ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              Connect your banks at SimpleFIN Bridge, then paste the one-time setup token here.
              The token is exchanged once and never shown again.
            </p>
            <a href={BRIDGE_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 13 }}>
              Open SimpleFIN Bridge <ArrowSquareOut size={12} />
            </a>
            <div>
              <label style={labelStyle}>Setup token</label>
              <input style={inputStyle} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste setup token" />
            </div>
            {error && <div style={{ color: 'var(--expense)', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={cancelBtn} onClick={onClose}>Close</button>
              <button
                style={primaryBtn}
                disabled={busy || !token.trim()}
                onClick={() => void run(() => api.claimSimplefin(token.trim()))}
              >
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </>
        ) : (
          <>
            {status.errors.length > 0 && (
              <div style={{ color: 'var(--warning, #FBBF24)', fontSize: 13 }}>
                {status.errors.map((e) => <div key={e}>{e}</div>)}
                <a href={BRIDGE_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                  Repair at SimpleFIN Bridge <ArrowSquareOut size={12} />
                </a>
              </div>
            )}
            {status.lastSyncError && (
              <div style={{ color: 'var(--expense)', fontSize: 13 }}>Last sync failed: {status.lastSyncError}</div>
            )}

            <div className="pay-list">
              {status.discovered.map((d) => {
                const draft = drafts[d.id] ?? { name: d.name, type: 'Checkings' as AccountType }
                const linkedAccount = d.linkedAccountId ? accounts.find((a) => a.id === d.linkedAccountId) : undefined
                return (
                  <div key={d.id} className="pay-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: '1 1 100%' }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{d.org}</div>
                    </div>
                    {d.state === 'linked' ? (
                      <>
                        <span style={{ color: 'var(--income)', fontSize: 12 }}>
                          <LinkSimple size={12} /> Linked to {linkedAccount?.name ?? 'account'}
                        </span>
                        <button
                          style={cancelBtn}
                          disabled={busy}
                          onClick={() => d.linkedAccountId && void run(() => api.unlinkSimplefin(d.linkedAccountId!))}
                        >
                          Unlink
                        </button>
                      </>
                    ) : d.state === 'ignored' ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}><Prohibit size={12} /> Ignored</span>
                    ) : (
                      <>
                        <select
                          style={{ ...selectStyle, width: 'auto', flex: 1 }}
                          disabled={busy}
                          defaultValue=""
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === '') return
                            if (v === '__ignore') void run(() => api.mapSimplefin({ simplefinAccountId: d.id, action: 'ignore' }))
                            else if (v === '__create') setDrafts({ ...drafts, [d.id]: draft })
                            else void run(() => api.mapSimplefin({ simplefinAccountId: d.id, action: 'attach', accountId: v }))
                          }}
                        >
                          <option value="" disabled>Choose…</option>
                          {unmappedManualAccounts.map((a) => (
                            <option key={a.id} value={a.id}>Attach to “{a.name}”</option>
                          ))}
                          <option value="__create">Create new account</option>
                          <option value="__ignore">Ignore</option>
                        </select>
                        {drafts[d.id] && (
                          <div style={{ display: 'flex', gap: 8, flex: '1 1 100%' }}>
                            <input
                              style={inputStyle}
                              value={draft.name}
                              onChange={(e) => setDrafts({ ...drafts, [d.id]: { ...draft, name: e.target.value } })}
                            />
                            <select
                              style={selectStyle}
                              value={draft.type}
                              onChange={(e) => setDrafts({ ...drafts, [d.id]: { ...draft, type: e.target.value as AccountType } })}
                            >
                              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button
                              style={primaryBtn}
                              disabled={busy || !draft.name.trim()}
                              onClick={() => void run(() => api.mapSimplefin({ simplefinAccountId: d.id, action: 'create', name: draft.name.trim(), type: draft.type }))}
                            >
                              <Plus size={12} weight="bold" /> Create
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              {status.discovered.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  No accounts discovered yet — run a sync, or check your connections at the bridge.
                </div>
              )}
            </div>

            {error && <div style={{ color: 'var(--expense)', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              {confirmDisconnect ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Disconnect SimpleFIN?</span>
                  <button style={dangerBtn} disabled={busy} onClick={() => void run(() => api.disconnectSimplefin())}>Disconnect</button>
                  <button style={cancelBtn} onClick={() => setConfirmDisconnect(false)}>Keep</button>
                </div>
              ) : (
                <button style={cancelBtn} onClick={() => setConfirmDisconnect(true)}>Disconnect…</button>
              )}
              <button style={cancelBtn} onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
