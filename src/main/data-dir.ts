// Injectable data directory so stores work in both Electron (userData)
// and headless server mode (env-configured path) without importing electron.
let dataDir: string | null = null

export function initDataDir(dir: string): void {
  dataDir = dir
}

export function getDataDir(): string {
  if (!dataDir) {
    throw new Error('Data directory not initialized — call initDataDir() first')
  }
  return dataDir
}

// Test-only: clears module state so init-order tests are deterministic.
export function resetDataDir(): void {
  dataDir = null
}
