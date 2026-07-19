// WsState represents the connection lifecycle visible to the UI
export type WsState = 'connecting' | 'connected' | 'reconnecting' | 'failed'

export interface WsClientOptions {
  // Called when a message arrives; payload is already JSON-parsed
  onMessage: (payload: unknown) => void
  // Called when connection state changes
  onStateChange: (state: WsState) => void
  // Called when the server closes the socket with 4401 (no/expired session).
  // Retrying can never succeed without re-auth, so the client stops for good.
  onAuthRejected?: () => void
}

export class WsClient {
  private ws: WebSocket | null = null
  private destroyed = false
  private retryCount = 0
  // Backoff: 1s, 2s, 4s, 8s, 16s, max 30s
  private readonly BASE_DELAY_MS = 1000
  private readonly MAX_DELAY_MS = 30000
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly url: string,
    private readonly options: WsClientOptions
  ) {
    this.connect()
  }

  private connect(): void {
    if (this.destroyed) return
    this.options.onStateChange(this.retryCount === 0 ? 'connecting' : 'reconnecting')
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onopen = () => {
      if (this.destroyed) { ws.close(); return }
      this.retryCount = 0
      this.options.onStateChange('connected')
    }

    ws.onmessage = (event) => {
      if (this.destroyed) return
      try {
        const payload = JSON.parse(event.data as string)
        this.options.onMessage(payload)
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = (event) => {
      if (this.destroyed) return
      if (event.code === 4401) {
        this.destroyed = true
        this.options.onAuthRejected?.()
        return
      }
      this.scheduleReconnect()
    }

    ws.onerror = () => {
      // onclose fires after onerror — no extra action needed
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return
    this.retryCount++
    const delay = Math.min(
      this.BASE_DELAY_MS * Math.pow(2, this.retryCount - 1),
      this.MAX_DELAY_MS
    )
    this.options.onStateChange('reconnecting')
    this.retryTimer = setTimeout(() => this.connect(), delay)
  }

  destroy(): void {
    this.destroyed = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.ws) {
      this.ws.onclose = null  // Prevent reconnect on intentional close
      this.ws.close()
      this.ws = null
    }
  }
}

// Build the WebSocket URL from the current page's host.
// The browser loads the app from http://192.168.x.x:3737
// The WS server is co-hosted on the same port: ws://192.168.x.x:3737
export function buildWsUrl(): string {
  const loc = window.location
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${loc.host}`
}
