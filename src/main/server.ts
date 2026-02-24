import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http'
import { readFile } from 'fs'
import { join, extname } from 'path'
import { networkInterfaces } from 'os'
import { createServer as createNetServer } from 'net'
import { WebSocketServer, WebSocket } from 'ws'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { ServerInfo, ParseResponse } from '../shared/types'

// --- LAN IP detection ---
function getLanIp(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] ?? []) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(iface.address)
      ) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

// --- Port availability ---
const DEFAULT_PORT = 3737
function findFreePort(start: number): Promise<number> {
  return new Promise((resolve) => {
    const srv = createNetServer()
    srv.listen(start, () => {
      srv.close(() => resolve(start))
    })
    srv.on('error', () => {
      resolve(findFreePort(start + 1))
    })
  })
}

// --- MIME types ---
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

// --- Server state ---
let httpServer: ReturnType<typeof createHttpServer> | null = null
let wss: WebSocketServer | null = null
let serverInfo: ServerInfo | null = null
let lastSnapshot: ParseResponse | null = null

// Store the latest parse result so /api/snapshot can return it to browser clients
export function setLastSnapshot(response: ParseResponse): void {
  lastSnapshot = response
}

export async function startServer(): Promise<ServerInfo> {
  if (httpServer) return serverInfo!
  const port = await findFreePort(DEFAULT_PORT)
  const ip = getLanIp()
  const rendererRoot = is.dev
    ? join(__dirname, '../renderer')
    : join(app.getAppPath(), 'out/renderer')

  httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    // Strip query strings; decode URI; prevent directory traversal
    let urlPath = (req.url ?? '/').split('?')[0]
    try { urlPath = decodeURIComponent(urlPath) } catch { urlPath = '/' }

    // REST endpoint: GET /api/snapshot — returns last good ParseResponse as JSON
    if (urlPath === '/api/snapshot') {
      if (lastSnapshot === null) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'No snapshot available yet' }))
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(lastSnapshot))
      }
      return
    }

    if (urlPath === '/') urlPath = '/index.html'
    const safePath = join(rendererRoot, urlPath.replace(/\.\./g, ''))
    const mime = MIME[extname(safePath).toLowerCase()] ?? 'application/octet-stream'
    readFile(safePath, (err, data) => {
      if (err) {
        // SPA fallback — serve index.html for any missing path
        readFile(join(rendererRoot, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return }
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(html)
        })
      } else {
        res.writeHead(200, { 'Content-Type': mime })
        res.end(data)
      }
    })
  })

  wss = new WebSocketServer({ server: httpServer })

  await new Promise<void>((resolve) => httpServer!.listen(port, '0.0.0.0', resolve))

  serverInfo = { url: `http://${ip}:${port}`, ip, port }
  return serverInfo
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    const wssDone = new Promise<void>((r) => {
      if (!wss) { r(); return }
      // Terminate all open connections so wss.close() callback fires immediately
      wss.clients.forEach((client) => client.terminate())
      wss.close(() => r())
    })
    const httpDone = new Promise<void>((r) => {
      if (!httpServer) { r(); return }
      // Destroy all keep-alive sockets so close() resolves immediately
      httpServer.closeAllConnections?.()
      httpServer.close(() => r())
    })
    wss = null; httpServer = null; serverInfo = null
    Promise.all([wssDone, httpDone]).then(() => resolve())
  })
}

export function getServerInfo(): ServerInfo | null {
  return serverInfo
}

// Broadcast JSON payload to all connected WS clients (readyState === OPEN)
export function broadcastDataUpdate(payload: unknown): void {
  if (!wss) return
  const msg = JSON.stringify(payload)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  })
}
