// Minimal SimpleFIN protocol client. https://www.simplefin.org/protocol.html
// Setup token = base64(claim URL); POST claim URL → access URL (plain text).
// Access URL embeds Basic credentials, which Node's fetch (undici) refuses in
// a URL — splitAccessUrl converts them to an Authorization header.

export interface SfAccount {
  id: string
  name: string
  balance: string            // decimal string per spec
  'balance-date': number     // unix seconds
  org: { name?: string; domain?: string }
  transactions?: unknown[]
}

export interface SfResponse {
  errors: string[]
  accounts: SfAccount[]
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export async function claimSetupToken(setupToken: string, fetchImpl: FetchLike = fetch): Promise<string> {
  let claimUrl: string
  try {
    claimUrl = Buffer.from(setupToken.trim(), 'base64').toString('utf-8')
  } catch {
    throw new Error('Invalid setup token')
  }
  if (!/^https:\/\/\S+$/.test(claimUrl)) throw new Error('Invalid setup token')
  const res = await fetchImpl(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' } })
  if (!res.ok) throw new Error(`Claim failed: HTTP ${res.status}`)
  const accessUrl = (await res.text()).trim()
  if (!/^https:\/\/\S+$/.test(accessUrl)) throw new Error('Bridge returned an invalid access URL')
  return accessUrl
}

export function splitAccessUrl(accessUrl: string): { url: string; auth: string } {
  const u = new URL(accessUrl)
  const auth = 'Basic ' + Buffer.from(
    `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
  ).toString('base64')
  u.username = ''
  u.password = ''
  return { url: u.toString().replace(/\/$/, ''), auth }
}

export async function fetchAccounts(accessUrl: string, startDate: Date, fetchImpl: FetchLike = fetch): Promise<SfResponse> {
  const { url, auth } = splitAccessUrl(accessUrl)
  const startTs = Math.floor(startDate.getTime() / 1000)
  const res = await fetchImpl(`${url}/accounts?start-date=${startTs}`, { headers: { Authorization: auth } })
  if (res.status === 403) throw new Error('Access revoked — reconnect from the Linked Accounts panel')
  if (!res.ok) throw new Error(`SimpleFIN request failed: HTTP ${res.status}`)
  return (await res.json()) as SfResponse
}
