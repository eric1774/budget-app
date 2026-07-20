import React, { useState, useRef, useEffect } from 'react'

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

  const [catOpen, setCatOpen] = useState(false)
  const [catSearch, setCatSearch] = useState('')
  const catRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // True while the list has more content below the fold (drives the fade hint)
  const [listOverflows, setListOverflows] = useState(false)

  const updateOverflow = (): void => {
    const el = listRef.current
    if (!el) return
    setListOverflows(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
  }

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!catOpen) return
    const onDown = (e: MouseEvent): void => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setCatOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [catOpen])

  // Reset search each time the popover opens
  useEffect(() => {
    if (catOpen) setCatSearch('')
  }, [catOpen])

  // Recompute the scroll hint when the popover opens or the list changes
  useEffect(() => {
    if (catOpen) updateOverflow()
  }, [catOpen, catSearch, allCategories])

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
  const hiddenCount = allCategories.length - activeCategories.size
  const visibleCategories = catSearch.trim() === ''
    ? allCategories
    : allCategories.filter((c) => c.toLowerCase().includes(catSearch.trim().toLowerCase()))

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

        {/* Category filter — compact popover */}
        <div className="cat-filter" ref={catRef}>
          <button
            className={`cat-filter__btn${hiddenCount > 0 ? ' cat-filter__btn--filtered' : ''}`}
            onClick={() => setCatOpen((v) => !v)}
            aria-expanded={catOpen}
            aria-haspopup="true"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Categories
            <span className="cat-filter__count">
              {activeCategories.size}/{allCategories.length}
            </span>
          </button>

          {catOpen && (
            <div className={`filter-popover${listOverflows ? ' filter-popover--overflowing' : ''}`} role="dialog" aria-label="Filter categories">
              <input
                type="search"
                className="filter-popover__search"
                placeholder="Search categories…"
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                autoFocus
              />
              <div className="filter-popover__actions">
                <button className="filter-popover__action" onClick={handleAll}>Select all</button>
                <button className="filter-popover__action" onClick={handleNone}>Clear</button>
              </div>
              <div className="filter-popover__list" ref={listRef} onScroll={updateOverflow}>
                {visibleCategories.length === 0 && (
                  <span className="filter-popover__empty">No matches</span>
                )}
                {visibleCategories.map((cat) => {
                  const isActive = activeCategories.has(cat)
                  return (
                    <label
                      key={cat}
                      className={`filter-popover__item${isActive ? ' filter-popover__item--checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => handleToggleCategory(cat)}
                      />
                      {cat}
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <span className="filter-summary" aria-live="polite">
          {summaryText}
        </span>
      </div>
    </div>
  )
}
