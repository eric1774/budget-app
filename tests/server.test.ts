import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDataDir } from '../src/main/data-dir'
import { startServer, stopServer, setLastSnapshot } from '../src/main/server'
import { parseWorkbook } from '../src/main/excel'
import { writeFixtureWorkbook } from './helpers/fixture'

describe('headless server', () => {
  let baseUrl: string
  let dir: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'budget-server-test-'))
    initDataDir(dir)
    writeFileSync(join(dir, 'index.html'), '<html><body>ok</body></html>')
    const info = await startServer({ rendererRoot: dir, preferredPort: 3999 })
    baseUrl = `http://127.0.0.1:${info.port}`
  })

  afterAll(async () => {
    await stopServer()
  })

  it('serves /api/health without a snapshot', async () => {
    const r = await fetch(`${baseUrl}/api/health`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, hasSnapshot: false })
  })

  it('returns 503 from /api/snapshot before first parse', async () => {
    const r = await fetch(`${baseUrl}/api/snapshot`)
    expect(r.status).toBe(503)
  })

  it('serves the snapshot after a parse', async () => {
    const xlsx = join(dir, 'fixture.xlsx')
    writeFixtureWorkbook(xlsx)
    const parsed = parseWorkbook(xlsx)
    expect(parsed.ok).toBe(true)
    setLastSnapshot(parsed)
    const r = await fetch(`${baseUrl}/api/snapshot`)
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.result.transactions).toHaveLength(3)
    const health = await (await fetch(`${baseUrl}/api/health`)).json()
    expect(health.hasSnapshot).toBe(true)
  })

  it('serves static files with SPA fallback', async () => {
    const r = await fetch(`${baseUrl}/some/deep/route`)
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('ok')
  })
})
