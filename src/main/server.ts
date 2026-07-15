import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http'
import { readFile } from 'fs'
import { join, extname } from 'path'
import { networkInterfaces } from 'os'
import { createServer as createNetServer } from 'net'
import { WebSocketServer, WebSocket } from 'ws'
import type { ServerInfo, ParseResponse } from '../shared/types'
import type { AuthRuntime } from '../server/auth/runtime'
import { getBudgets, setBudget } from './store'
import {
  getAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from './assets-store'
import {
  getGoals,
  addGoal,
  deleteGoal,
  setGoalTarget,
  setGoalDividendRate,
  setGoalStartingAmount,
  addContribution,
  deleteContribution,
} from './goals-store'
import {
  getMortgages,
  addMortgage,
  updateMortgage,
  deleteMortgage,
  getMortgagePayments,
  addMortgagePayment,
  updateMortgagePayment,
  deleteMortgagePayment,
} from './mortgage-store'

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
  '.webmanifest': 'application/manifest+json',
}

// --- Body reader helper ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readBody(req: IncomingMessage, res: ServerResponse, cb: (body: any) => void): void {
  let raw = ''
  req.on('data', (chunk) => { raw += chunk.toString() })
  req.on('end', () => {
    try {
      cb(JSON.parse(raw))
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON' }))
    }
  })
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

export interface StartServerOptions {
  rendererRoot: string
  preferredPort?: number
  auth?: AuthRuntime | null
}

