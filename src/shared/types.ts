export interface Transaction {
  date: Date           // parsed from Excel date serial or string
  description: string
  category: string
  income: number       // 0 if blank
  debit: number        // 0 if blank
  balance: number
  rowIndex: number     // 1-based Excel row number for debugging
}

export interface ParseResult {
  transactions: Transaction[]
  categories: string[]          // unique, sorted alphabetically
  skippedRows: number           // count of rows skipped due to bad data
  skippedReason?: string        // summary of skip reasons (for banner)
}

export type ParseError =
  | { kind: 'wrong-file-type'; message: string }
  | { kind: 'missing-sheet'; message: string }
  | { kind: 'missing-columns'; missing: string[]; message: string }
  | { kind: 'read-error'; message: string }

export type ParseResponse =
  | { ok: true; result: ParseResult }
  | { ok: false; error: ParseError }

// Budget configuration types
// Key format: "YYYY-MM" (e.g. "2026-02")
export type MonthKey = string

// Map of category name -> planned monthly amount (in dollars)
export type CategoryBudgets = Record<string, number>

// Top-level budget store: monthKey -> CategoryBudgets
export type BudgetMap = Record<MonthKey, CategoryBudgets>

// Server info for LAN access
export interface ServerInfo {
  url: string   // e.g. "http://192.168.1.42:3737"
  ip: string    // e.g. "192.168.1.42"
  port: number  // actual port in use (3737 or next free)
}

// ── Asset Accounts ─────────────────────────────────────────────────────────

export type AccountType = 'Checkings' | 'Savings' | 'Retirement' | 'Hard Asset' | 'Investing' | 'Goal'

export interface AssetTransaction {
  id: string                        // UUID v4
  type: 'deposit' | 'withdrawal'
  amount: number                    // always positive
  date: string                      // ISO date "YYYY-MM-DD"
  note?: string
}

export interface AssetAccount {
  id: string          // UUID v4
  name: string        // display name, e.g. "TFSA"
  type: AccountType
  transactions: AssetTransaction[]
  createdAt: string   // ISO datetime string
  syncedWithDashboard?: boolean  // if true, balance is sourced from dashboard
  simplefin?: SimplefinLink      // present = balance is sourced from SimpleFIN
  syncedBalance?: number         // last synced balance (source of truth when linked)
  snapshots?: BalanceSnapshot[]  // daily balance history, accrues from link date
  needsAttention?: boolean       // institution connection broken at the bridge
}

// Root structure written to assets.json
export interface AssetsData {
  accounts: AssetAccount[]
}

// ── Mortgage Tracking ─────────────────────────────────────────────────────────

export interface MortgagePayment {
  id: string
  date: string        // ISO "YYYY-MM-DD"
  principal: number
  interest: number
  escrow: number
  note?: string
  createdAt: string
}

export interface Mortgage {
  id: string              // UUID v4
  name: string            // e.g. "Primary Home"
  marketValue: number     // current home market value
  principalBalance: number // remaining mortgage principal (liability)
  payments: MortgagePayment[]
  createdAt: string       // ISO datetime string
}

export interface MortgagesData {
  mortgages: Mortgage[]
}

// ── Goal Tracking ────────────────────────────────────────────────────────────

export interface GoalContribution {
  id: string          // UUID v4
  amount: number      // positive = deposit, negative = withdrawal
  date: string        // ISO date "YYYY-MM-DD"
  note?: string
}

export interface Goal {
  id: string                    // UUID v4
  name: string
  targetAmount?: number         // optional — goal can exist without a target
  targetDate?: string           // optional — ISO date "YYYY-MM-DD"
  startingAmount?: number       // initial balance before any contributions (excluded from stats)
  dividendRate?: number         // annual dividend/interest rate as a percentage (e.g. 4.5 = 4.5%)
  contributions: GoalContribution[]
  createdAt: string             // ISO datetime string
}

// Root structure written to goals.json
export interface GoalsData {
  goals: Goal[]
}

// ── SimpleFIN (live balances) ────────────────────────────────────────────────

export interface BalanceSnapshot {
  date: string      // ISO "YYYY-MM-DD" local date — one per day, later syncs overwrite
  balance: number
}

export interface SimplefinLink {
  accountId: string   // SimpleFIN's opaque stable account id
  org: string         // institution display name, e.g. "Navy Federal Credit Union"
}

export interface DiscoveredAccount {
  id: string
  org: string
  name: string
  balance: number
  balanceDate: string   // ISO datetime
}

// Root structure written to simplefin.json — server-side only.
// accessUrl is the credential; it must NEVER be sent to the client.
export interface SimplefinData {
  accessUrl: string | null
  connectedAt: string | null
  lastSyncAt: string | null          // last successful sync, ISO datetime
  lastSyncError: string | null
  lastScheduledSlot: string | null   // e.g. "2026-07-20-am"
  errors: string[]                   // latest errors[] from the bridge
  ignoredAccountIds: string[]
  discovered: DiscoveredAccount[]
}

export type SimplefinMapState = 'linked' | 'ignored' | 'new'

// Client-facing status DTO (no accessUrl!)
export interface SimplefinStatus {
  connected: boolean
  lastSyncAt: string | null
  lastSyncError: string | null
  errors: string[]
  isAdmin: boolean
  discovered: (DiscoveredAccount & { state: SimplefinMapState; linkedAccountId?: string })[]
}

export type SimplefinMapAction =
  | { simplefinAccountId: string; action: 'attach'; accountId: string }
  | { simplefinAccountId: string; action: 'create'; name: string; type: AccountType }
  | { simplefinAccountId: string; action: 'ignore' }

// ── Auth (Phase 2) ────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'member'

export interface AuthUser {
  sub: string
  name: string
  email: string
  role: UserRole
}
