import { join } from 'path'
import { mkdirSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'

let db: DatabaseSync | null = null

// Phase 2: sessions. Later phases add proposals / audit_log / chat tables here.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  sub TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
`

export function openDb(dataDir: string): DatabaseSync {
  if (db) return db
  mkdirSync(dataDir, { recursive: true })
  db = new DatabaseSync(join(dataDir, 'budget-app.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database not opened — call openDb(dataDir) first')
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
