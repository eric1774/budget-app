import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { getDataDir } from './data-dir'
import type { AssetsData, AssetAccount, Transaction, AccountType } from '../shared/types'

function assetsPath(): string {
  return join(getDataDir(), 'assets.json')
}

function readAssets(): AssetsData {
  if (!existsSync(assetsPath())) return { accounts: [] }
  try {
    const data = JSON.parse(readFileSync(assetsPath(), 'utf-8')) as AssetsData
    // Migrate accounts from old snapshot model (no transactions array)
    let migrated = false
    for (const account of data.accounts) {
      if (!Array.isArray(account.transactions)) {
        account.transactions = []
        migrated = true
      }
      // Migrate default Red Baron account to have syncedWithDashboard flag
      if (account.syncedWithDashboard === undefined && account.name === 'Red Baron Checkings Account') {
        account.syncedWithDashboard = true
        migrated = true
      }
    }
    if (migrated) writeAssets(data)
    return data
  }
  catch { return { accounts: [] } }
}

function writeAssets(data: AssetsData): void {
  mkdirSync(getDataDir(), { recursive: true })
  writeFileSync(assetsPath(), JSON.stringify(data, null, 2), 'utf-8')
}

// Running sum of all transactions: deposits add, withdrawals subtract
function accountBalance(account: AssetAccount): number {
  return account.transactions.reduce((sum, t) => {
    return t.type === 'deposit' ? sum + t.amount : sum - t.amount
  }, 0)
}

// ── Account CRUD ────────────────────────────────────────────────────────────

export function getAccounts(): AssetAccount[] {
  const data = readAssets()
  // Seed default account on first run
  if (data.accounts.length === 0) {
    const defaultAccount: AssetAccount = {
      id: randomUUID(),
      name: 'Red Baron Checkings Account',
      type: 'Checkings',
      transactions: [],
      createdAt: new Date().toISOString(),
      syncedWithDashboard: true,
    }
    data.accounts.push(defaultAccount)
    writeAssets(data)
  }
  return data.accounts
}

export function addAccount(name: string, type: AccountType): AssetAccount {
  const data = readAssets()
  const account: AssetAccount = {
    id: randomUUID(),
    name: name.trim(),
    type,
    transactions: [],
    createdAt: new Date().toISOString(),
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

// ── Transaction CRUD ─────────────────────────────────────────────────────────

export function addTransaction(
  accountId: string,
  type: 'deposit' | 'withdrawal',
  amount: number,
  date: string,
  note?: string
): Transaction | null {
  const data = readAssets()
  const account = data.accounts.find(a => a.id === accountId)
  if (!account) return null
  const transaction: Transaction = {
    id: randomUUID(),
    type,
    amount,
    date,
    note,
  }
  account.transactions.push(transaction)
  writeAssets(data)
  return transaction
}

export function updateTransaction(
  accountId: string,
  transactionId: string,
  fields: { type?: 'deposit' | 'withdrawal'; amount?: number; date?: string; note?: string }
): Transaction | null {
  const data = readAssets()
  const account = data.accounts.find(a => a.id === accountId)
  if (!account) return null
  const transaction = account.transactions.find(t => t.id === transactionId)
  if (!transaction) return null
  if (fields.type !== undefined) transaction.type = fields.type
  if (fields.amount !== undefined) transaction.amount = fields.amount
  if (fields.date !== undefined) transaction.date = fields.date
  if (fields.note !== undefined) transaction.note = fields.note
  writeAssets(data)
  return transaction
}

export function deleteTransaction(accountId: string, transactionId: string): boolean {
  const data = readAssets()
  const account = data.accounts.find(a => a.id === accountId)
  if (!account) return false
  const before = account.transactions.length
  account.transactions = account.transactions.filter(t => t.id !== transactionId)
  if (account.transactions.length === before) return false
  writeAssets(data)
  return true
}

// Export helper for use in IPC or other modules
export { accountBalance }
