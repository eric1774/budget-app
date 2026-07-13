import { join } from 'path'

export interface ServerConfig {
  port: number
  dataDir: string
  xlsxPath: string
  rendererRoot: string
}

function parsePort(rawPort: string): number {
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer')
  }
  return port
}

export function getConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const xlsxPath = env.BUDGET_XLSX_PATH
  if (!xlsxPath) {
    throw new Error('BUDGET_XLSX_PATH environment variable is required')
  }
  return {
    port: env.PORT ? parsePort(env.PORT) : 3737,
    dataDir: env.APP_DATA_DIR ?? '/data/app',
    xlsxPath,
    rendererRoot: env.RENDERER_ROOT ?? join(__dirname, '../renderer'),
  }
}
