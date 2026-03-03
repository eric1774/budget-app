import { useCallback, useEffect, useState } from 'react'
import type { AssetAccount } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { AccountDetailPanel } from './AccountDetailPanel'
import {
  AddAccountModal,
  EditAccountModal,
  DeleteAccountModal,
} from './AccountModals'

interface AssetsTabProps {
  onAccountSelect: (account: AssetAccount | null) => void
  selectedAccountId: string | null
}

type ModalState =
  | { kind: 'add-account' }
  | { kind: 'edit-account'; account: AssetAccount }
  | { kind: 'delete-account'; account: AssetAccount }
  | null

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
})

function accountBalance(account: AssetAccount): number {
  return account.transactions.reduce((sum, t) => {
    return t.type === 'deposit' ? sum + t.amount : sum - t.amount
  }, 0)
}

function lastTransactionDate(account: AssetAccount): string | null {
  if (account.transactions.length === 0) return null
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

  const totalNetAssets = accounts.reduce((sum, account) => sum + accountBalance(account), 0)

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
            const balance = accountBalance(account)
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
                    {account.transactions.length > 0 ? cadFormatter.format(balance) : (
                      <span style={{ color: 'var(--text-muted)' }}>No data</span>
                    )}
                  </div>

                  {/* Last transaction */}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {lastDate
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
