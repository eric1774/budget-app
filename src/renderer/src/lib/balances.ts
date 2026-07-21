import type { AssetAccount } from '../../../shared/types'

// Single source of truth for account balances in the renderer — previously
// duplicated across AssetsTab / NetWorthSection / AccountDetailPanel.
export function accountBalance(account: AssetAccount): number {
  if (account.simplefin && account.syncedBalance !== undefined) return account.syncedBalance
  return (account.transactions ?? []).reduce(
    (sum, t) => (t.type === 'deposit' ? sum + t.amount : sum - t.amount),
    0,
  )
}

export function getDisplayBalance(account: AssetAccount, dashboardBalance?: number): number {
  if (account.syncedWithDashboard && dashboardBalance !== undefined) return dashboardBalance
  return accountBalance(account)
}

// Last snapshot dated on or before isoDate ("YYYY-MM-DD"), or null if none.
export function snapshotAtOrBefore(account: AssetAccount, isoDate: string): number | null {
  const snaps = account.snapshots ?? []
  let best: number | null = null
  for (const s of snaps) {
    if (s.date <= isoDate) best = s.balance
    else break   // snapshots are stored sorted ascending
  }
  return best
}

export function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Stale = older than 36h → multiple scheduled syncs have been missed (spec §8).
export function isStale(iso: string | null, hours = 36): boolean {
  if (!iso) return false
  return Date.now() - Date.parse(iso) > hours * 3600 * 1000
}
