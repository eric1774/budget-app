import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { startWatcher, stopWatcher } from '../src/main/watcher'
import { writeFixtureWorkbook } from './helpers/fixture'

describe('watcher', () => {
  afterEach(() => stopWatcher())

  it('notifies on file change with parsed payload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-watch-test-'))
    const xlsx = join(dir, 'fixture.xlsx')
    writeFixtureWorkbook(xlsx)

    const notify = vi.fn()
    startWatcher(xlsx, notify)
    // Give chokidar a moment to establish the watch, then touch the file
    await new Promise((r) => setTimeout(r, 500))
    writeFixtureWorkbook(xlsx)

    await vi.waitFor(
      () => {
        expect(notify).toHaveBeenCalledWith(
          'file-changed',
          expect.objectContaining({ ok: true })
        )
      },
      { timeout: 8000, interval: 100 }
    )
  }, 15000)

  it('watches a not-yet-existing file and fires on creation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-watch-add-'))
    const xlsx = join(dir, 'later.xlsx')

    const notify = vi.fn()
    startWatcher(xlsx, notify)
    await new Promise((r) => setTimeout(r, 500))
    writeFixtureWorkbook(xlsx)

    await vi.waitFor(
      () => {
        expect(notify).toHaveBeenCalledWith(
          'file-changed',
          expect.objectContaining({ ok: true })
        )
      },
      { timeout: 8000, interval: 100 }
    )
  }, 15000)
})
