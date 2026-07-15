/**
 * API layer — tries Electron IPC first, falls back to HTTP for browser/mobile mode.
 */

import type { AccountType, AuthUser } from '../../shared/types'

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { electronAPI?: unknown }).electronAPI
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ipc(channel: string, ...args: unknown[]): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as Window & { electronAPI: { invoke: (ch: string, ...a: unknown[]) => Promise<any> } }).electronAPI.invoke(channel, ...args)
}

function bounceToLoginOn401(r: Response): void {
  if (r.status === 401) window.location.href = '/auth/login'
}

async function httpGet(path: string): Promise<unknown> {
  const r = await fetch(path)
  bounceToLoginOn401(r)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function httpPost(path: string, body: unknown): Promise<unknown> {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  bounceToLoginOn401(r)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function httpPut(path: string, body: unknown): Promise<unknown> {
  const r = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  bounceToLoginOn401(r)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function httpDelete(path: string): Promise<unknown> {
  const r = await fetch(path, { method: 'DELETE' })
  bounceToLoginOn401(r)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// ── Assets ────────────────────────────────────────────────────────────────────

export function getAccounts(): Promise<unknown> {
  if (isElectron()) return ipc('assets:get-accounts')
  return httpGet('/api/assets/accounts')
}

export function addAccount(name: string, type: AccountType): Promise<unknown> {
  if (isElectron()) return ipc('assets:add-account', { name, type })
  return httpPost('/api/assets/accounts', { name, type })
}

export function updateAccount(id: string, name: string, type: AccountType): Promise<unknown> {
  if (isElectron()) return ipc('assets:update-account', { id, name, type })
  return httpPut(`/api/assets/accounts/${id}`, { name, type })
}

export function deleteAccount(id: string): Promise<unknown> {
  if (isElectron()) return ipc('assets:delete-account', { id })
  return httpDelete(`/api/assets/accounts/${id}`)
}

export function addTransaction(accountId: string, type: 'deposit' | 'withdrawal', amount: number, date: string, note?: string): Promise<unknown> {
  if (isElectron()) return ipc('assets:add-transaction', { accountId, type, amount, date, note })
  return httpPost(`/api/assets/accounts/${accountId}/transactions`, { type, amount, date, note })
}

export function updateTransaction(accountId: string, transactionId: string, type: 'deposit' | 'withdrawal', amount: number, date: string, note?: string): Promise<unknown> {
  if (isElectron()) return ipc('assets:update-transaction', { accountId, transactionId, type, amount, date, note })
  return httpPut(`/api/assets/accounts/${accountId}/transactions/${transactionId}`, { type, amount, date, note })
}

export function deleteTransaction(accountId: string, transactionId: string): Promise<unknown> {
  if (isElectron()) return ipc('assets:delete-transaction', { accountId, transactionId })
  return httpDelete(`/api/assets/accounts/${accountId}/transactions/${transactionId}`)
}

// ── Mortgages ─────────────────────────────────────────────────────────────────

export function getMortgages(): Promise<unknown> {
  if (isElectron()) return ipc('mortgages:get-all')
  return httpGet('/api/mortgages')
}

export function addMortgage(name: string, marketValue: number, principalBalance: number): Promise<unknown> {
  if (isElectron()) return ipc('mortgages:add', { name, marketValue, principalBalance })
  return httpPost('/api/mortgages', { name, marketValue, principalBalance })
}

export function updateMortgage(id: string, name: string, marketValue: number, principalBalance: number): Promise<unknown> {
  if (isElectron()) return ipc('mortgages:update', { id, name, marketValue, principalBalance })
  return httpPut(`/api/mortgages/${id}`, { name, marketValue, principalBalance })
}

export function deleteMortgage(id: string): Promise<unknown> {
  if (isElectron()) return ipc('mortgages:delete', id)
  return httpDelete(`/api/mortgages/${id}`)
}

// ── Mortgage Payments ────────────────────────────────────────────────────────

export function getMortgagePayments(mortgageId: string): Promise<unknown> {
  if (isElectron()) return ipc('mortgages:get-payments', mortgageId)
  return httpGet(`/api/mortgages/${mortgageId}/payments`)
}

export function addMortgagePayment(mortgageId: string, date: string, principal: number, interest: number, escrow: number, note?: string): Promise<unknown> {
  if (isElectron()) return ipc('mortgages:add-payment', { mortgageId, date, principal, interest, escrow, note })
  return httpPost(`/api/mortgages/${mortgageId}/payments`, { date, principal, interest, escrow, note })
}

export function updateMortgagePayment(mortgageId: string, paymentId: string, fields: { date?: string; principal?: number; interest?: number; escrow?: number; note?: string }): Promise<unknown> {
  if (isElectron()) return ipc('mortgages:update-payment', { mortgageId, paymentId, ...fields })
  return httpPut(`/api/mortgages/${mortgageId}/payments/${paymentId}`, fields)
}

export function deleteMortgagePayment(mortgageId: string, paymentId: string): Promise<unknown> {
  if (isElectron()) return ipc('mortgages:delete-payment', { mortgageId, paymentId })
  return httpDelete(`/api/mortgages/${mortgageId}/payments/${paymentId}`)
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export function getGoals(): Promise<unknown> {
  if (isElectron()) return ipc('goals:get-all')
  return httpGet('/api/goals')
}

export function addGoal(name: string): Promise<unknown> {
  if (isElectron()) return ipc('goals:add', name)
  return httpPost('/api/goals', { name })
}

export function deleteGoal(id: string): Promise<unknown> {
  if (isElectron()) return ipc('goals:delete', id)
  return httpDelete(`/api/goals/${id}`)
}

export function setGoalTarget(id: string, targetAmount: number | null, targetDate: string | null): Promise<unknown> {
  if (isElectron()) return ipc('goals:set-target', id, targetAmount, targetDate)
  return httpPut(`/api/goals/${id}/target`, { targetAmount, targetDate })
}

export function setGoalDividendRate(id: string, dividendRate: number | null): Promise<unknown> {
  if (isElectron()) return ipc('goals:set-dividend-rate', id, dividendRate)
  return httpPut(`/api/goals/${id}/dividend-rate`, { dividendRate })
}

export function setGoalStartingAmount(id: string, startingAmount: number | null): Promise<unknown> {
  if (isElectron()) return ipc('goals:set-starting-amount', id, startingAmount)
  return httpPut(`/api/goals/${id}/starting-amount`, { startingAmount })
}

export function addContribution(goalId: string, amount: number, date: string, note?: string): Promise<unknown> {
  if (isElectron()) return ipc('goals:add-contribution', goalId, amount, date, note)
  return httpPost(`/api/goals/${goalId}/contributions`, { amount, date, note })
}

export function deleteContribution(goalId: string, contributionId: string): Promise<unknown> {
  if (isElectron()) return ipc('goals:delete-contribution', goalId, contributionId)
  return httpDelete(`/api/goals/${goalId}/contributions/${contributionId}`)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Current signed-in user, or null (Electron mode, auth disabled, or not signed in). */
export async function getMe(): Promise<AuthUser | null> {
  if (isElectron()) return null
  try {
    const r = await fetch('/api/me')
    if (!r.ok) return null
    // Auth-disabled servers have no /api/me; the SPA fallback answers with HTML
    if (!(r.headers.get('content-type') ?? '').includes('application/json')) return null
    return (await r.json()) as AuthUser
  } catch {
    return null
  }
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' })
  window.location.href = '/auth/logged-out'
}
