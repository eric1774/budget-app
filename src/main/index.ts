import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { parseWorkbook } from './excel'
import type { ParseResponse, BudgetMap } from '../shared/types'
import { getStoredFilePath, setStoredFilePath, getBudgets, setBudget } from './store'
import { startWatcher, stopWatcher } from './watcher'
import { startServer, stopServer, getServerInfo, setLastSnapshot } from './server'
import {
  getAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from './assets-store'
import {
  getGoals,
  addGoal,
  updateGoal,
  deleteGoal,
  setGoalTarget,
  addContribution,
  updateContribution,
  deleteContribution,
} from './goals-store'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    const storedPath = getStoredFilePath()
    mainWindow!.webContents.send('stored-path', storedPath ?? null)
    mainWindow!.webContents.send('server-info', getServerInfo())
    if (storedPath) {
      startWatcher(storedPath, mainWindow!)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Placeholder IPC handler — confirms IPC bridge works end-to-end
ipcMain.handle('ping', () => 'pong')

// Parse Budget.xlsx file and return typed Transaction objects
ipcMain.handle('parse-file', async (_event, filePath: string): Promise<ParseResponse> => {
  const response = parseWorkbook(filePath)
  if (response.ok) setLastSnapshot(response)
  return response
})

// Return stored file path (or null if none)
ipcMain.handle('get-stored-path', () => getStoredFilePath() ?? null)

// Return full BudgetMap for all months
ipcMain.handle('get-budgets', (): BudgetMap => {
  return getBudgets()
})

// Set budget for a single category+month; amount=0 removes entry
// Args: { monthKey: string, category: string, amount: number }
ipcMain.handle('set-budget', (_event, args: { monthKey: string; category: string; amount: number }) => {
  setBudget(args.monthKey, args.category, args.amount)
})

// Open native file picker and return selected path (or null if cancelled)
ipcMain.handle('open-file-dialog', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  setStoredFilePath(filePath)
  startWatcher(filePath, mainWindow)
  return filePath
})

// IPC handler for renderer to request current server info
ipcMain.handle('get-server-info', () => getServerInfo())

// IPC handler to restart the server (for toolbar restart button)
ipcMain.handle('restart-server', async () => {
  await stopServer()
  const info = await startServer()
  mainWindow?.webContents.send('server-info', info)
  return info
})

// ── Asset Account IPC ──────────────────────────────────────────────────────

// Returns all AssetAccount objects (with nested transactions)
ipcMain.handle('assets:get-accounts', () => getAccounts())

// Creates a new account. Args: { name: string, type: AccountType }
// Returns: AssetAccount
ipcMain.handle('assets:add-account', (_event, args: { name: string; type: import('../shared/types').AccountType }) =>
  addAccount(args.name, args.type)
)

// Renames or changes type. Args: { id: string, name?: string, type?: AccountType }
// Returns: AssetAccount | null
ipcMain.handle('assets:update-account', (_event, args: { id: string; name?: string; type?: import('../shared/types').AccountType }) =>
  updateAccount(args.id, { name: args.name, type: args.type })
)

// Deletes account and all its transactions. Args: { id: string }
// Returns: boolean
ipcMain.handle('assets:delete-account', (_event, args: { id: string }) =>
  deleteAccount(args.id)
)

// Adds a transaction. Args: { accountId: string, type: 'deposit'|'withdrawal', amount: number, date: string, note?: string }
// Returns: Transaction | null
ipcMain.handle('assets:add-transaction', (_event, args: { accountId: string; type: 'deposit' | 'withdrawal'; amount: number; date: string; note?: string }) =>
  addTransaction(args.accountId, args.type, args.amount, args.date, args.note)
)

// Edits a transaction. Args: { accountId: string, transactionId: string, type?: ..., amount?: number, date?: string, note?: string }
// Returns: Transaction | null
ipcMain.handle('assets:update-transaction', (_event, args: { accountId: string; transactionId: string; type?: 'deposit' | 'withdrawal'; amount?: number; date?: string; note?: string }) =>
  updateTransaction(args.accountId, args.transactionId, { type: args.type, amount: args.amount, date: args.date, note: args.note })
)

// Deletes a transaction. Args: { accountId: string, transactionId: string }
// Returns: boolean
ipcMain.handle('assets:delete-transaction', (_event, args: { accountId: string; transactionId: string }) =>
  deleteTransaction(args.accountId, args.transactionId)
)

// ── Goal IPC ──────────────────────────────────────────────────────────────────

ipcMain.handle('goals:get-all', () => getGoals())
ipcMain.handle('goals:add', (_e, name: string) => addGoal(name))
ipcMain.handle('goals:update', (_e, id: string, fields: { name?: string }) => updateGoal(id, fields))
ipcMain.handle('goals:delete', (_e, id: string) => deleteGoal(id))
ipcMain.handle('goals:set-target', (_e, id: string, targetAmount: number | null, targetDate: string | null) => setGoalTarget(id, targetAmount, targetDate))
ipcMain.handle('goals:add-contribution', (_e, goalId: string, amount: number, date: string, note?: string) => addContribution(goalId, amount, date, note))
ipcMain.handle('goals:update-contribution', (_e, goalId: string, contributionId: string, fields: { amount?: number; date?: string; note?: string }) => updateContribution(goalId, contributionId, fields))
ipcMain.handle('goals:delete-contribution', (_e, goalId: string, contributionId: string) => deleteContribution(goalId, contributionId))

app.whenReady().then(async () => {
  await startServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopWatcher()
  stopServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