export async function startServer(opts: StartServerOptions): Promise<ServerInfo> {
  if (httpServer) return serverInfo!
  const port = await findFreePort(opts.preferredPort ?? DEFAULT_PORT)
  const ip = getLanIp()
  const rendererRoot = opts.rendererRoot

  const appOrigin = opts.auth ? new URL(opts.auth.env.appBaseUrl).origin : null

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Strip query strings; decode URI; prevent directory traversal
    let urlPath = (req.url ?? '/').split('?')[0]
    try { urlPath = decodeURIComponent(urlPath) } catch { urlPath = '/' }

    // ── Auth gate (web mode only; Electron passes no auth runtime) ──────────
    if (opts.auth) {
      if (await opts.auth.handleRequest(req, res)) return
      if (urlPath !== '/api/health') {
        const session = opts.auth.getSessionUser(req)
        if (!session) {
          if (urlPath.startsWith('/api/')) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Not signed in' }))
          } else {
            res.writeHead(302, { Location: '/auth/login' })
            res.end()
          }
          return
        }
        // CSRF backstop: cookies are SameSite=Lax, but reject any cross-origin mutation outright
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const origin = req.headers.origin
          if (origin && origin !== appOrigin) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Cross-origin request rejected' }))
            return
          }
        }
      }
    }

    // REST endpoint: GET /api/health — liveness + snapshot readiness
    if (urlPath === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, hasSnapshot: lastSnapshot !== null }))
      return
    }

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

    // REST endpoint: GET /api/budgets — returns full BudgetMap
    if (urlPath === '/api/budgets' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(getBudgets()))
      return
    }

    // REST endpoint: PUT /api/budgets — updates a single budget entry
    if (urlPath === '/api/budgets' && req.method === 'PUT') {
      let body = ''
      req.on('data', (chunk) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const { monthKey, category, amount } = JSON.parse(body)
          setBudget(monthKey, category, amount)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid request' }))
        }
      })
      return
    }

    // ── Assets REST API ───────────────────────────────────────────────────────

    // GET /api/assets/accounts
    if (urlPath === '/api/assets/accounts' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(getAccounts()))
      return
    }

    // POST /api/assets/accounts
    if (urlPath === '/api/assets/accounts' && req.method === 'POST') {
      readBody(req, res, (body) => {
        const result = addAccount(body.name, body.type)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // PUT /api/assets/accounts/:id
    const accountMatch = urlPath.match(/^\/api\/assets\/accounts\/([^/]+)$/)
    if (accountMatch && req.method === 'PUT') {
      const id = accountMatch[1]
      readBody(req, res, (body) => {
        const result = updateAccount(id, { name: body.name, type: body.type })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // DELETE /api/assets/accounts/:id
    if (accountMatch && req.method === 'DELETE') {
      const id = accountMatch[1]
      const result = deleteAccount(id)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // POST /api/assets/accounts/:accountId/transactions
    const txBaseMatch = urlPath.match(/^\/api\/assets\/accounts\/([^/]+)\/transactions$/)
    if (txBaseMatch && req.method === 'POST') {
      const accountId = txBaseMatch[1]
      readBody(req, res, (body) => {
        const result = addTransaction(accountId, body.type, body.amount, body.date, body.note)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // PUT /api/assets/accounts/:accountId/transactions/:transactionId
    const txMatch = urlPath.match(/^\/api\/assets\/accounts\/([^/]+)\/transactions\/([^/]+)$/)
    if (txMatch && req.method === 'PUT') {
      const [, accountId, transactionId] = txMatch
      readBody(req, res, (body) => {
        const result = updateTransaction(accountId, transactionId, { type: body.type, amount: body.amount, date: body.date, note: body.note })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // DELETE /api/assets/accounts/:accountId/transactions/:transactionId
    if (txMatch && req.method === 'DELETE') {
      const [, accountId, transactionId] = txMatch
      const result = deleteTransaction(accountId, transactionId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // ── Goals REST API ────────────────────────────────────────────────────────

    // GET /api/goals
    if (urlPath === '/api/goals' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(getGoals()))
      return
    }

    // POST /api/goals
    if (urlPath === '/api/goals' && req.method === 'POST') {
      readBody(req, res, (body) => {
        const result = addGoal(body.name)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // DELETE /api/goals/:id
    const goalMatch = urlPath.match(/^\/api\/goals\/([^/]+)$/)
    if (goalMatch && req.method === 'DELETE') {
      const id = goalMatch[1]
      const result = deleteGoal(id)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // PUT /api/goals/:id/target
    const goalTargetMatch = urlPath.match(/^\/api\/goals\/([^/]+)\/target$/)
    if (goalTargetMatch && req.method === 'PUT') {
      const id = goalTargetMatch[1]
      readBody(req, res, (body) => {
        const result = setGoalTarget(id, body.targetAmount, body.targetDate)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // PUT /api/goals/:id/dividend-rate
    const goalDividendMatch = urlPath.match(/^\/api\/goals\/([^/]+)\/dividend-rate$/)
    if (goalDividendMatch && req.method === 'PUT') {
      const id = goalDividendMatch[1]
      readBody(req, res, (body) => {
        const result = setGoalDividendRate(id, body.dividendRate)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // PUT /api/goals/:id/starting-amount
    const goalStartingMatch = urlPath.match(/^\/api\/goals\/([^/]+)\/starting-amount$/)
    if (goalStartingMatch && req.method === 'PUT') {
      const id = goalStartingMatch[1]
      readBody(req, res, (body) => {
        const result = setGoalStartingAmount(id, body.startingAmount)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // POST /api/goals/:goalId/contributions
    const contribBaseMatch = urlPath.match(/^\/api\/goals\/([^/]+)\/contributions$/)
    if (contribBaseMatch && req.method === 'POST') {
      const goalId = contribBaseMatch[1]
      readBody(req, res, (body) => {
        const result = addContribution(goalId, body.amount, body.date, body.note)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // DELETE /api/goals/:goalId/contributions/:contributionId
    const contribMatch = urlPath.match(/^\/api\/goals\/([^/]+)\/contributions\/([^/]+)$/)
    if (contribMatch && req.method === 'DELETE') {
      const [, goalId, contributionId] = contribMatch
      const result = deleteContribution(goalId, contributionId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // ── Mortgages REST API ──────────────────────────────────────────────────

    // GET /api/mortgages
    if (urlPath === '/api/mortgages' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(getMortgages()))
      return
    }

    // POST /api/mortgages
    if (urlPath === '/api/mortgages' && req.method === 'POST') {
      readBody(req, res, (body) => {
        const result = addMortgage(body.name, body.marketValue, body.principalBalance)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // GET /api/mortgages/:id/payments
    const mortgagePaymentsBase = urlPath.match(/^\/api\/mortgages\/([^/]+)\/payments$/)
    if (mortgagePaymentsBase && req.method === 'GET') {
      const mortgageId = mortgagePaymentsBase[1]
      const result = getMortgagePayments(mortgageId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // POST /api/mortgages/:id/payments
    if (mortgagePaymentsBase && req.method === 'POST') {
      const mortgageId = mortgagePaymentsBase[1]
      readBody(req, res, (body) => {
        const result = addMortgagePayment(mortgageId, body.date, body.principal, body.interest, body.escrow, body.note)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // PUT /api/mortgages/:id/payments/:pid
    const mortgagePaymentMatch = urlPath.match(/^\/api\/mortgages\/([^/]+)\/payments\/([^/]+)$/)
    if (mortgagePaymentMatch && req.method === 'PUT') {
      const [, mortgageId, paymentId] = mortgagePaymentMatch
      readBody(req, res, (body) => {
        const result = updateMortgagePayment(mortgageId, paymentId, { date: body.date, principal: body.principal, interest: body.interest, escrow: body.escrow, note: body.note })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // DELETE /api/mortgages/:id/payments/:pid
    if (mortgagePaymentMatch && req.method === 'DELETE') {
      const [, mortgageId, paymentId] = mortgagePaymentMatch
      const result = deleteMortgagePayment(mortgageId, paymentId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // PUT /api/mortgages/:id
    const mortgageMatch = urlPath.match(/^\/api\/mortgages\/([^/]+)$/)
    if (mortgageMatch && req.method === 'PUT') {
      const id = mortgageMatch[1]
      readBody(req, res, (body) => {
        const result = updateMortgage(id, { name: body.name, marketValue: body.marketValue, principalBalance: body.principalBalance })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }

    // DELETE /api/mortgages/:id
    if (mortgageMatch && req.method === 'DELETE') {
      const id = mortgageMatch[1]
      const result = deleteMortgage(id)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
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
  }

  httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res).catch((err) => {
      console.error('Request handler failed:', err)
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    })
  })

  wss = new WebSocketServer({ server: httpServer })

  if (opts.auth) {
    const auth = opts.auth
    wss.on('connection', (socket, req) => {
      if (!auth.getSessionUser(req)) socket.close(4401, 'Authentication required')
    })
  }

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
