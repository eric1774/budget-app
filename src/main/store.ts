import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

const STORE_PATH = join(app.getPath('userData'), 'settings.json')

interface Settings {
  lastFilePath?: string
}

function readSettings(): Settings {
  if (!existsSync(STORE_PATH)) return {}
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(settings: Settings): void {
  mkdirSync(join(app.getPath('userData')), { recursive: true })
  writeFileSync(STORE_PATH, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getStoredFilePath(): string | undefined {
  return readSettings().lastFilePath
}

export function setStoredFilePath(filePath: string): void {
  writeSettings({ ...readSettings(), lastFilePath: filePath })
}
