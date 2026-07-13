import chokidar, { FSWatcher } from 'chokidar'
import { parseWorkbook } from './excel'
import type { ParseResponse } from '../shared/types'
import { broadcastDataUpdate, setLastSnapshot } from './server'

// Channel-style callback so the Electron entry can forward to webContents.send
// and the headless entry can omit it (WS broadcast covers browser clients).
export type WatcherNotify = (channel: string, payload: unknown) => void

let watcher: FSWatcher | null = null
let retryTimeout: ReturnType<typeof setTimeout> | null = null
const MAX_RETRIES = 5
const RETRY_INTERVAL_MS = 800
const DEBOUNCE_MS = 200

export function startWatcher(filePath: string, notify: WatcherNotify = () => {}): void {
  stopWatcher()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  watcher = chokidar.watch(filePath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 100 },
  })

  const onFsEvent = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null }
    debounceTimer = setTimeout(() => handleFileChange(filePath, notify, 0), DEBOUNCE_MS)
  }
  watcher.on('change', onFsEvent)
  // The OneDrive mirror may create the file after boot (or replace via temp+rename)
  watcher.on('add', onFsEvent)
}

export function stopWatcher(): void {
  if (watcher) { watcher.close(); watcher = null }
  if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null }
}

function handleFileChange(filePath: string, notify: WatcherNotify, retryCount: number): void {
  const response: ParseResponse = parseWorkbook(filePath)
  if (response.ok) {
    const payload = { ok: true, result: response.result }
    setLastSnapshot(response)
    notify('file-changed', payload)
    broadcastDataUpdate({ type: 'file-changed', ...payload })
  } else if (response.error.kind === 'read-error' && retryCount < MAX_RETRIES) {
    // File may be locked by Excel or mid-download — retry silently
    retryTimeout = setTimeout(
      () => handleFileChange(filePath, notify, retryCount + 1),
      RETRY_INTERVAL_MS
    )
    if (retryCount === 0) {
      const lockPayload = { retriesRemaining: MAX_RETRIES - retryCount }
      notify('file-locked', lockPayload)
      broadcastDataUpdate({ type: 'file-locked', ...lockPayload })
    }
  } else if (response.error.kind === 'read-error' && retryCount >= MAX_RETRIES) {
    const persistentPayload = { error: response.error.message }
    notify('file-locked-persistent', persistentPayload)
    broadcastDataUpdate({ type: 'file-locked-persistent', ...persistentPayload })
  } else {
    const errorPayload = { ok: false, error: response.error }
    notify('file-changed', errorPayload)
    broadcastDataUpdate({ type: 'file-changed', ...errorPayload })
  }
}
