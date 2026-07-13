import { join } from 'path'

export interface ServerConfig {
  port: number
  dataDir: string
  xlsxPath: string
  rendererRoot: string
}

export function getConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const xlsxPath = env.BUDGET_XLSX_PATH
  if (!xlsxPath) {
    throw new Error('BUDGET_XLSX_PATH environment variable is required')
  }
  return {
    port: env.PORT ? parseInt(env.PORT, 10) : 3737,
    dataDir: env.APP_DATA_DIR ?? '/data/app',
    xlsxPath,
    rendererRoot: env.RENDERER_ROOT ?? join(__dirname, '../renderer'),
  }
}
