import { useEffect, useState, useCallback, useMemo } from 'react'
import type { ParseResult, ParseError, ParseResponse, BudgetMap, ServerInfo, AuthUser } from '../../shared/types'
import { getMe, logout } from './api'
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
import { GoalsTab } from './components/GoalsTab'
import { ChatTab } from './components/ChatTab'
import { LogFilterBar } from './components/LogFilterBar'
import type { LogFilterState } from './components/LogFilterBar'
import { DEFAULT_LOG_FILTER } from './components/LogFilterBar'
import { SAVINGS_CATEGORIES } from './config'
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
type ActiveTab = 'dashboard' | 'budget' | 'log' | 'goals' | 'assets' | 'chat'

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
      className={`app-banner app-banner--${type}`}
      role="alert"
      style={{ position: 'relative', top: 0, left: 0, transform: 'none', borderRadius: 0, maxWidth: '100%', animation: 'none' }}
    >
      <span>{message}</span>
      {dismissible && (
        <button
          className="btn-icon"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          style={{ color: bannerColors[type], width: 32, height: 32, minWidth: 32, minHeight: 32 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [logFilterState, setLogFilterState] = useState<LogFilterState>(DEFAULT_LOG_FILTER)
  const [budgetMap, setBudgetMap] = useState<BudgetMap>({})
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  // Browser-mode WebSocket state (null = not in browser WS mode / Electron mode)
  const [wsState, setWsState] = useState<WsState | null>(null)
  // Timestamp of last parse error for the "Last updated X min ago" stale data badge
  const [parseErrorBadgeAt, setParseErrorBadgeAt] = useState<Date | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    getMe().then(setUser)
  }, [])

  // Map dashboard filterState date preset to log filter date fields
  const dashboardDateToLogDate = useCallback((fs: FilterState): Pick<LogFilterState, 'datePreset' | 'selectedMonthYear'> => {
    if (fs.datePreset === 'this-month') {
      return { datePreset: 'this-month', selectedMonthYear: null }
    }
    if (fs.datePreset === 'last-month') {
      const now = new Date()
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      const m = now.getMonth() === 0 ? 12 : now.getMonth()
      return { datePreset: 'specific-month', selectedMonthYear: `${y}-${String(m).padStart(2, '0')}` }
    }
    return { datePreset: 'all', selectedMonthYear: null }
  }, [])

  // Navigate to Log tab with pre-applied filters from a dashboard card/chart click
  const navigateToLog = useCallback((overrides: Partial<LogFilterState>) => {
    setLogFilterState({ ...DEFAULT_LOG_FILTER, ...overrides })
    setActiveTab('log')
  }, [])

  const handleSummaryCardClick = useCallback((cardType: 'income' | 'expenses' | 'savings') => {
    const datePart = dashboardDateToLogDate(filterState)
    if (cardType === 'income') {
      navigateToLog({ ...datePart, incomeExpense: 'income' })
    } else if (cardType === 'expenses') {
      navigateToLog({ ...datePart, incomeExpense: 'expenses' })
    } else {
      navigateToLog({ ...datePart, incomeExpense: 'expenses', activeCategories: new Set(SAVINGS_CATEGORIES) })
    }
  }, [filterState, dashboardDateToLogDate, navigateToLog])

  const handleCategoryDoubleClick = useCallback((category: string) => {
    const datePart = dashboardDateToLogDate(filterState)
    navigateToLog({ ...datePart, incomeExpense: 'expenses', activeCategories: new Set([category]) })
  }, [filterState, dashboardDateToLogDate, navigateToLog])

  // Show a success banner that auto-dismisses after 2 seconds
  const showSuccessBanner = useCallback((message: string) => {
    setBanner({ type: 'success', message, dismissible: false })
    setTimeout(() => setBanner(null), 2000)
  }, [])

  // Browser-mode WsClient lifecycle — only runs when window.electronAPI is absent
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) return

    let mounted = true

    const bounceToLogin = (): void => {
      window.location.href = '/auth/login'
    }

    const fetchSnapshot = (): void => {
      fetch('/api/snapshot')
        .then((r) => {
          // Session died (12h expiry, cleared cookies) — re-auth instead of
          // leaving the page stuck on the loading skeleton
          if (r.status === 401) {
            bounceToLogin()
            return null
          }
          return r.json()
        })
        .then((data) => {
          if (!mounted || !data) return
          const snap = data as ParseResponse
          if (snap.ok) {
            setParseResult(reviveDates(snap.result))
            setStatus('loaded')
            setLastSyncedAt(new Date())
          }
        })
        .catch(() => {})
    }

    // Load data immediately — the dashboard must not wait for the WebSocket
    fetchSnapshot()

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
        // Refresh after (re)connect — updates broadcast while disconnected were missed
        if (state === 'connected') fetchSnapshot()
      },
      onAuthRejected: bounceToLogin,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }} />
          <h1 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 600, letterSpacing: '0.01em' }}>Budget Dashboard</h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>Select your Budget.xlsx file to get started.</p>
        <button className="btn-primary" onClick={handleSelectFile}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {banner && <Banner {...banner} onDismiss={() => setBanner(null)} />}

      {/* Slim header */}
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__logo-dot" />
          <span className="app-header__title">Budget</span>
        </div>
        <span className="app-header__filepath">
          {filePath ?? ''}
        </span>
        <div className="app-header__actions">
          {user && (
            <span className="app-header__user" title={user.email}>
              {user.name}
              {user.role === 'admin' && <span className="app-header__role">admin</span>}
              <button className="app-header__signout" onClick={() => { void logout() }}>
                Sign out
              </button>
            </span>
          )}
          <button className="btn-ghost" onClick={handleSelectFile}>
            Change File
          </button>
        </div>
      </header>

      {/* Server toolbar — only renders inside Electron */}
      <ServerToolbar
        serverInfo={serverInfo}
        lastSyncedAt={lastSyncedAt}
        onRestart={handleServerRestart}
      />

      {/* Tab navigation */}
      <nav className="tab-nav" role="tablist" aria-label="Main navigation">
        <button
          role="tab"
          aria-selected={activeTab === 'dashboard'}
          aria-controls="panel-dashboard"
          className={`tab-btn${activeTab === 'dashboard' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <span className="tab-label">Dashboard</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'budget'}
          aria-controls="panel-budget"
          className={`tab-btn${activeTab === 'budget' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('budget')}
          style={{ position: 'relative' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <span className="tab-label">Budget</span>
          {isAnyOverBudget && (
            <span className="budget-tab-badge" role="status" aria-label="Some categories over budget" />
          )}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'log'}
          aria-controls="panel-log"
          className={`tab-btn${activeTab === 'log' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('log')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          <span className="tab-label">Log</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'goals'}
          aria-controls="panel-goals"
          className={`tab-btn${activeTab === 'goals' ? ' tab-btn--active' : ''}`}
          onClick={() => { setActiveTab('goals'); setSelectedGoalId(null) }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          <span className="tab-label">Goals</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'assets'}
          aria-controls="panel-assets"
          className={`tab-btn${activeTab === 'assets' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('assets')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          <span className="tab-label">Assets</span>
        </button>
        {!window.electronAPI && (
          <button
            role="tab"
            aria-selected={activeTab === 'chat'}
            aria-controls="panel-chat"
            className={`tab-btn${activeTab === 'chat' ? ' tab-btn--active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            <span className="tab-label">Chat</span>
          </button>
        )}
      </nav>

      {/* Offline badge — browser mode only, when disconnected */}
      {wsState === 'disconnected' && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(15,22,35,0.92)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 11,
          color: 'var(--text-muted)',
          zIndex: 999,
          backdropFilter: 'blur(12px)',
        }}>
          <span className="status-dot status-dot--offline" />
          Offline
        </div>
      )}

      {/* Reconnecting indicator — browser mode only */}
      {wsState === 'reconnecting' && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(15,22,35,0.92)',
          border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 11,
          color: 'var(--warning)',
          zIndex: 999,
          backdropFilter: 'blur(12px)',
        }}>
          <span className="status-dot status-dot--warn" />
          Reconnecting…
        </div>
      )}

      {/* Parse error badge — stale data warning (browser mode only) */}
      {parseErrorBadgeAt && (
        <div style={{
          position: 'fixed',
          bottom: wsState === 'reconnecting' ? 52 : 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(15,22,35,0.92)',
          border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 11,
          color: 'var(--expense)',
          zIndex: 999,
          backdropFilter: 'blur(12px)',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Last updated {formatRelTime(parseErrorBadgeAt)}
        </div>
      )}

      {activeTab === 'dashboard' ? (
        <div id="panel-dashboard" role="tabpanel" aria-labelledby="tab-dashboard" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <FilterBar
            filterState={filterState}
            allCategories={parseResult?.categories ?? []}
            onChange={setFilterState}
          />
          <main className="dashboard-main">
            <SummaryCards transactions={filteredTransactions} onCardClick={handleSummaryCardClick} />
            <MonthlyChart transactions={filteredTransactions} />
            <div className="charts-row">
              <CategoryBreakdownChart transactions={filteredTransactions} onCategoryDoubleClick={handleCategoryDoubleClick} />
              <BalanceChart transactions={filteredTransactions} />
            </div>
          </main>
        </div>
      ) : activeTab === 'budget' ? (
        <main id="panel-budget" role="tabpanel" aria-labelledby="tab-budget" className="budget-tab-outer">
          <BudgetTab
            transactions={parseResult?.transactions ?? []}
            categories={(parseResult?.categories ?? []).filter(c => c !== 'Income')}
          />
        </main>
      ) : activeTab === 'log' ? (
        <div id="panel-log" role="tabpanel" aria-labelledby="tab-log" className="log-tab-outer">
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
      ) : activeTab === 'goals' ? (
        <div id="panel-goals" role="tabpanel" aria-labelledby="tab-goals" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <GoalsTab
            onGoalSelect={(goal) => setSelectedGoalId(goal?.id ?? null)}
            selectedGoalId={selectedGoalId}
          />
        </div>
      ) : activeTab === 'assets' ? (
        <div id="panel-assets" role="tabpanel" aria-labelledby="tab-assets" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <AssetsTab
            onAccountSelect={(account) => setSelectedAssetAccountId(account?.id ?? null)}
            selectedAccountId={selectedAssetAccountId}
            dashboardBalance={filteredTransactions.length > 0
              ? filteredTransactions[filteredTransactions.length - 1].balance
              : undefined}
          />
        </div>
      ) : (
        <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <ChatTab />
        </div>
      )}
    </div>
  )
}
