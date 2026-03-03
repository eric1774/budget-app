import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { AssetsData, AssetAccount, Transaction, AccountType } from '../shared/types'

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

// Running sum of all transactions: deposits add, withdrawals subtract
function accountBalance(account: AssetAccount): number {
  return account.transactions.reduce((sum, t) => {
    return t.type === 'deposit' ? sum + t.amount : sum - t.amount
  }, 0)
}

// ── Account CRUD ────────────────────────────────────────────────────────────

export function getAccounts(): AssetAccount[] {
  return readAssets().accounts
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
