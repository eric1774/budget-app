import React from 'react'

interface GlassCardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  onClick?: () => void
}

export function GlassCard({ children, style, className, onClick }: GlassCardProps): JSX.Element {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)',
        borderRadius: 14,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
