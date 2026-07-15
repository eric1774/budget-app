import { describe, it, expect, beforeEach } from 'vitest'
import { initDataDir, getDataDir, resetDataDir } from '../src/main/data-dir'

describe('data-dir', () => {
  beforeEach(() => resetDataDir())

  it('throws before initialization', () => {
    expect(() => getDataDir()).toThrow(/not initialized/)
  })

  it('returns the directory after init', () => {
    initDataDir('C:/tmp/test-data')
    expect(getDataDir()).toBe('C:/tmp/test-data')
  })
})
