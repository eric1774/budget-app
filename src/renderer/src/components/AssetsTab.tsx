import { useCallback, useEffect, useState } from 'react'
import type { AssetAccount, BalanceSnapshot } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { AccountDetailPanel } from './AccountDetailPanel'
import {
  AddAccountModal,
  EditAccountModal,
  DeleteAccountModal,
  AddSnapshotModal,
  EditSnapshotModal,
  DeleteSnapshotModal,
} from './AccountModals'

interface AssetsTabProps {
  onAccountSelect: (account: AssetAccount | null) => void
  selectedAccountId: string | null
}

type ModalState =
  | { kind: 'add-account' }
  | { kind: 'edit-account'; account: AssetAccount }
  | { kind: 'delete-account'; account: AssetAccount }
  | { kind: 'add-snapshot'; accountId: string }
  | { kind: 'edit-snapshot'; accountId: string; snapshot: BalanceSnapshot }
  | { kind: 'delete-snapshot'; accountId: string; snapshot: BalanceSnapshot }
  | null

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
})

function getLatestSnapshot(account: AssetAccount): BalanceSnapshot | null {
  if (account.snapshots.length === 0) return null
  return account.snapshots.reduce((best, s) => (s.date.localeCompare(best.date) > 0 ? s : best))
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

export function AssetsTab({ onAccountSelect, selectedAccountId }: AssetsTabProps): JSX.Element {
  const [accounts, setAccounts] = useState<AssetAccount[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)

  const reloadAccounts = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const data = await window.electronAPI.invoke('assets:get-accounts')
        setAccounts((data as AssetAccount[]) ?? [])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadAccounts(): Promise<void> {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.invoke('assets:get-accounts')
        if (!cancelled) setAccounts((result as AssetAccount[]) ?? [])
      } else {
        try {
          const r = await fetch('/api/assets/accounts')
          const data = await r.json()
          if (!cancelled) setAccounts((data as AssetAccount[]) ?? [])
        } catch {
          if (!cancelled) setAccounts([])
        }
      }
    }

    loadAccounts()
    return () => { cancelled = true }
  }, [])

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null

  const totalNetAssets = accounts.reduce((sum, account) => {
    const latest = getLatestSnapshot(account)
    return sum + (latest ? latest.amount : 0)
  }, 0)

  const sortedSnapshots = selectedAccount
    ? [...selectedAccount.snapshots].sort((a, b) => b.date.localeCompare(a.date))
    : []

  return (
    <div className="assets-tab-outer">
      {/* Net Assets summary card */}
      <GlassCard style={{ padding: 24 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>Total Net Assets</div>
        <div style={{ color: 'var(--color-accent)', fontSize: 32, fontWeight: 700 }}>
          {cadFormatter.format(totalNetAssets)}
        </div>
      </GlassCard>

      {/* Add Account button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          style={primaryBtn}
          onClick={() => setModal({ kind: 'add-account' })}
        >
          + Add Account
        </button>
      </div>

      {/* Account cards grid */}
      {accounts.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
          No accounts yet. Add an account to get started.
        </div>
      ) : (
        <div className="assets-account-grid">
          {accounts.map((account) => {
            const latest = getLatestSnapshot(account)
            const isSelected = account.id === selectedAccountId
            const isHovered = account.id === hoveredId
            const borderColor = isSelected || isHovered ? 'var(--color-accent)' : 'var(--border-accent)'

            return (
              <div
                key={account.id}
                role="button"
                tabIndex={0}
                onClick={() => onAccountSelect(account)}
                onMouseEnter={() => setHoveredId(account.id)}
                onMouseLeave={() => setHoveredId(null)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onAccountSelect(account) }}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                {/* Card action buttons (edit + delete) */}
                <div style={{ display: 'flex', gap: 4, position: 'absolute', top: 10, right: 10, zIndex: 2 }}>
                  <button
                    title="Edit account"
                    onClick={(e) => { e.stopPropagation(); setModal({ kind: 'edit-account', account }) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
                  >
                    ✏
                  </button>
                  <button
                    title="Delete account"
                    onClick={(e) => { e.stopPropagation(); setModal({ kind: 'delete-account', account }) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
                  >
                    ✕
                  </button>
                </div>

                <GlassCard
                  style={{
                    padding: 16,
                    border: `1px solid ${borderColor}`,
                  }}
                >
                  {/* Account name */}
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    {account.name}
                  </div>

                  {/* Type badge */}
                  <div style={{
                    display: 'inline-block',
                    background: 'rgba(32,200,160,0.15)',
                    color: 'var(--color-accent)',
                    fontSize: 11,
                    borderRadius: 4,
                    padding: '2px 7px',
                    marginBottom: 12,
                  }}>
                    {account.type}
                  </div>

                  {/* Balance */}
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {latest ? cadFormatter.format(latest.amount) : (
                      <span style={{ color: 'var(--text-muted)' }}>No data</span>
                    )}
                  </div>

                  {/* Last updated */}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {latest
                      ? `Updated ${new Date(latest.date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
                      : 'No snapshots'}
                  </div>
                </GlassCard>
              </div>
            )
          })}
        </div>
      )}

      {/* Selected account: Add Snapshot button + snapshot list */}
      {selectedAccount && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15 }}>
              Snapshots — {selectedAccount.name}
            </div>
            <button
              style={primaryBtn}
              onClick={() => setModal({ kind: 'add-snapshot', accountId: selectedAccount.id })}
            >
              + Add Snapshot
            </button>
          </div>

          {/* Snapshot list */}
          {sortedSnapshots.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
              No snapshots yet. Add one to start tracking.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedSnapshots.map((snapshot) => (
                <li
                  key={snapshot.id}
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
                  <span>
                    {snapshot.date} &mdash; ${snapshot.amount.toLocaleString()}
                    {snapshot.note ? ` · ${snapshot.note}` : ''}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      title="Edit snapshot"
                      onClick={() => setModal({ kind: 'edit-snapshot', accountId: selectedAccount.id, snapshot })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '2px 4px' }}
                    >
                      ✏
                    </button>
                    <button
                      title="Delete snapshot"
                      onClick={() => setModal({ kind: 'delete-snapshot', accountId: selectedAccount.id, snapshot })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '2px 4px' }}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <AccountDetailPanel
            account={selectedAccount}
            onClose={() => onAccountSelect(null)}
          />
        </>
      )}

      {/* Modals */}
      {modal?.kind === 'add-account' && (
        <AddAccountModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAccounts() }} />
      )}
      {modal?.kind === 'edit-account' && (
        <EditAccountModal account={modal.account} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAccounts() }} />
      )}
      {modal?.kind === 'delete-account' && (
        <DeleteAccountModal account={modal.account} onClose={() => setModal(null)} onDeleted={() => { setModal(null); reloadAccounts() }} />
      )}
      {modal?.kind === 'add-snapshot' && (
        <AddSnapshotModal accountId={modal.accountId} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAccounts() }} />
      )}
      {modal?.kind === 'edit-snapshot' && (
        <EditSnapshotModal accountId={modal.accountId} snapshot={modal.snapshot} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAccounts() }} />
      )}
      {modal?.kind === 'delete-snapshot' && (
        <DeleteSnapshotModal accountId={modal.accountId} snapshot={modal.snapshot} onClose={() => setModal(null)} onDeleted={() => { setModal(null); reloadAccounts() }} />
      )}
    </div>
  )
}
