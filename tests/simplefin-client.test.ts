import { describe, it, expect } from 'vitest'
import { claimSetupToken, splitAccessUrl, fetchAccounts, type FetchLike } from '../src/main/simplefin-client'

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; body: string }): FetchLike {
  return async (url, init) => {
    const r = handler(url, init)
    return new Response(r.body, { status: r.status })
  }
}

describe('claimSetupToken', () => {
  it('decodes the token, POSTs the claim URL, and returns the access URL', async () => {
    const claimUrl = 'https://bridge.example/simplefin/claim/DEMO'
    const token = Buffer.from(claimUrl).toString('base64')
    const calls: { url: string; method?: string }[] = []
    const f = stubFetch((url, init) => {
      calls.push({ url, method: init?.method })
      return { status: 200, body: 'https://user:pass@bridge.example/simplefin' }
    })
    const accessUrl = await claimSetupToken(token, f)
    expect(calls).toEqual([{ url: claimUrl, method: 'POST' }])
    expect(accessUrl).toBe('https://user:pass@bridge.example/simplefin')
  })

  it('rejects garbage tokens', async () => {
    await expect(claimSetupToken('!!!not-base64-url!!!', stubFetch(() => ({ status: 200, body: '' }))))
      .rejects.toThrow(/invalid setup token/i)
  })

  it('rejects when the bridge answers non-200', async () => {
    const token = Buffer.from('https://bridge.example/claim/X').toString('base64')
    await expect(claimSetupToken(token, stubFetch(() => ({ status: 403, body: 'nope' }))))
      .rejects.toThrow(/403/)
  })
})

describe('splitAccessUrl', () => {
  it('strips credentials into a Basic auth header', () => {
    const { url, auth } = splitAccessUrl('https://alice:s3cret@bridge.example/simplefin')
    expect(url).toBe('https://bridge.example/simplefin')
    expect(auth).toBe('Basic ' + Buffer.from('alice:s3cret').toString('base64'))
  })
})

describe('fetchAccounts', () => {
  const sfBody = JSON.stringify({
    errors: [],
    accounts: [{ id: 'ACT-1', name: 'Share Savings', balance: '5000.10', 'balance-date': 1752987600, org: { name: 'Navy Federal Credit Union' }, transactions: [] }],
  })

  it('GETs /accounts with start-date and auth header (no creds in URL)', async () => {
    const calls: { url: string; auth?: string }[] = []
    const f = stubFetch((url, init) => {
      calls.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization })
      return { status: 200, body: sfBody }
    })
    const res = await fetchAccounts('https://u:p@bridge.example/simplefin', new Date(1752900000 * 1000), f)
    expect(calls[0].url).toBe('https://bridge.example/simplefin/accounts?start-date=1752900000')
    expect(calls[0].auth).toBe('Basic ' + Buffer.from('u:p').toString('base64'))
    expect(res.accounts[0].id).toBe('ACT-1')
  })

  it('throws a reconnect-worded error on 403 (credential revoked)', async () => {
    await expect(fetchAccounts('https://u:p@b.example/simplefin', new Date(), stubFetch(() => ({ status: 403, body: '' }))))
      .rejects.toThrow(/revoked|reconnect/i)
  })
})
