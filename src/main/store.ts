import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { getDataDir } from './data-dir'
import type { BudgetMap } from '../shared/types'

function storePath(): string {
  return join(getDataDir(), 'settings.json')
}

interface Settings {
  lastFilePath?: string
  budgets?: BudgetMap
}

function readSettings(): Settings {
  if (!existsSync(storePath())) return {}
  try {
    return JSON.parse(readFileSync(storePath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(settings: Settings): void {
  mkdirSync(getDataDir(), { recursive: true })
  writeFileSync(storePath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export function getStoredFilePath(): string | undefined {
  return readSettings().lastFilePath
}

export function setStoredFilePath(filePath: string): void {
  writeSettings({ ...readSettings(), lastFilePath: filePath })
}

// Returns the full BudgetMap (all months) or empty object if none stored
export function getBudgets(): BudgetMap {
  return readSettings().budgets ?? {}
}

// Sets budget amount for a single category in a single month.
// monthKey format: "YYYY-MM"
// amount of 0 removes the entry for that category in that month.
export function setBudget(monthKey: string, category: string, amount: number): void {
  const settings = readSettings()
  const budgets: BudgetMap = settings.budgets ?? {}
  if (!budgets[monthKey]) budgets[monthKey] = {}
  if (amount === 0) {
    delete budgets[monthKey][category]
    // Clean up empty month entries
    if (Object.keys(budgets[monthKey]).length === 0) {
      delete budgets[monthKey]
    }
  } else {
    budgets[monthKey][category] = amount
  }
  writeSettings({ ...settings, budgets })
}
