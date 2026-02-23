import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import type { ServerInfo } from '../../../shared/types'

interface Props {
  serverInfo: ServerInfo | null
  lastSyncedAt: Date | null          // updated by parent on each successful file-changed
  onRestart: () => Promise<void>
}

export function ServerToolbar({ serverInfo, lastSyncedAt, onRestart }: Props): JSX.Element | null {
  // Only render inside Electron (window.electronAPI present)
  if (typeof window === 'undefined' || !window.electronAPI) return null

  const [showQR, setShowQR] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [restarting, setRestarting] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  // Generate QR code data URL whenever serverInfo.url changes
  useEffect(() => {
    if (!serverInfo?.url) return
    QRCode.toDataURL(serverInfo.url, { width: 200, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => {})
  }, [serverInfo?.url])

  // Close QR popup on outside click
  useEffect(() => {
    if (!showQR) return
    const handler = (e: MouseEvent) => {
      if (qrRef.current && !qrRef.current.contains(e.target as Node)) {
        setShowQR(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showQR])

  const handleRestart = useCallback(async () => {
    setRestarting(true)
    try { await onRestart() } finally { setRestarting(false) }
  }, [onRestart])

  // Relative time string — "just now", "1 min ago", "2 min ago", etc.
  const [relTime, setRelTime] = useState('–')
  useEffect(() => {
    const update = (): void => {
      if (!lastSyncedAt) { setRelTime('–'); return }
      const diffMs = Date.now() - lastSyncedAt.getTime()
      const mins = Math.floor(diffMs / 60000)
      setRelTime(mins === 0 ? 'just now' : `${mins} min ago`)
    }
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [lastSyncedAt])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 16px',
      background: 'rgba(255,255,255,0.04)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      fontSize: 12,
      color: 'var(--text-muted)',
      position: 'relative',
    }}>
      {/* URL + QR toggle */}
      {serverInfo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Network:</span>
          <button
            onClick={() => setShowQR((v) => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-accent)', fontSize: 12, fontFamily: 'monospace',
              padding: 0, textDecoration: 'underline dotted',
            }}
            title="Click to show QR code"
          >
            {serverInfo.url}
          </button>
          {/* QR popup */}
          {showQR && qrDataUrl && (
            <div
              ref={qrRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 16,
                zIndex: 1000,
                background: '#fff',
                borderRadius: 8,
                padding: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <img src={qrDataUrl} alt="QR code" width={200} height={200} />
              <span style={{ color: '#333', fontSize: 11, fontFamily: 'monospace' }}>{serverInfo.url}</span>
            </div>
          )}
        </div>
      ) : (
        <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>Server starting…</span>
      )}

      {/* Sync timestamp */}
      <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', opacity: 0.7 }}>
        Last synced: {relTime}
      </span>

      {/* Restart button */}
      <button
        onClick={handleRestart}
        disabled={restarting}
        style={{
          padding: '3px 10px',
          fontSize: 11,
          cursor: restarting ? 'not-allowed' : 'pointer',
          background: 'rgba(255,255,255,0.06)',
          color: 'var(--text-muted)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 4,
          opacity: restarting ? 0.5 : 1,
        }}
        title="Restart local server"
      >
        {restarting ? 'Restarting…' : '↺ Restart'}
      </button>
    </div>
  )
}
