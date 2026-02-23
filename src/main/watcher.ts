import chokidar, { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { parseWorkbook } from './excel'
import type { ParseResponse } from '../shared/types'
import { broadcastDataUpdate } from './server'

let watcher: FSWatcher | null = null
let retryTimeout: ReturnType<typeof setTimeout> | null = null
const MAX_RETRIES = 5
const RETRY_INTERVAL_MS = 800
const DEBOUNCE_MS = 200

export function startWatcher(filePath: string, win: BrowserWindow): void {
  stopWatcher()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  watcher = chokidar.watch(filePath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 100 },
  })

  watcher.on('change', () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => handleFileChange(filePath, win, 0), DEBOUNCE_MS)
  })
}

export function stopWatcher(): void {
  if (watcher) { watcher.close(); watcher = null }
  if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null }
}

function handleFileChange(filePath: string, win: BrowserWindow, retryCount: number): void {
  const response: ParseResponse = parseWorkbook(filePath)
  if (response.ok) {
    const payload = { ok: true, result: response.result }
    win.webContents.send('file-changed', payload)
    broadcastDataUpdate({ type: 'file-changed', ...payload })
  } else if (response.error.kind === 'read-error' && retryCount < MAX_RETRIES) {
    // File may be locked by Excel — retry silently
    retryTimeout = setTimeout(
      () => handleFileChange(filePath, win, retryCount + 1),
      RETRY_INTERVAL_MS
    )
    if (retryCount === 0) {
      // Only send locked warning on first retry attempt
      win.webContents.send('file-locked', { retriesRemaining: MAX_RETRIES - retryCount })
    }
  } else if (response.error.kind === 'read-error' && retryCount >= MAX_RETRIES) {
    // Exhausted retries — tell renderer to show persistent locked warning
    win.webContents.send('file-locked-persistent', { error: response.error.message })
  } else {
    // Structural error (missing sheet, columns) — send as normal error
    win.webContents.send('file-changed', { ok: false, error: response.error })
    broadcastDataUpdate({ type: 'file-changed', ok: false, error: response.error })
  }
}
