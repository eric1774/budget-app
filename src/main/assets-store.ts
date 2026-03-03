import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { AssetsData, AssetAccount, BalanceSnapshot, AccountType } from '../shared/types'

const ASSETS_PATH = join(app.getPath('userData'), 'assets.json')

function readAssets(): AssetsData {
  if (!existsSync(ASSETS_PATH)) return { accounts: [] }
  try { return JSON.parse(readFileSync(ASSETS_PATH, 'utf-8')) }
  catch { return { accounts: [] } }
}

function writeAssets(data: AssetsData): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(ASSETS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

// ── Account CRUD ────────────────────────────────────────────────────────────

export function getAccounts(): AssetAccount[] {
  return readAssets().accounts
}

export function addAccount(name: string, type: AccountType): AssetAccount {
  const data = readAssets()
  const now = new Date().toISOString()
  const account: AssetAccount = {
    id: randomUUID(),
    name: name.trim(),
    type,
    snapshots: [],
    createdAt: now,
    updatedAt: now,
  }
  data.accounts.push(account)
  writeAssets(data)
  return account
}

export function updateAccount(id: string, fields: { name?: string; type?: AccountType }): AssetAccount | null {
  const data = readAssets()
  const account = data.accounts.find(a => a.id === id)
  if (!account) return null
  if (fields.name !== undefined) account.name = fields.name.trim()
  if (fields.type !== undefined) account.type = fields.type
  account.updatedAt = new Date().toISOString()
  writeAssets(data)
  return account
}

export function deleteAccount(id: string): boolean {
  const data = readAssets()
  const before = data.accounts.length
  data.accounts = data.accounts.filter(a => a.id !== id)
  if (data.accounts.length === before) return false
  writeAssets(data)
  return true
}

// ── Snapshot CRUD ────────────────────────────────────────────────────────────

export function addSnapshot(
  accountId: string,
  fields: { amount: number; date: string; note?: string }
): BalanceSnapshot | null {
  const data = readAssets()
  const account = data.accounts.find(a => a.id === accountId)
  if (!account) return null
  const now = new Date().toISOString()
  const snapshot: BalanceSnapshot = {
    id: randomUUID(),
    accountId,
    amount: fields.amount,
    date: fields.date,
    note: fields.note,
    createdAt: now,
    updatedAt: now,
  }
  account.snapshots.push(snapshot)
  account.updatedAt = now
  writeAssets(data)
  return snapshot
}

export function updateSnapshot(
  accountId: string,
  snapshotId: string,
  fields: { amount?: number; date?: string; note?: string }
): BalanceSnapshot | null {
  const data = readAssets()
  const account = data.accounts.find(a => a.id === accountId)
  if (!account) return null
  const snapshot = account.snapshots.find(s => s.id === snapshotId)
  if (!snapshot) return null
  if (fields.amount !== undefined) snapshot.amount = fields.amount
  if (fields.date !== undefined) snapshot.date = fields.date
  if (fields.note !== undefined) snapshot.note = fields.note
  const now = new Date().toISOString()
  snapshot.updatedAt = now
  account.updatedAt = now
  writeAssets(data)
  return snapshot
}

export function deleteSnapshot(accountId: string, snapshotId: string): boolean {
  const data = readAssets()
  const account = data.accounts.find(a => a.id === accountId)
  if (!account) return false
  const before = account.snapshots.length
  account.snapshots = account.snapshots.filter(s => s.id !== snapshotId)
  if (account.snapshots.length === before) return false
  account.updatedAt = new Date().toISOString()
  writeAssets(data)
  return true
}
