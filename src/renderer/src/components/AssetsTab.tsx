import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Plus, PencilSimple, Trash, ArrowsClockwise, LinkSimple, WarningCircle } from '@phosphor-icons/react'
import type { AssetAccount, AuthUser, Mortgage, SimplefinStatus } from '../../../shared/types'
import { AccountDetailPanel } from './AccountDetailPanel'
import { getDisplayBalance, relTime, isStale } from '../lib/balances'
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
  user: AuthUser | null
}

type ModalState =
  | { kind: 'add-account' }
  | { kind: 'edit-account'; account: AssetAccount }
  | { kind: 'delete-account'; account: AssetAccount }
  | { kind: 'add-mortgage' }
  | { kind: 'edit-mortgage'; mortgage: Mortgage }
  | { kind: 'delete-mortgage'; mortgage: Mortgage }
  | { kind: 'simplefin' }
  | null

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const cadShortFormatter = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

// Matches NetWorthSection's donut colors so cards and chart agree
const TYPE_COLORS: Record<string, string> = {
  Checkings: '#2DD4BF',
  Savings: '#60A5FA',
  Retirement: '#FBBF24',
  'Hard Asset': '#F87171',
  Investing: '#A78BFA',
  Goal: '#34D399',
}

function lastTransactionDate(account: AssetAccount): string | null {
  // Asset transaction dates are ISO strings on disk; the shared type erroneously
  // resolves to the Excel Transaction (Date) — compare as strings
  if ((account.transactions ?? []).length === 0) return null
  return account.transactions.reduce<string>((best, t) => {
    const d = t.date as unknown as string
    return d.localeCompare(best) > 0 ? d : best
  }, account.transactions[0].date as unknown as string)
}

// Use CSS class btn-primary instead

