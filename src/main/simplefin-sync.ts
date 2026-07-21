import { fetchAccounts, type FetchLike, type SfResponse } from './simplefin-client'
import { getSimplefinData, updateSimplefinData, appendRawSync } from './simplefin-store'
import { getAccounts, applySyncedBalance } from './assets-store'
import type { DiscoveredAccount, SimplefinStatus } from '../shared/types'

export const MANUAL_COOLDOWN_MS = 15 * 60 * 1000

export type SyncResult =
  | { ok: true }
  | { ok: false; reason: 'not-connected' | 'cooldown' | 'error'; message: string }

// Local calendar date (container TZ is America/Chicago); en-CA gives YYYY-MM-DD.
function localDate(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

export async function runSync(opts: { manual: boolean; fetchImpl?: FetchLike; now?: Date }): Promise<SyncResult> {
  const data = getSimplefinData()
  if (!data.accessUrl) return { ok: false, reason: 'not-connected', message: 'SimpleFIN is not connected' }

  const now = opts.now ?? new Date()
  if (opts.manual && data.lastSyncAt && now.getTime() - Date.parse(data.lastSyncAt) < MANUAL_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown', message: 'Synced recently — try again in a few minutes' }
  }

  // start-date: 7 days before last sync (overlap is fine, raw log is append-only);
  // first sync reaches back 30 days.
  const since = data.lastSyncAt
    ? new Date(Date.parse(data.lastSyncAt) - 7 * 24 * 3600 * 1000)
    : new Date(now.getTime() - 30 * 24 * 3600 * 1000)

  let response: SfResponse
  try {
    response = await fetchAccounts(data.accessUrl, since, opts.fetchImpl)
  } catch (err) {
    // Never lie, never zero: leave every stored balance untouched on failure.
    updateSimplefinData({ lastSyncError: err instanceof Error ? err.message : String(err) })
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
  }

  appendRawSync(response)

  const discovered: DiscoveredAccount[] = response.accounts.map((a) => ({
    id: a.id,
    org: a.org?.name ?? a.org?.domain ?? 'Unknown institution',
    name: a.name,
    balance: Number.parseFloat(a.balance),
    balanceDate: new Date(a['balance-date'] * 1000).toISOString(),
  }))

  const snapshotDate = localDate(now)
  for (const remote of discovered) {
    const broken = response.errors.some((e) => e.includes(remote.org))
    applySyncedBalance(remote.id, remote.balance, snapshotDate, broken)
  }

  updateSimplefinData({
    lastSyncAt: now.toISOString(),
    lastSyncError: null,
    errors: response.errors,
    discovered,
  })
  return { ok: true }
}

// ── Scheduler: fire once per 6am/18pm local slot ─────────────────────────────

export function dueSlot(now: Date, lastFiredSlot: string | null): string | null {
  const h = now.getHours()
  const slot = h >= 18 ? 'pm' : h >= 6 ? 'am' : null
  if (!slot) return null
  const key = `${localDateKey(now)}-${slot}`
  return key === lastFiredSlot ? null : key
}

function localDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null

export function startSyncScheduler(): void {
  if (schedulerTimer) return
  const tick = async (): Promise<void> => {
    const data = getSimplefinData()
    if (!data.accessUrl) return
    const slot = dueSlot(new Date(), data.lastScheduledSlot)
    if (!slot) return
    updateSimplefinData({ lastScheduledSlot: slot })   // claim the slot before the await
    const result = await runSync({ manual: false })
    console.log(result.ok ? `SimpleFIN scheduled sync ok (${slot})` : `SimpleFIN scheduled sync failed: ${result.message}`)
  }
  schedulerTimer = setInterval(() => { void tick() }, 60_000)
  schedulerTimer.unref()
  void tick()   // catch up immediately on boot
}

export function stopSyncScheduler(): void {
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null }
}

// ── Client-facing status (never includes accessUrl) ──────────────────────────

export function buildStatus(isAdmin: boolean): SimplefinStatus {
  const data = getSimplefinData()
  const accounts = getAccounts()
  const linkByRemoteId = new Map(
    accounts.filter((a) => a.simplefin).map((a) => [a.simplefin!.accountId, a.id])
  )
  return {
    connected: data.accessUrl !== null,
    lastSyncAt: data.lastSyncAt,
    lastSyncError: data.lastSyncError,
    errors: data.errors,
    isAdmin,
    discovered: data.discovered.map((d) => {
      const linkedAccountId = linkByRemoteId.get(d.id)
      return {
        ...d,
        state: linkedAccountId ? 'linked' as const : data.ignoredAccountIds.includes(d.id) ? 'ignored' as const : 'new' as const,
        ...(linkedAccountId ? { linkedAccountId } : {}),
      }
    }),
  }
}
