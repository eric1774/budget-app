import React from 'react'

export interface FilterState {
  datePreset: 'this-month' | 'last-month' | 'this-year' | 'all-time' | 'custom'
  customFrom: string   // ISO date string 'YYYY-MM-DD' or ''
  customTo: string     // ISO date string 'YYYY-MM-DD' or ''
  activeCategories: Set<string>  // categories currently included
}

interface FilterBarProps {
  filterState: FilterState
  allCategories: string[]
  onChange: (state: FilterState) => void
}

const DATE_PRESETS: { key: FilterState['datePreset']; label: string }[] = [
  { key: 'this-month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'this-year', label: 'This Year' },
  { key: 'all-time',  label: 'All Time' },
  { key: 'custom',    label: 'Custom' },
]

function buildSummaryText(filterState: FilterState, allCategories: string[]): string {
  const presetLabel = DATE_PRESETS.find((p) => p.key === filterState.datePreset)?.label ?? ''
  const hiddenCount = allCategories.length - filterState.activeCategories.size
  const catText = hiddenCount === 0 ? 'All categories' : `${hiddenCount} hidden`
  return `${presetLabel} · ${catText}`
}

export function FilterBar({ filterState, allCategories, onChange }: FilterBarProps): JSX.Element {
  const { datePreset, customFrom, customTo, activeCategories } = filterState

  const handlePresetClick = (preset: FilterState['datePreset']): void => {
    onChange({
      ...filterState,
      datePreset: preset,
      customFrom: preset !== 'custom' ? '' : filterState.customFrom,
      customTo:   preset !== 'custom' ? '' : filterState.customTo,
    })
  }

  const handleCustomFrom = (e: React.ChangeEvent<HTMLInputElement>): void => {
    onChange({ ...filterState, customFrom: e.target.value })
  }

  const handleCustomTo = (e: React.ChangeEvent<HTMLInputElement>): void => {
    onChange({ ...filterState, customTo: e.target.value })
  }

  const handleToggleCategory = (cat: string): void => {
    const next = new Set(activeCategories)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    onChange({ ...filterState, activeCategories: next })
  }

  const handleAll  = (): void => onChange({ ...filterState, activeCategories: new Set(allCategories) })
  const handleNone = (): void => onChange({ ...filterState, activeCategories: new Set() })

  const summaryText = buildSummaryText(filterState, allCategories)

  return (
    <div className="filter-bar filter-bar-wrap">
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

        {/* Segmented date control */}
        <div style={{
          display: 'flex',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.03)',
        }}>
          {DATE_PRESETS.map((preset, i) => {
            const isActive = datePreset === preset.key
            return (
              <button
                key={preset.key}
                className="preset-segment"
                onClick={() => handlePresetClick(preset.key)}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#080B10' : 'var(--text-muted)',
                  border: 'none',
                  borderRight: i < DATE_PRESETS.length - 1 ? '1px solid var(--border)' : 'none',
                  whiteSpace: 'nowrap',
                  transition: 'background 150ms ease, color 150ms ease',
                  minHeight: 34,
                }}
              >
                {preset.label}
              </button>
            )
          })}
        </div>

        {/* Custom date inputs */}
        {datePreset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>From</span>
            <input
              type="date"
              value={customFrom}
              onChange={handleCustomFrom}
              style={{
                fontSize: 12,
                padding: '4px 8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                colorScheme: 'dark',
                fontFamily: 'inherit',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>To</span>
            <input
              type="date"
              value={customTo}
              onChange={handleCustomTo}
              style={{
                fontSize: 12,
                padding: '4px 8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                colorScheme: 'dark',
                fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {/* Summary */}
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
          letterSpacing: '0.02em',
        }}>
          {summaryText}
        </span>
      </div>

      {/* Category chips */}
      <div className="chip-row">
        <button
          onClick={handleAll}
          className="filter-chip"
          style={{
            padding: '3px 11px',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            borderRadius: 99,
            background: 'transparent',
            color: 'var(--accent)',
            border: '1px solid rgba(45,212,191,0.35)',
          }}
        >
          All
        </button>
        <button
          onClick={handleNone}
          className="filter-chip"
          style={{
            padding: '3px 11px',
            fontSize: 11,
            fontWeight: 500,
            fontFamily: 'inherit',
            cursor: 'pointer',
            borderRadius: 99,
            background: 'transparent',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
        >
          None
        </button>

        {allCategories.map((cat) => {
          const isActive = activeCategories.has(cat)
          return (
            <button
              key={cat}
              className="filter-chip"
              onClick={() => handleToggleCategory(cat)}
              style={{
                borderRadius: 99,
                padding: '3px 11px',
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                fontFamily: 'inherit',
                cursor: 'pointer',
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {cat}
            </button>
          )
        })}
      </div>
    </div>
  )
}
