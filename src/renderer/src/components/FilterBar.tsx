import React from 'react'

export interface FilterState {
  datePreset: 'this-month' | 'last-month' | 'this-year' | 'all-time' | 'custom'
  customFrom: string   // ISO date string 'YYYY-MM-DD' or ''
  customTo: string     // ISO date string 'YYYY-MM-DD' or ''
  activeCategories: Set<string>  // categories currently included
}

interface FilterBarProps {
  filterState: FilterState
  allCategories: string[]        // all unique categories from ParseResult
  onChange: (state: FilterState) => void
}

const DATE_PRESETS: { key: FilterState['datePreset']; label: string }[] = [
  { key: 'this-month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'this-year', label: 'This Year' },
  { key: 'all-time', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
]

function buildSummaryText(filterState: FilterState, allCategories: string[]): string {
  const presetLabel = DATE_PRESETS.find((p) => p.key === filterState.datePreset)?.label ?? ''
  const hiddenCount = allCategories.length - filterState.activeCategories.size
  const catText = hiddenCount === 0 ? 'All categories' : `${hiddenCount} ${hiddenCount === 1 ? 'category' : 'categories'} hidden`
  return `${presetLabel} · ${catText}`
}

export function FilterBar({ filterState, allCategories, onChange }: FilterBarProps): JSX.Element {
  const { datePreset, customFrom, customTo, activeCategories } = filterState

  const handlePresetClick = (preset: FilterState['datePreset']): void => {
    onChange({
      ...filterState,
      datePreset: preset,
      customFrom: preset !== 'custom' ? '' : filterState.customFrom,
      customTo: preset !== 'custom' ? '' : filterState.customTo,
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
    if (next.has(cat)) {
      next.delete(cat)
    } else {
      next.add(cat)
    }
    onChange({ ...filterState, activeCategories: next })
  }

  const handleAll = (): void => {
    onChange({ ...filterState, activeCategories: new Set(allCategories) })
  }

  const handleNone = (): void => {
    onChange({ ...filterState, activeCategories: new Set() })
  }

  const summaryText = buildSummaryText(filterState, allCategories)

  return (
    <div
      className="filter-bar"
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Top row: date controls + summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Segmented date control */}
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
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
                  cursor: 'pointer',
                  background: isActive ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                  color: isActive ? '#1a1d23' : 'var(--text-muted)',
                  border: 'none',
                  borderRight: i < DATE_PRESETS.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
                  transition: 'background 0.15s, color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {preset.label}
              </button>
            )
          })}
        </div>

        {/* Custom date inputs (shown only when Custom is active) */}
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
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                colorScheme: 'dark',
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
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                colorScheme: 'dark',
              }}
            />
          </div>
        )}

        {/* Active filter summary */}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {summaryText}
        </span>
      </div>

      {/* Bottom row: category chips */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {/* All / None shortcuts */}
        <button
          onClick={handleAll}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            cursor: 'pointer',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--color-accent)',
            border: '1px solid rgba(255,255,255,0.12)',
            fontWeight: 500,
          }}
        >
          All
        </button>
        <button
          onClick={handleNone}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            cursor: 'pointer',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text-muted)',
            border: '1px solid rgba(255,255,255,0.12)',
            fontWeight: 500,
          }}
        >
          None
        </button>

        {/* Category chips */}
        {allCategories.map((cat) => {
          const isActive = activeCategories.has(cat)
          return (
            <button
              key={cat}
              className="filter-chip"
              onClick={() => handleToggleCategory(cat)}
              style={{
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 12,
                cursor: 'pointer',
                border: 'none',
                background: isActive ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
                color: isActive ? '#1a1d23' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 400,
                transition: 'background 0.15s, color 0.15s',
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
