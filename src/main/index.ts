import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { parseWorkbook } from './excel'
import type { ParseResponse } from '../shared/types'
import { getStoredFilePath, setStoredFilePath } from './store'
import { startWatcher, stopWatcher } from './watcher'

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
  return parseWorkbook(filePath)
})

// Return stored file path (or null if none)
ipcMain.handle('get-stored-path', () => getStoredFilePath() ?? null)

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

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopWatcher()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
