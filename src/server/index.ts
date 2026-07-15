import { existsSync } from 'fs'
import { initDataDir } from '../main/data-dir'
import { parseWorkbook } from '../main/excel'
import { startServer, stopServer, setLastSnapshot } from '../main/server'
import { startWatcher, stopWatcher } from '../main/watcher'
import { getConfig } from './config'
import { openDb, closeDb } from './db'
import { initAuth, type AuthRuntime } from './auth/runtime'
import { sweepExpiredSessions } from './auth/session-store'

async function main(): Promise<void> {
  const config = getConfig(process.env)
  initDataDir(config.dataDir)
  openDb(config.dataDir)

  let auth: AuthRuntime | null = null
  if (config.auth) {
    auth = initAuth(config.auth)
    console.log(
      `Auth enabled — OIDC issuer ${config.auth.issuer}, admin group "${config.auth.adminGroup}", sessions ${config.auth.sessionTtlHours}h`
    )
    const swept = sweepExpiredSessions()
    if (swept > 0) console.log(`Swept ${swept} expired session(s)`)
    setInterval(() => sweepExpiredSessions(), 60 * 60 * 1000).unref()
  } else {
    console.warn('AUTH DISABLED — every request is anonymous. Local development only; never deploy this mode.')
  }

  if (existsSync(config.xlsxPath)) {
    const response = parseWorkbook(config.xlsxPath)
    if (response.ok) {
      setLastSnapshot(response)
      console.log(`Parsed ${response.result.transactions.length} transactions from ${config.xlsxPath}`)
    } else {
      console.warn(`Workbook parse failed at boot: ${response.error.message}`)
    }
  } else {
    console.warn(`Workbook not found yet at ${config.xlsxPath} — waiting for OneDrive mirror`)
  }

  startWatcher(config.xlsxPath, undefined, { usePolling: true })
  const info = await startServer({ rendererRoot: config.rendererRoot, preferredPort: config.port, auth })
  console.log(`budget-app listening on ${info.url}`)

  const shutdown = (): void => {
    console.log('Shutting down...')
    stopWatcher()
    stopServer().then(() => {
      closeDb()
      process.exit(0)
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
