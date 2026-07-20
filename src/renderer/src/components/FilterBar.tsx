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
      {/* Top row: date presets + custom range + summary */}
      <div className="filter-bar-top">
        <div className="date-preset-group" role="group" aria-label="Date range">
          {DATE_PRESETS.map((preset) => {
            const isActive = datePreset === preset.key
            return (
              <button
                key={preset.key}
                className={`preset-segment${isActive ? ' preset-segment--active' : ''}`}
                aria-pressed={isActive}
                onClick={() => handlePresetClick(preset.key)}
              >
                {preset.label}
              </button>
            )
          })}
        </div>

        {datePreset === 'custom' && (
          <div className="date-range-inputs">
            <span>From</span>
            <input
              type="date"
              className="date-input"
              aria-label="From date"
              value={customFrom}
              onChange={handleCustomFrom}
            />
            <span>To</span>
            <input
              type="date"
              className="date-input"
              aria-label="To date"
              value={customTo}
              onChange={handleCustomTo}
            />
          </div>
        )}

        <span className="filter-summary" aria-live="polite">
          {summaryText}
        </span>
      </div>

      {/* Category chips */}
      <div className="chip-row">
        <button onClick={handleAll} className="filter-chip filter-chip--all">
          All
        </button>
        <button onClick={handleNone} className="filter-chip filter-chip--none">
          None
        </button>

        {allCategories.map((cat) => {
          const isActive = activeCategories.has(cat)
          return (
            <button
              key={cat}
              className={`filter-chip${isActive ? ' filter-chip--active' : ''}`}
              aria-pressed={isActive}
              onClick={() => handleToggleCategory(cat)}
            >
              {cat}
            </button>
          )
        })}
      </div>
    </div>
  )
}
