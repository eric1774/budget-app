import { existsSync } from 'fs'
import { initDataDir } from '../main/data-dir'
import { parseWorkbook } from '../main/excel'
import { startServer, stopServer, setLastSnapshot } from '../main/server'
import { startWatcher, stopWatcher } from '../main/watcher'
import { getConfig } from './config'

async function main(): Promise<void> {
  const config = getConfig(process.env)
  initDataDir(config.dataDir)

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

  startWatcher(config.xlsxPath)
  const info = await startServer({ rendererRoot: config.rendererRoot, preferredPort: config.port })
  console.log(`budget-app listening on ${info.url}`)

  const shutdown = (): void => {
    console.log('Shutting down...')
    stopWatcher()
    stopServer().then(() => process.exit(0))
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
