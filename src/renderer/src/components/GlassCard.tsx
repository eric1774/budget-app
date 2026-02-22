import React from 'react'

interface GlassCardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}

export function GlassCard({ children, style, className }: GlassCardProps): JSX.Element {
  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border-accent)',
        boxShadow: '0 0 16px var(--glow-accent), 0 2px 8px rgba(0,0,0,0.4)',
        borderRadius: 12,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
