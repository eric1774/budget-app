import React from 'react'
import { GlassCard } from './GlassCard'

// ── Shared Recharts theme ──

export const chartTooltipProps = {
  contentStyle: {
    background: 'rgba(15, 22, 35, 0.97)',
    border: '1px solid rgba(255, 255, 255, 0.10)',
    borderRadius: 10,
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  },
  labelStyle: { color: 'var(--text-primary)', marginBottom: 4, fontWeight: 600 },
}

export const chartGridProps = {
  vertical: false as const,
  stroke: 'rgba(255, 255, 255, 0.05)',
}

export const axisTick = { fill: 'var(--text-secondary)', fontSize: 11 }
export const axisTickSmall = { fill: 'var(--text-secondary)', fontSize: 10 }

// ── Chart card shell ──

interface ChartCardProps {
  title: string
  /** Small insight badge rendered next to the title (use ChartStat) */
  stat?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}

export function ChartCard({ title, stat, actions, children }: ChartCardProps): JSX.Element {
  return (
    <GlassCard style={{ padding: 20 }}>
      <div className="chart-card__header">
        <div className="chart-card__heading">
          <span className="chart-card__title">{title}</span>
          {stat}
        </div>
        {actions}
      </div>
      <div className="chart-container">{children}</div>
    </GlassCard>
  )
}

// ── Insight stat badge for chart headers ──

interface ChartStatProps {
  /** Semantic color token, e.g. 'var(--income)' */
  color: string
  children: React.ReactNode
}

export function ChartStat({ color, children }: ChartStatProps): JSX.Element {
  return (
    <span className="chart-stat" style={{ '--stat-color': color } as React.CSSProperties}>
      {children}
    </span>
  )
}

// ── Custom glass tooltip ──

export interface TipRow {
  name: string
  value: string
  color?: string
}

interface TooltipShellProps {
  label?: React.ReactNode
  rows: TipRow[]
  footer?: TipRow
}

export function TooltipShell({ label, rows, footer }: TooltipShellProps): JSX.Element {
  return (
    <div className="chart-tip">
      {label != null && label !== '' && <div className="chart-tip__label">{label}</div>}
      {rows.map((r) => (
        <div className="chart-tip__row" key={r.name}>
          {r.color && <span className="chart-tip__dot" style={{ background: r.color }} />}
          <span className="chart-tip__name">{r.name}</span>
          <span className="chart-tip__value">{r.value}</span>
        </div>
      ))}
      {footer && (
        <div className="chart-tip__row chart-tip__row--footer">
          {footer.color && <span className="chart-tip__dot" style={{ background: footer.color }} />}
          <span className="chart-tip__name">{footer.name}</span>
          <span className="chart-tip__value" style={footer.color ? { color: footer.color } : undefined}>
            {footer.value}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Chart type toggle — mini segmented pill control ──

interface ChartToggleProps<T extends string> {
  options: { value: T; label: string; icon: React.ReactNode }[]
  value: T
  onChange: (value: T) => void
}

export function ChartToggle<T extends string>({ options, value, onChange }: ChartToggleProps<T>): JSX.Element {
  return (
    <div className="chart-toggle" role="group" aria-label="Chart type">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`chart-toggle__btn${value === opt.value ? ' chart-toggle__btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-label={opt.label}
          aria-pressed={value === opt.value}
          title={opt.label}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  )
}

// ── Shared toggle icons (colored via currentColor) ──

export const chartIcons = {
  bar: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="1" y="9" width="3" height="6" rx="1" />
      <rect x="6" y="5" width="3" height="10" rx="1" />
      <rect x="11" y="2" width="3" height="13" rx="1" />
    </svg>
  ),
  line: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1,13 5,8 9,10 15,3" />
    </svg>
  ),
  pie: (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 8 L8 1 A7 7 0 0 1 15 8 Z" fill="currentColor" />
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
}
