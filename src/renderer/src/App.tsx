import { useEffect, useState, useCallback } from 'react'
import type { ParseResult, ParseError, ParseResponse } from '../../shared/types'
import { GlassCard } from './components/GlassCard'
import { SummaryCards } from './components/SummaryCards'
import './index.css'

// --- Types ---

type Status = 'welcome' | 'loading' | 'loaded' | 'error'

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

// --- Main App ---

export default function App(): JSX.Element {
  const [status, setStatus] = useState<Status>('loading')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<ParseError | null>(null)
  const [banner, setBanner] = useState<BannerState | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)

  // Show a success banner that auto-dismisses after 2 seconds
  const showSuccessBanner = useCallback((message: string) => {
    setBanner({ type: 'success', message, dismissible: false })
    setTimeout(() => setBanner(null), 2000)
  }, [])

  const loadFile = useCallback(async (path: string, isStoredPath = false) => {
    setStatus('loading')
    const res = (await window.electronAPI.invoke('parse-file', path)) as ParseResponse
    if (res.ok) {
      setParseResult(res.result)
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

  // On mount: read stored path and subscribe to IPC events
  useEffect(() => {
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

    // Subscribe to file watcher events
    const unsubFileChanged = window.electronAPI.on(
      'file-changed',
      (data: unknown) => {
        if (!mounted) return
        const d = data as { ok: boolean; result?: ParseResult; error?: ParseError }
        if (d.ok && d.result) {
          setParseResult(d.result)
          setParseError(null)
          setStatus('loaded')
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

  // Loaded state — full dashboard
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      {banner && <Banner {...banner} onDismiss={() => setBanner(null)} />}

      {/* Slim header */}
      <header style={{
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-accent)', letterSpacing: '0.02em' }}>
          Budget Dashboard
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {filePath ?? ''}
        </span>
        <button
          style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
          onClick={handleSelectFile}
        >
          Change File
        </button>
      </header>

      {/* Dashboard body */}
      <main style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SummaryCards transactions={parseResult?.transactions ?? []} />

        {/* Chart area placeholders — filled in Plan 02 */}
        <GlassCard style={{ padding: 24, minHeight: 280 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Income vs Expenses</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Chart coming in Plan 02</div>
        </GlassCard>

        <div style={{ display: 'flex', gap: 24 }}>
          <GlassCard style={{ flex: 1, padding: 24, minHeight: 240 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>YTD Category Breakdown</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Chart coming in Plan 02</div>
          </GlassCard>
          <GlassCard style={{ flex: 1, padding: 24, minHeight: 240 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Running Balance</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Chart coming in Plan 02</div>
          </GlassCard>
        </div>
      </main>
    </div>
  )
}
