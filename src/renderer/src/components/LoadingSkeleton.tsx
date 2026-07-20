import React from 'react'

// Loading skeleton shown in the browser before the first data snapshot arrives.
// Placeholder shapes matching the app layout: header, filter row, summary cards,
// and chart blocks. CSS shimmer only — zeroed by prefers-reduced-motion.
export function LoadingSkeleton(): JSX.Element {
  const shimmer: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: 12,
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      {/* Header strip */}
      <div style={{ height: 58, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px' }}>
        <div style={{ ...shimmer, width: 28, height: 28, borderRadius: 8 }} />
        <div style={{ ...shimmer, width: 90, height: 14 }} />
        <div style={{ ...shimmer, width: 320, height: 34, margin: '0 auto', borderRadius: 10 }} />
        <div style={{ ...shimmer, width: 110, height: 30 }} />
      </div>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Filter row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ ...shimmer, width: 340, height: 36, borderRadius: 10 }} />
          <div style={{ ...shimmer, width: 130, height: 36, borderRadius: 10 }} />
        </div>
        {/* Summary cards row */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ ...shimmer, flex: 1, height: 92 }} />
          ))}
        </div>
        {/* Chart placeholders */}
        <div style={{ ...shimmer, height: 260 }} />
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ ...shimmer, flex: 1, height: 210 }} />
          <div style={{ ...shimmer, flex: 1, height: 210 }} />
        </div>
      </div>
    </div>
  )
}