export function AssetsTab({ onAccountSelect, selectedAccountId, dashboardBalance, user }: AssetsTabProps): JSX.Element {
  const [accounts, setAccounts] = useState<AssetAccount[]>([])
  const [mortgages, setMortgages] = useState<Mortgage[]>([])
  const [modal, setModal] = useState<ModalState>(null)
  const [selectedMortgageId, setSelectedMortgageId] = useState<string | null>(null)
  const [simplefinStatus, setSimplefinStatus] = useState<SimplefinStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)

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

  const reloadSimplefin = useCallback(async () => {
    try { setSimplefinStatus(await api.getSimplefinStatus()) } catch { /* web-mode only */ }
  }, [])

  useEffect(() => { void reloadSimplefin() }, [reloadSimplefin])

  async function handleSyncNow(): Promise<void> {
    setSyncing(true)
    setSyncNote(null)
    const result = await api.syncSimplefin()
    setSyncing(false)
    if (result.ok) {
      setSimplefinStatus(result.status)
      await reloadAccounts()
    } else {
      setSyncNote(result.error)   // cooldown / bridge failure — quiet inline note, no toast
    }
  }

  const isAdmin = simplefinStatus?.isAdmin ?? false
  const showSyncControls = simplefinStatus?.connected || isAdmin

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null

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

      {/* Accounts section */}
      <div className="asset-section-head">
        <span className="asset-section-head__title">Accounts</span>
        {showSyncControls && (
          <div className="sf-syncbar">
            {simplefinStatus?.lastSyncAt && (
              <span className={`asset-card__meta${isStale(simplefinStatus.lastSyncAt) ? ' sf-meta--stale' : ''}`}>
                Synced {relTime(simplefinStatus.lastSyncAt)}
              </span>
            )}
            {syncNote && <span className="asset-card__meta sf-meta--stale">{syncNote}</span>}
            {simplefinStatus?.connected && (
              <button className="btn-ghost" onClick={() => void handleSyncNow()} disabled={syncing} aria-label="Sync balances now">
                <ArrowsClockwise size={13} weight="bold" className={syncing ? 'sf-spin' : undefined} />
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            {isAdmin && (
              <button className="btn-ghost" onClick={() => setModal({ kind: 'simplefin' })}>
                <LinkSimple size={13} weight="bold" />
                Linked accounts
              </button>
            )}
          </div>
        )}
        <button className="btn-ghost" onClick={() => setModal({ kind: 'add-account' })}>
          <Plus size={13} weight="bold" />
          Add Account
        </button>
      </div>
      {accounts.length === 0 ? (
        <div className="asset-empty">No accounts yet. Add an account to get started.</div>
      ) : (
        <div className="assets-account-grid">
          {accounts.map((account) => {
            const balance = getDisplayBalance(account, dashboardBalance)
            const isSynced = account.syncedWithDashboard && dashboardBalance !== undefined
            const lastDate = lastTransactionDate(account)
            const accent = TYPE_COLORS[account.type] ?? 'var(--accent)'
            const hasValue = isSynced || (account.transactions ?? []).length > 0

            return (
              <div className="asset-card-wrap" key={account.id}>
                <div className="asset-card-actions">
                  <button
                    className="btn-icon"
                    style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                    title="Edit account"
                    aria-label={`Edit ${account.name}`}
                    onClick={() => setModal({ kind: 'edit-account', account })}
                  >
                    <PencilSimple size={13} />
                  </button>
                  <button
                    className="btn-icon btn-icon--danger"
                    style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                    title="Delete account"
                    aria-label={`Delete ${account.name}`}
                    onClick={() => setModal({ kind: 'delete-account', account })}
                  >
                    <Trash size={13} />
                  </button>
                </div>

                <button
                  className={`glass-card asset-card${account.id === selectedAccountId ? ' asset-card--selected' : ''}`}
                  style={{ '--card-accent': accent } as CSSProperties}
                  onClick={() => onAccountSelect(account)}
                  aria-label={`${account.name} (${account.type})${hasValue ? `: ${cadFormatter.format(balance)}` : ''}. View details.`}
                >
                  <div className="budget-card__top">
                    <span className="budget-card__name">{account.name}</span>
                    <span className="asset-chip">{account.type}</span>
                  </div>
                  <div className="budget-card__nums">
                    {hasValue ? (
                      <span className="budget-card__spent">{cadFormatter.format(balance)}</span>
                    ) : (
                      <span className="asset-card__nodata">
                        {account.syncedWithDashboard ? 'Load a file' : 'No data'}
                      </span>
                    )}
                  </div>
                  <div className="asset-card__meta">
                    {account.simplefin ? (
                      account.needsAttention ? (
                        <>
                          <WarningCircle size={12} weight="fill" className="sf-badge-attention" />
                          {account.simplefin.org} · needs attention
                        </>
                      ) : (
                        <>
                          <span className={`status-dot ${isStale(simplefinStatus?.lastSyncAt ?? null) ? '' : 'status-dot--online'}`} />
                          {account.simplefin.org}
                          {simplefinStatus?.lastSyncAt ? ` · synced ${relTime(simplefinStatus.lastSyncAt)}` : ''}
                        </>
                      )
                    ) : isSynced ? (
                      <>
                        <span className="status-dot status-dot--online" />
                        Synced with Dashboard
                      </>
                    ) : account.syncedWithDashboard && dashboardBalance === undefined ? (
                      'Syncs when file is loaded'
                    ) : lastDate ? (
                      `Updated ${new Date(lastDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    ) : (
                      'No transactions'
                    )}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Mortgages section */}
      <div className="asset-section-head">
        <span className="asset-section-head__title">Mortgages</span>
        <button className="btn-ghost" onClick={() => setModal({ kind: 'add-mortgage' })}>
          <Plus size={13} weight="bold" />
          Add Mortgage
        </button>
      </div>
      {mortgages.length === 0 ? (
        <div className="asset-empty">No mortgages tracked.</div>
      ) : (
        <div className="assets-account-grid">
          {mortgages.map((mortgage) => {
            const equity = mortgage.marketValue - mortgage.principalBalance
            const equityPct = mortgage.marketValue > 0 ? (equity / mortgage.marketValue) * 100 : 0
            return (
              <div className="asset-card-wrap" key={mortgage.id}>
                <div className="asset-card-actions">
                  <button
                    className="btn-icon"
                    style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                    title="Edit mortgage"
                    aria-label={`Edit ${mortgage.name}`}
                    onClick={() => setModal({ kind: 'edit-mortgage', mortgage })}
                  >
                    <PencilSimple size={13} />
                  </button>
                  <button
                    className="btn-icon btn-icon--danger"
                    style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                    title="Delete mortgage"
                    aria-label={`Delete ${mortgage.name}`}
                    onClick={() => setModal({ kind: 'delete-mortgage', mortgage })}
                  >
                    <Trash size={13} />
                  </button>
                </div>

                <button
                  className="glass-card asset-card"
                  style={{ '--card-accent': '#FB923C' } as CSSProperties}
                  onClick={() => setSelectedMortgageId(mortgage.id)}
                  aria-label={`${mortgage.name} mortgage: ${cadFormatter.format(equity)} equity, ${Math.round(equityPct)}% of market value. View details.`}
                >
                  <div className="budget-card__top">
                    <span className="budget-card__name">{mortgage.name}</span>
                    <span className="asset-chip">Mortgage</span>
                  </div>
                  <div className="budget-card__nums">
                    <span className="budget-card__spent">{cadFormatter.format(equity)}</span>
                    <span className="budget-card__of">equity</span>
                  </div>
                  <div
                    className="budget-bar"
                    role="progressbar"
                    aria-valuenow={Math.round(equityPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${Math.round(equityPct)}% equity`}
                  >
                    <div className="budget-bar__fill asset-card__equity-fill" style={{ width: `${Math.min(equityPct, 100)}%` }} />
                  </div>
                  <div className="budget-card__bottom">
                    <span className="asset-card__meta">Market {cadShortFormatter.format(mortgage.marketValue)}</span>
                    <span className="asset-card__meta">Owed {cadShortFormatter.format(mortgage.principalBalance)}</span>
                  </div>
                </button>
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
      {modal?.kind === 'simplefin' && null}
    </div>
  )
}
