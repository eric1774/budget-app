import { useEffect, useState, useCallback, useMemo } from 'react'
import type { ParseResult, ParseError, ParseResponse, BudgetMap, ServerInfo } from '../../shared/types'
import { WsClient, buildWsUrl } from './ws-client'
import type { WsState } from './ws-client'
import { LoadingSkeleton } from './components/LoadingSkeleton'
import { ServerToolbar } from './components/ServerToolbar'
import { FilterBar } from './components/FilterBar'
import type { FilterState } from './components/FilterBar'
import { SummaryCards } from './components/SummaryCards'
import { MonthlyChart } from './components/MonthlyChart'
import { CategoryBreakdownChart } from './components/CategoryBreakdownChart'
import { BalanceChart } from './components/BalanceChart'
import { BudgetTab } from './components/BudgetTab'
import { LogTab } from './components/LogTab'
import { AssetsTab } from './components/AssetsTab'
import { LogFilterBar } from './components/LogFilterBar'
import type { LogFilterState } from './components/LogFilterBar'
import { DEFAULT_LOG_FILTER } from './components/LogFilterBar'
import './index.css'

// --- Helpers ---

function reviveDates(result: ParseResult): ParseResult {
  return {
    ...result,
    transactions: result.transactions.map((t) => ({
      ...t,
      date: t.date instanceof Date ? t.date : new Date(t.date as unknown as string),
    })),
  }
}

// --- Types ---

type Status = 'welcome' | 'loading' | 'loaded' | 'error'
type ActiveTab = 'dashboard' | 'budget' | 'log' | 'assets'

interface BannerState {
  type: 'warning' | 'error' | 'success'
  message: string
  dismissible: boolean
}

// --- Banner component ---

interface BannerProps extends BannerState {
  onDismiss: () => void
}

const bannerColors: Record<BannerState['type'], string> = {
  warning: '#ffd166',
  error: '#ff8585',
  success: '#86efac',
}

const bannerBg: Record<BannerState['type'], string> = {
  warning: 'rgba(120,90,0,0.7)',
  error: 'rgba(139,0,0,0.7)',
  success: 'rgba(26,94,26,0.7)',
}

function Banner({ type, message, dismissible, onDismiss }: BannerProps): JSX.Element {
  return (
    <div
      style={{
        backgroundColor: bannerBg[type],
        color: bannerColors[type],
        padding: '10px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: 'sans-serif',
        fontSize: 14,
        borderBottom: `2px solid ${bannerColors[type]}`,
      }}
    >
      <span>{message}</span>
      {dismissible && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: bannerColors[type],
            fontWeight: 'bold',
            fontSize: 16,
            marginLeft: 12,
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  )
}

// --- Styles ---

const styles = {
  center: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: '100vh',
    gap: 16,
    background: 'var(--bg-app)',
    color: 'var(--text-primary)',
  },
  button: {
    padding: '10px 24px',
    fontSize: 16,
    cursor: 'pointer',
    backgroundColor: 'var(--color-accent)',
    color: '#1a1d23',
    border: 'none',
    borderRadius: 4,
    fontWeight: 600,
  },
}

// --- Helpers ---

function formatRelTime(d: Date): string {
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  return `${diffMin} min ago`
}

// --- Main App ---

