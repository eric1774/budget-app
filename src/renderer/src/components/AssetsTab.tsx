import { useEffect, useState } from 'react'
import type { AssetAccount, BalanceSnapshot } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { AccountDetailPanel } from './AccountDetailPanel'

interface AssetsTabProps {
  onAccountSelect: (account: AssetAccount | null) => void
  selectedAccountId: string | null
}

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
})

function getLatestSnapshot(account: AssetAccount): BalanceSnapshot | null {
  if (account.snapshots.length === 0) return null
  return account.snapshots.reduce((best, s) => (s.date.localeCompare(best.date) > 0 ? s : best))
}

export function AssetsTab({ onAccountSelect, selectedAccountId }: AssetsTabProps): JSX.Element {
  const [accounts, setAccounts] = useState<AssetAccount[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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

  return (
    <div className="assets-tab-outer">
      {/* Net Assets summary card */}
      <GlassCard style={{ padding: 24 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>Total Net Assets</div>
        <div style={{ color: 'var(--color-accent)', fontSize: 32, fontWeight: 700 }}>
          {cadFormatter.format(totalNetAssets)}
        </div>
      </GlassCard>

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
                style={{ cursor: 'pointer' }}
              >
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

      {selectedAccount && (
        <AccountDetailPanel
          account={selectedAccount}
          onClose={() => onAccountSelect(null)}
        />
      )}
    </div>
  )
}
