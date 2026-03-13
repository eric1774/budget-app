import React from 'react'

interface GlassCardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  onClick?: () => void
}

export function GlassCard({ children, style, className, onClick }: GlassCardProps): JSX.Element {
  const classes = ['glass-card', className].filter(Boolean).join(' ')
  return (
    <div
      className={classes}
      onClick={onClick}
      style={{ padding: '16px 18px', ...style }}
    >
      {children}
    </div>
  )
}
