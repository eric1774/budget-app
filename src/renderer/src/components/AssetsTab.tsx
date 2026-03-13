import { useCallback, useEffect, useState } from 'react'
import type { AssetAccount, Mortgage } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { AccountDetailPanel } from './AccountDetailPanel'
import {
  AddAccountModal,
  EditAccountModal,
  DeleteAccountModal,
} from './AccountModals'
import {
  AddMortgageModal,
  EditMortgageModal,
  DeleteMortgageModal,
} from './MortgageModals'
import { MortgageDetailView } from './MortgageDetailView'
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
  | { kind: 'add-mortgage' }
  | { kind: 'edit-mortgage'; mortgage: Mortgage }
  | { kind: 'delete-mortgage'; mortgage: Mortgage }
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

// Use CSS class btn-primary instead

export function AssetsTab({ onAccountSelect, selectedAccountId, dashboardBalance }: AssetsTabProps): JSX.Element {
  const [accounts, setAccounts] = useState<AssetAccount[]>([])
  const [mortgages, setMortgages] = useState<Mortgage[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [selectedMortgageId, setSelectedMortgageId] = useState<string | null>(null)

  const reloadAccounts = useCallback(async () => {
    try {
      const data = await api.getAccounts()
      setAccounts((data as AssetAccount[]) ?? [])
    } catch { /* ignore */ }
  }, [])

  const reloadMortgages = useCallback(async () => {
    try {
      const data = await api.getMortgages()
      setMortgages((data as Mortgage[]) ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.getAccounts()
      .then((data) => { if (!cancelled) setAccounts((data as AssetAccount[]) ?? []) })
      .catch(() => { if (!cancelled) setAccounts([]) })
    api.getMortgages()
      .then((data) => { if (!cancelled) setMortgages((data as Mortgage[]) ?? []) })
      .catch(() => { if (!cancelled) setMortgages([]) })
    return () => { cancelled = true }
  }, [])

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null

  const getDisplayBalance = (account: AssetAccount): number => {
    if (account.syncedWithDashboard && dashboardBalance !== undefined) return dashboardBalance
    return accountBalance(account)
  }

  // Full-page detail view when an account is selected (like GoalDetailView)
  if (selectedAccount) {
    return (
      <AccountDetailPanel
        account={selectedAccount}
        onClose={() => onAccountSelect(null)}
        onTransactionChange={reloadAccounts}
      />
    )
  }

  const selectedMortgage = mortgages.find(m => m.id === selectedMortgageId) ?? null
  if (selectedMortgage) {
    return (
      <MortgageDetailView
        mortgage={selectedMortgage}
        onBack={() => setSelectedMortgageId(null)}
        onReload={reloadMortgages}
      />
    )
  }

  return (
    <div className="assets-tab-outer">
      <NetWorthSection accounts={accounts} dashboardBalance={dashboardBalance} mortgages={mortgages} />

      {/* Add Account + Add Mortgage buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button
          className="btn-primary"
          onClick={() => setModal({ kind: 'add-mortgage' })}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Mortgage
        </button>
        <button
          className="btn-primary"
          onClick={() => setModal({ kind: 'add-account' })}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Account
        </button>
      </div>

      {/* Mortgage cards */}
      {mortgages.length > 0 && (
        <>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 16, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mortgages
          </div>
          <div className="assets-account-grid">
            {mortgages.map((mortgage) => {
              const equity = mortgage.marketValue - mortgage.principalBalance
              return (
                <div
                  key={mortgage.id}
                  style={{ position: 'relative', cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMortgageId(mortgage.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedMortgageId(mortgage.id) }}
                >
                  {/* Card action buttons (edit + delete) */}
                  <div style={{ display: 'flex', gap: 2, position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
                    <button
                      className="btn-icon"
                      title="Edit mortgage"
                      aria-label={`Edit ${mortgage.name}`}
                      onClick={(e) => { e.stopPropagation(); setModal({ kind: 'edit-mortgage', mortgage }) }}
                      style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      className="btn-icon btn-icon--danger"
                      title="Delete mortgage"
                      aria-label={`Delete ${mortgage.name}`}
                      onClick={(e) => { e.stopPropagation(); setModal({ kind: 'delete-mortgage', mortgage }) }}
                      style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>

                  <GlassCard style={{ padding: 16, border: '1px solid var(--border-accent)' }}>
                    {/* Mortgage name */}
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                      {mortgage.name}
                    </div>

                    {/* Type badge */}
                    <div style={{
                      display: 'inline-block',
                      background: 'rgba(249,115,22,0.15)',
                      color: '#f97316',
                      fontSize: 11,
                      borderRadius: 4,
                      padding: '2px 7px',
                      marginBottom: 12,
                    }}>
                      Mortgage
                    </div>

                    {/* Equity */}
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>Equity</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-accent)', marginBottom: 10 }}>
                      {cadFormatter.format(equity)}
                    </div>

                    {/* Market value + principal in smaller text */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>Market: {cadFormatter.format(mortgage.marketValue)}</span>
                      <span>Owed: {cadFormatter.format(mortgage.principalBalance)}</span>
                    </div>
                  </GlassCard>
                </div>
              )
            })}
          </div>
        </>
      )}

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
                <div style={{ display: 'flex', gap: 2, position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
                  <button
                    className="btn-icon"
                    title="Edit account"
                    aria-label={`Edit ${account.name}`}
                    onClick={(e) => { e.stopPropagation(); setModal({ kind: 'edit-account', account }) }}
                    style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    className="btn-icon btn-icon--danger"
                    title="Delete account"
                    aria-label={`Delete ${account.name}`}
                    onClick={(e) => { e.stopPropagation(); setModal({ kind: 'delete-account', account }) }}
                    style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
      {modal?.kind === 'add-mortgage' && (
        <AddMortgageModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadMortgages() }} />
      )}
      {modal?.kind === 'edit-mortgage' && (
        <EditMortgageModal mortgage={modal.mortgage} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadMortgages() }} />
      )}
      {modal?.kind === 'delete-mortgage' && (
        <DeleteMortgageModal mortgage={modal.mortgage} onClose={() => setModal(null)} onDeleted={() => { setModal(null); reloadMortgages() }} />
      )}
    </div>
  )
}
