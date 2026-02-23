import React from 'react'

// Loading skeleton shown in the browser before the first data snapshot arrives.
// Placeholder shapes matching the dashboard layout: summary cards row + two chart blocks.
// Uses CSS animation shimmer effect — no animation library needed.
export function LoadingSkeleton(): JSX.Element {
  const shimmer: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: 8,
  }
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      {/* Summary cards row */}
      <div style={{ display: 'flex', gap: 16 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ ...shimmer, flex: 1, height: 88 }} />
        ))}
      </div>
      {/* Chart placeholders */}
      <div style={{ ...shimmer, height: 220 }} />
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ ...shimmer, flex: 1, height: 200 }} />
        <div style={{ ...shimmer, flex: 1, height: 200 }} />
      </div>
    </div>
  )
}
