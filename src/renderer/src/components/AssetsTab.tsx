import { useCallback, useEffect, useState } from 'react'
import type { AssetAccount } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { AccountDetailPanel } from './AccountDetailPanel'
import {
  AddAccountModal,
  EditAccountModal,
  DeleteAccountModal,
} from './AccountModals'
import * as api from '../api'
import { NetWorthSection } from './NetWorthSection'

interface AssetsTabProps {
  onAccountSelect: (account: AssetAccount | null) => void
  selectedAccountId: string | null
  dashboardBalance?: number
}

type ModalState =
  | { kind: 'add-account' }
  | { kind: 'edit-account'; account: AssetAccount }
  | { kind: 'delete-account'; account: AssetAccount }
  | null

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function accountBalance(account: AssetAccount): number {
  return (account.transactions ?? []).reduce((sum, t) => {
    return t.type === 'deposit' ? sum + t.amount : sum - t.amount
  }, 0)
}

function lastTransactionDate(account: AssetAccount): string | null {
  if ((account.transactions ?? []).length === 0) return null
  return account.transactions.reduce((best, t) =>
    t.date.localeCompare(best) > 0 ? t.date : best
  , account.transactions[0].date)
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

export function AssetsTab({ onAccountSelect, selectedAccountId, dashboardBalance }: AssetsTabProps): JSX.Element {
  const [accounts, setAccounts] = useState<AssetAccount[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)

  const reloadAccounts = useCallback(async () => {
    try {
      const data = await api.getAccounts()
      setAccounts((data as AssetAccount[]) ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.getAccounts()
      .then((data) => { if (!cancelled) setAccounts((data as AssetAccount[]) ?? []) })
      .catch(() => { if (!cancelled) setAccounts([]) })
    return () => { cancelled = true }
  }, [])

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null

  const getDisplayBalance = (account: AssetAccount): number => {
    if (account.syncedWithDashboard && dashboardBalance !== undefined) return dashboardBalance
    return accountBalance(account)
  }

  return (
    <div className="assets-tab-outer">
      <NetWorthSection accounts={accounts} dashboardBalance={dashboardBalance} />

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
            const balance = getDisplayBalance(account)
            const isSynced = account.syncedWithDashboard && dashboardBalance !== undefined
            const lastDate = lastTransactionDate(account)
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
                    &#9999;
                  </button>
                  <button
                    title="Delete account"
                    onClick={(e) => { e.stopPropagation(); setModal({ kind: 'delete-account', account }) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
                  >
                    &times;
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
                    {isSynced
                      ? cadFormatter.format(balance)
                      : (account.transactions ?? []).length > 0
                        ? cadFormatter.format(balance)
                        : account.syncedWithDashboard
                          ? <span style={{ color: 'var(--text-muted)' }}>Load a file</span>
                          : <span style={{ color: 'var(--text-muted)' }}>No data</span>
                    }
                  </div>

                  {/* Last transaction / sync indicator */}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {isSynced
                      ? 'Synced with Dashboard'
                      : account.syncedWithDashboard && dashboardBalance === undefined
                        ? 'Syncs when file is loaded'
                        : lastDate
                          ? `Updated ${new Date(lastDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
                          : 'No transactions'}
                  </div>
                </GlassCard>
              </div>
            )
          })}
        </div>
      )}

      {/* Selected account detail panel */}
      {selectedAccount && (
        <AccountDetailPanel
          account={selectedAccount}
          onClose={() => onAccountSelect(null)}
          onTransactionChange={reloadAccounts}
        />
      )}

      {/* Account Modals */}
      {modal?.kind === 'add-account' && (
        <AddAccountModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAccounts() }} />
      )}
      {modal?.kind === 'edit-account' && (
        <EditAccountModal account={modal.account} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAccounts() }} />
      )}
      {modal?.kind === 'delete-account' && (
        <DeleteAccountModal account={modal.account} onClose={() => setModal(null)} onDeleted={() => { setModal(null); reloadAccounts() }} />
      )}
    </div>
  )
}