export default function App(): JSX.Element {
  const [status, setStatus] = useState<Status>('loading')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<ParseError | null>(null)
  const [banner, setBanner] = useState<BannerState | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [filterState, setFilterState] = useState<FilterState>({
    datePreset: 'this-month',
    customFrom: '',
    customTo: '',
    activeCategories: new Set<string>(),
  })
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard')
  const [selectedAssetAccountId, setSelectedAssetAccountId] = useState<string | null>(null)
  const [logFilterState, setLogFilterState] = useState<LogFilterState>(DEFAULT_LOG_FILTER)
  const [budgetMap, setBudgetMap] = useState<BudgetMap>({})
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  // Browser-mode WebSocket state (null = not in browser WS mode / Electron mode)
  const [wsState, setWsState] = useState<WsState | null>(null)
  // Timestamp of last parse error for the "Last updated X min ago" stale data badge
  const [parseErrorBadgeAt, setParseErrorBadgeAt] = useState<Date | null>(null)

  // Show a success banner that auto-dismisses after 2 seconds
  const showSuccessBanner = useCallback((message: string) => {
    setBanner({ type: 'success', message, dismissible: false })
    setTimeout(() => setBanner(null), 2000)
  }, [])

  // Browser-mode WsClient lifecycle — only runs when window.electronAPI is absent
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) return

    let mounted = true
    const client = new WsClient(buildWsUrl(), {
      onMessage: (payload) => {
        if (!mounted) return
        const p = payload as { type: string; ok: boolean; result?: ParseResult; error?: ParseError }
        if (p.type === 'file-changed') {
          if (p.ok && p.result) {
            setParseResult(reviveDates(p.result))
            setParseError(null)
            setParseErrorBadgeAt(null)
            setStatus('loaded')
            setLastSyncedAt(new Date())
          } else if (!p.ok && p.error) {
            // Keep last good data, set error badge timestamp
            setParseErrorBadgeAt(new Date())
          }
        }
      },
      onStateChange: (state) => {
        if (!mounted) return
        setWsState(state)
        if (state === 'connected') {
          // Fetch fresh snapshot immediately after (re)connect
          fetch('/api/snapshot')
            .then((r) => r.json())
            .then((data) => {
              if (!mounted) return
              const snap = data as ParseResponse
              if (snap.ok) {
                setParseResult(reviveDates(snap.result))
                setStatus('loaded')
                setLastSyncedAt(new Date())
              }
            })
            .catch(() => {})
        }
      },
    })

    return () => {
      mounted = false
      client.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset activeCategories when parseResult changes (file reload)
  useEffect(() => {
    setFilterState((prev) => ({ ...prev, activeCategories: new Set(parseResult?.categories ?? []) }))
  }, [parseResult?.categories])

  // Re-fetch budgetMap when switching back to dashboard (to keep badge in sync)
  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.invoke('get-budgets').then((data) => {
      setBudgetMap((data as BudgetMap) ?? {})
    })
  }, [activeTab])

  // Derive isAnyOverBudget for red dot badge
  const currentMonthKey = new Date().toISOString().slice(0, 7)
  const isAnyOverBudget = useMemo(() => {
    const monthBudgets = budgetMap[currentMonthKey] ?? {}
    if (Object.keys(monthBudgets).length === 0) return false
    // Compute actual spend per category for current month
    const actualByCategory: Record<string, number> = {}
    for (const t of parseResult?.transactions ?? []) {
      const tKey = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`
      if (tKey === currentMonthKey) {
        actualByCategory[t.category] = (actualByCategory[t.category] ?? 0) + t.debit
      }
    }
    return Object.entries(monthBudgets).some(([category, budgeted]) => {
      const actual = actualByCategory[category] ?? 0
      return actual > budgeted
    })
  }, [budgetMap, parseResult, currentMonthKey])

  // Derive filteredTransactions based on filterState
  const filteredTransactions = useMemo(() => {
    if (!parseResult) return []
    let txns = parseResult.transactions

    const now = new Date()
    if (filterState.datePreset === 'this-month') {
      txns = txns.filter((t) => t.date.getFullYear() === now.getFullYear() && t.date.getMonth() === now.getMonth())
    } else if (filterState.datePreset === 'last-month') {
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1
      txns = txns.filter((t) => t.date.getFullYear() === y && t.date.getMonth() === m)
    } else if (filterState.datePreset === 'this-year') {
      txns = txns.filter((t) => t.date.getFullYear() === now.getFullYear())
    } else if (filterState.datePreset === 'custom') {
      const from = filterState.customFrom ? new Date(filterState.customFrom) : null
      const to = filterState.customTo ? new Date(filterState.customTo) : null
      if (from) txns = txns.filter((t) => t.date >= from!)
      if (to) {
        const toEnd = new Date(to)
        toEnd.setHours(23, 59, 59, 999)
        txns = txns.filter((t) => t.date <= toEnd)
      }
    }
    // 'all-time' — no date filter

    if (filterState.activeCategories.size === 0) return []
    txns = txns.filter((t) => filterState.activeCategories.has(t.category))

    return txns
  }, [parseResult, filterState])

  const availableMonths = useMemo(() => {
    if (!parseResult) return []
    const seen = new Set<string>()
    for (const t of parseResult.transactions) {
      const ym = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`
      seen.add(ym)
    }
    return Array.from(seen).sort((a, b) => b.localeCompare(a))  // newest first
  }, [parseResult])

  const logFilteredTransactions = useMemo(() => {
    if (!parseResult) return []
    let txns = parseResult.transactions

    // Date filter
    const now = new Date()
    if (logFilterState.datePreset === 'this-month') {
      txns = txns.filter((t) => t.date.getFullYear() === now.getFullYear() && t.date.getMonth() === now.getMonth())
    } else if (logFilterState.datePreset === 'specific-month' && logFilterState.selectedMonthYear) {
      const [sy, sm] = logFilterState.selectedMonthYear.split('-')
      txns = txns.filter((t) => t.date.getFullYear() === parseInt(sy, 10) && t.date.getMonth() === parseInt(sm, 10) - 1)
    }
    // 'all' — no date filter

    // Category filter (empty set = no filter)
    if (logFilterState.activeCategories.size > 0) {
      txns = txns.filter((t) => logFilterState.activeCategories.has(t.category))
    }

    // Income/expense toggle
    if (logFilterState.incomeExpense === 'income') {
      txns = txns.filter((t) => t.income > 0)
    } else if (logFilterState.incomeExpense === 'expenses') {
      txns = txns.filter((t) => t.debit > 0)
    }

    // Description search (case-insensitive, Description field only)
    if (logFilterState.descriptionSearch.trim() !== '') {
      const needle = logFilterState.descriptionSearch.trim().toLowerCase()
      txns = txns.filter((t) => t.description.toLowerCase().includes(needle))
    }

    return txns
  }, [parseResult, logFilterState])

  const loadFile = useCallback(async (path: string, isStoredPath = false) => {
    setStatus('loading')
    const res = (await window.electronAPI.invoke('parse-file', path)) as ParseResponse
    if (res.ok) {
      setParseResult(reviveDates(res.result))
      setParseError(null)
      setStatus('loaded')
      if (res.result.skippedRows > 0) {
        setBanner({
          type: 'warning',
          message: `${res.result.skippedRows} rows skipped due to missing required fields`,
          dismissible: true,
        })
      } else {
        setBanner(null)
      }
    } else {
      if (res.error.kind === 'read-error' && isStoredPath) {
        // Stored path no longer exists — tell user and open picker
        setBanner({
          type: 'error',
          message: 'Previously selected file not found. Please select a new file.',
          dismissible: false,
        })
        setStatus('welcome')
        // Auto-open picker after short delay so user sees the message
        setTimeout(async () => {
          const newPath = (await window.electronAPI.invoke('open-file-dialog')) as string | null
          if (newPath) {
            setFilePath(newPath)
            setBanner(null)
            await loadFile(newPath)
          } else {
            setStatus('welcome')
          }
        }, 1500)
      } else if (res.error.kind === 'read-error') {
        setBanner({
          type: 'error',
          message: 'Could not read file — check file path',
          dismissible: true,
        })
        if (!parseResult) setStatus('welcome')
        else setStatus('loaded')
      } else {
        // Structural error: wrong-file-type, missing-sheet, missing-columns
        setParseError(res.error)
        if (!parseResult) {
          setStatus('error')
        } else {
          // Already had data — show error banner but keep last data visible
          setBanner({ type: 'error', message: res.error.message, dismissible: true })
          setStatus('loaded')
        }
      }
    }
  }, [parseResult])

  const handleSelectFile = useCallback(async () => {
    const path = (await window.electronAPI.invoke('open-file-dialog')) as string | null
    if (!path) return
    setFilePath(path)
    await loadFile(path)
  }, [loadFile])

  const handleServerRestart = useCallback(async () => {
    const info = (await window.electronAPI.invoke('restart-server')) as ServerInfo | null
    if (info) setServerInfo(info)
  }, [])

  // On mount: read stored path and subscribe to IPC events (Electron only)
  useEffect(() => {
    if (!window.electronAPI) return
    let mounted = true

    const init = async (): Promise<void> => {
      const storedPath = (await window.electronAPI.invoke('get-stored-path')) as string | null
      if (!mounted) return
      if (storedPath) {
        setFilePath(storedPath)
        await loadFile(storedPath, true)
      } else {
        setStatus('welcome')
      }
    }

    init()

    // Fetch initial server info
    window.electronAPI?.invoke('get-server-info').then((info) => {
      setServerInfo((info as ServerInfo) ?? null)
    })

    // Subscribe to server-info updates (e.g. after server restart)
    const unsubServerInfo = window.electronAPI.on('server-info', (data: unknown) => {
      if (!mounted) return
      setServerInfo((data as ServerInfo) ?? null)
    })

    // Subscribe to file watcher events
    const unsubFileChanged = window.electronAPI.on(
      'file-changed',
      (data: unknown) => {
        if (!mounted) return
        const d = data as { ok: boolean; result?: ParseResult; error?: ParseError }
        if (d.ok && d.result) {
          setParseResult(reviveDates(d.result))
          setParseError(null)
          setStatus('loaded')
          setLastSyncedAt(new Date())
          showSuccessBanner('Refreshed')
        } else if (!d.ok && d.error) {
          setBanner({ type: 'error', message: d.error.message, dismissible: true })
        }
      }
    )

    const unsubFileLocked = window.electronAPI.on('file-locked', () => {
      if (!mounted) return
      setBanner({
        type: 'warning',
        message: 'File locked by Excel — retrying...',
        dismissible: false,
      })
    })

    const unsubFileLockedPersistent = window.electronAPI.on(
      'file-locked-persistent',
      (data: unknown) => {
        if (!mounted) return
        const d = data as { error: string }
        setBanner({
          type: 'warning',
          message: `File unchanged — locked by Excel. Last data shown. ${d.error}`,
          dismissible: false,
        })
      }
    )

    return () => {
      mounted = false
      unsubServerInfo()
      unsubFileChanged()
      unsubFileLocked()
      unsubFileLockedPersistent()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Welcome state
  if (status === 'welcome') {
    return (
      <div style={styles.center}>
        {banner && (
          <Banner {...banner} onDismiss={() => setBanner(null)} />
        )}
        <h1 style={{ color: 'var(--color-accent)', fontSize: 28, fontWeight: 700 }}>Budget Dashboard</h1>
        <p style={{ color: 'var(--text-muted)' }}>Select your Budget.xlsx file to get started.</p>
        <button style={styles.button} onClick={handleSelectFile}>
          Select File
        </button>
      </div>
    )
  }

  // Loading state
  if (status === 'loading') {
    // In browser mode (wsState !== null), show skeleton placeholder shapes
    if (wsState !== null) {
      return (
        <div style={{ background: 'var(--bg-app)', minHeight: '100vh' }}>
          <LoadingSkeleton />
        </div>
      )
    }
    return (
      <div style={styles.center}>
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    )
  }

  // Hard error state (no data yet)
  if (status === 'error' && !parseResult) {
    return (
      <div style={{ background: 'var(--bg-app)', minHeight: '100vh' }}>
        {banner && <Banner {...banner} onDismiss={() => setBanner(null)} />}
        <div style={styles.center}>
          <p style={{ color: 'var(--color-expense)' }}>{parseError?.message}</p>
          <button style={styles.button} onClick={handleSelectFile}>
            Select Different File
          </button>
        </div>
      </div>
    )
  }

  // Loaded state — full dashboard with tab navigation
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      {banner && <Banner {...banner} onDismiss={() => setBanner(null)} />}

      {/* Slim header */}
      <header className="app-header">
        <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-accent)', letterSpacing: '0.02em' }}>
          Budget Dashboard
        </span>
        <span className="app-header__filepath">
          {filePath ?? ''}
        </span>
        <button
          style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, whiteSpace: 'nowrap' }}
          onClick={handleSelectFile}
        >
          Change File
        </button>
      </header>

      {/* Server toolbar — only renders inside Electron */}
      <ServerToolbar
        serverInfo={serverInfo}
        lastSyncedAt={lastSyncedAt}
        onRestart={handleServerRestart}
      />

      {/* Tab navigation */}
      <nav style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', width: '100%' }}>
        <button
          className={`tab-btn${activeTab === 'dashboard' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`tab-btn${activeTab === 'budget' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('budget')}
          style={{ position: 'relative' }}
        >
          Budget
          {isAnyOverBudget && (
            <span className="budget-tab-badge" aria-label="Some categories over budget" />
          )}
        </button>
        <button
          className={`tab-btn${activeTab === 'log' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('log')}
        >
          Log
        </button>
        <button
          className={`tab-btn${activeTab === 'assets' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('assets')}
        >
          Assets
        </button>
      </nav>

      {/* Offline badge — browser mode only, when disconnected */}
      {wsState === 'disconnected' && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          background: 'rgba(60,60,60,0.85)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 11,
          color: 'var(--text-muted)',
          zIndex: 999,
          letterSpacing: '0.04em',
        }}>
          Offline
        </div>
      )}

      {/* Reconnecting indicator — browser mode only */}
      {wsState === 'reconnecting' && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          background: 'rgba(255,200,0,0.15)',
          border: '1px solid rgba(255,200,0,0.4)',
          borderRadius: 6,
          padding: '6px 12px',
          fontSize: 12,
          color: '#ffd166',
          zIndex: 999,
        }}>
          Reconnecting...
        </div>
      )}

      {/* Parse error badge — stale data warning (browser mode only) */}
      {parseErrorBadgeAt && (
        <div style={{
          position: 'fixed',
          bottom: wsState === 'reconnecting' ? 52 : 16,
          right: 16,
          background: 'rgba(139,0,0,0.5)',
          border: '1px solid rgba(255,100,100,0.4)',
          borderRadius: 6,
          padding: '6px 12px',
          fontSize: 12,
          color: '#ff8585',
          zIndex: 999,
        }}>
          Last updated {formatRelTime(parseErrorBadgeAt)} ⚠️
        </div>
      )}

      {activeTab === 'dashboard' ? (
        <>
          <FilterBar
            filterState={filterState}
            allCategories={parseResult?.categories ?? []}
            onChange={setFilterState}
          />
          {/* Dashboard body */}
          <main className="dashboard-main">
            <SummaryCards transactions={filteredTransactions} />

            {/* Charts */}
            <MonthlyChart transactions={filteredTransactions} />

            <div className="charts-row">
              <CategoryBreakdownChart transactions={filteredTransactions} />
              <BalanceChart transactions={filteredTransactions} />
            </div>
          </main>
        </>
      ) : activeTab === 'budget' ? (
        <main className="budget-tab-outer" style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          <BudgetTab
            transactions={parseResult?.transactions ?? []}
            categories={(parseResult?.categories ?? []).filter(c => c !== 'Income')}
          />
        </main>
      ) : activeTab === 'log' ? (
        <div className="log-tab-outer">
          <LogFilterBar
            filterState={logFilterState}
            allCategories={parseResult?.categories ?? []}
            availableMonths={availableMonths}
            onChange={setLogFilterState}
          />
          <LogTab
            transactions={logFilteredTransactions}
            totalCount={parseResult?.transactions.length ?? 0}
          />
        </div>
      ) : (
        <AssetsTab
          onAccountSelect={(account) => setSelectedAssetAccountId(account?.id ?? null)}
          selectedAccountId={selectedAssetAccountId}
        />
      )}
    </div>
  )
}
