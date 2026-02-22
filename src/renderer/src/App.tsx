import { useEffect, useState, useCallback } from 'react'
import type { ParseResult, ParseError, ParseResponse } from '../../shared/types'

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
  warning: '#7a5c00',
  error: '#8b0000',
  success: '#1a5e1a',
}

const bannerBg: Record<BannerState['type'], string> = {
  warning: '#fff3cd',
  error: '#f8d7da',
  success: '#d4edda',
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
    fontFamily: 'sans-serif',
    gap: 16,
  },
  button: {
    padding: '10px 24px',
    fontSize: 16,
    cursor: 'pointer',
    backgroundColor: '#0078d4',
    color: 'white',
    border: 'none',
    borderRadius: 4,
  },
  smallButton: {
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
    backgroundColor: '#555',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    marginTop: 8,
  },
  container: {
    fontFamily: 'sans-serif',
    padding: 24,
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
        <h1>Budget Dashboard</h1>
        <p>Select your Budget.xlsx file to get started.</p>
        <button style={styles.button} onClick={handleSelectFile}>
          Select File
        </button>
      </div>
    )
  }

  // Loading state
  if (status === 'loading') {
    return <div style={styles.center}><p>Loading...</p></div>
  }

  // Hard error state (no data yet)
  if (status === 'error' && !parseResult) {
    return (
      <div>
        {banner && <Banner {...banner} onDismiss={() => setBanner(null)} />}
        <div style={styles.center}>
          <p style={{ color: 'red' }}>{parseError?.message}</p>
          <button style={styles.button} onClick={handleSelectFile}>
            Select Different File
          </button>
        </div>
      </div>
    )
  }

  // Loaded state (may also have a banner)
  return (
    <div style={styles.container}>
      {banner && <Banner {...banner} onDismiss={() => setBanner(null)} />}
      <h1>Budget Dashboard</h1>
      <p>File: {filePath}</p>
      <p>Transactions: {parseResult?.transactions.length ?? 0}</p>
      <p>
        Categories ({parseResult?.categories.length ?? 0}):{' '}
        {parseResult?.categories.join(', ')}
      </p>
      <button style={styles.smallButton} onClick={handleSelectFile}>
        Change File
      </button>
    </div>
  )
}
