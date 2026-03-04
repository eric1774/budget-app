import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import type { ServerInfo } from '../../../shared/types'

interface Props {
  serverInfo: ServerInfo | null
  lastSyncedAt: Date | null
  onRestart: () => Promise<void>
}

export function ServerToolbar({ serverInfo, lastSyncedAt, onRestart }: Props): JSX.Element | null {
  if (typeof window === 'undefined' || !window.electronAPI) return null

  const [showQR, setShowQR] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [restarting, setRestarting] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!serverInfo?.url) return
    QRCode.toDataURL(serverInfo.url, { width: 200, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => {})
  }, [serverInfo?.url])

  useEffect(() => {
    if (!showQR) return
    const handler = (e: MouseEvent): void => {
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

  const [relTime, setRelTime] = useState('–')
  useEffect(() => {
    const update = (): void => {
      if (!lastSyncedAt) { setRelTime('–'); return }
      const mins = Math.floor((Date.now() - lastSyncedAt.getTime()) / 60000)
      setRelTime(mins === 0 ? 'just now' : `${mins}m ago`)
    }
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [lastSyncedAt])

  return (
    <div className="server-toolbar">
      {/* Online dot */}
      <span className={`status-dot ${serverInfo ? 'status-dot--online' : 'status-dot--offline'}`} />

      {/* URL + QR toggle */}
      {serverInfo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, position: 'relative' }}>
          <span style={{ color: 'var(--text-muted)' }}>Network</span>
          <span style={{ color: 'var(--border)', userSelect: 'none' }}>·</span>
          <button
            onClick={() => setShowQR((v) => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent)', fontSize: 11, fontFamily: 'monospace',
              padding: 0,
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
                left: 0,
                zIndex: 1000,
                background: '#fff',
                borderRadius: 12,
                padding: 14,
                marginTop: 8,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <img src={qrDataUrl} alt="QR code for mobile access" width={200} height={200} />
              <span style={{ color: '#555', fontSize: 11, fontFamily: 'monospace' }}>{serverInfo.url}</span>
            </div>
          )}
        </div>
      ) : (
        <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>Server starting…</span>
      )}

      {/* Sync timestamp */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          Synced {relTime}
        </span>
      </div>

      {/* Restart button */}
      <button
        onClick={handleRestart}
        disabled={restarting}
        className="btn-ghost"
        style={{
          padding: '3px 10px',
          fontSize: 11,
          cursor: restarting ? 'not-allowed' : 'pointer',
          opacity: restarting ? 0.5 : 1,
        }}
        title="Restart local server"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        {restarting ? 'Restarting…' : 'Restart'}
      </button>
    </div>
  )
}
