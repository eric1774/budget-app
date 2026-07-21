import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import { getSimplefinData, updateSimplefinData, appendRawSync } from '../src/main/simplefin-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sf-store-test-'))
  initDataDir(dir)
})

describe('simplefin-store', () => {
  it('returns empty defaults when simplefin.json does not exist', () => {
    const data = getSimplefinData()
    expect(data.accessUrl).toBeNull()
    expect(data.discovered).toEqual([])
    expect(data.ignoredAccountIds).toEqual([])
  })

  it('persists a partial update and merges with existing data', () => {
    updateSimplefinData({ accessUrl: 'https://u:p@bridge.example/simplefin', connectedAt: '2026-07-20T12:00:00Z' })
    updateSimplefinData({ lastSyncAt: '2026-07-20T13:00:00Z' })
    const data = getSimplefinData()
    expect(data.accessUrl).toBe('https://u:p@bridge.example/simplefin')
    expect(data.lastSyncAt).toBe('2026-07-20T13:00:00Z')
  })

  it('appends raw sync responses as JSONL lines', () => {
    appendRawSync({ errors: [], accounts: [{ id: 'a1' }] })
    appendRawSync({ errors: [], accounts: [{ id: 'a2' }] })
    const raw = readFileSync(join(dir, 'simplefin-raw.jsonl'), 'utf-8').trim().split('\n')
    expect(raw).toHaveLength(2)
    expect(JSON.parse(raw[1]).raw.accounts[0].id).toBe('a2')
  })

  it('recovers from a corrupt simplefin.json with defaults', () => {
    updateSimplefinData({ connectedAt: 'x' })
    const path = join(dir, 'simplefin.json')
    expect(existsSync(path)).toBe(true)
    writeFileSync(path, '{not json', 'utf-8')
    expect(getSimplefinData().accessUrl).toBeNull()
  })
})
