import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs'
import { getDataDir } from './data-dir'
import type { SimplefinData } from '../shared/types'

function simplefinPath(): string {
  return join(getDataDir(), 'simplefin.json')
}

function rawLogPath(): string {
  return join(getDataDir(), 'simplefin-raw.jsonl')
}

const DEFAULTS: SimplefinData = {
  accessUrl: null,
  connectedAt: null,
  lastSyncAt: null,
  lastSyncError: null,
  lastScheduledSlot: null,
  errors: [],
  ignoredAccountIds: [],
  discovered: [],
}

export function getSimplefinData(): SimplefinData {
  if (!existsSync(simplefinPath())) {
    return {
      ...DEFAULTS,
      errors: [],
      ignoredAccountIds: [],
      discovered: [],
    }
  }
  try {
    return {
      ...DEFAULTS,
      errors: [],
      ignoredAccountIds: [],
      discovered: [],
      ...(JSON.parse(readFileSync(simplefinPath(), 'utf-8')) as Partial<SimplefinData>)
    }
  } catch {
    return {
      ...DEFAULTS,
      errors: [],
      ignoredAccountIds: [],
      discovered: [],
    }
  }
}

export function updateSimplefinData(patch: Partial<SimplefinData>): SimplefinData {
  const next = { ...getSimplefinData(), ...patch }
  mkdirSync(getDataDir(), { recursive: true })
  writeFileSync(simplefinPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

// Raw bridge responses are kept append-only so a future transactions feature
// can backfill from history (spec §2). Twice-daily syncs ≈ 730 lines/year.
export function appendRawSync(raw: unknown): void {
  mkdirSync(getDataDir(), { recursive: true })
  appendFileSync(rawLogPath(), JSON.stringify({ at: new Date().toISOString(), raw }) + '\n', 'utf-8')
}
