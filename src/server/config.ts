import { join } from 'path'

export interface AuthEnvConfig {
  appBaseUrl: string
  issuer: string
  clientId: string
  clientSecret: string
  adminGroup: string
  sessionTtlHours: number
}

export interface ServerConfig {
  port: number
  dataDir: string
  xlsxPath: string
  rendererRoot: string
  auth: AuthEnvConfig | null
}

function parsePort(rawPort: string): number {
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer')
  }
  return port
}

function getAuthConfig(env: NodeJS.ProcessEnv): AuthEnvConfig | null {
  if (env.AUTH_DISABLED === '1') return null
  const { APP_BASE_URL, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = env
  if (!APP_BASE_URL || !OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) {
    throw new Error(
      'Auth is enabled by default and requires APP_BASE_URL, OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET. ' +
        'Set AUTH_DISABLED=1 to run without authentication (local development only).'
    )
  }
  const ttl = env.SESSION_TTL_HOURS ? Number(env.SESSION_TTL_HOURS) : 12
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error('SESSION_TTL_HOURS must be a positive number')
  }
  return {
    appBaseUrl: APP_BASE_URL.replace(/\/+$/, ''),
    issuer: OIDC_ISSUER.replace(/\/+$/, ''),
    clientId: OIDC_CLIENT_ID,
    clientSecret: OIDC_CLIENT_SECRET,
    adminGroup: env.ADMIN_GROUP ?? 'budget-admin',
    sessionTtlHours: ttl,
  }
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
    auth: getAuthConfig(env),
  }
}
