import React from 'react'

export type LogDatePreset = 'this-month' | 'last-month' | 'all'

export interface LogFilterState {
  datePreset: LogDatePreset
  activeCategories: Set<string>   // categories included; empty Set means ALL categories included (no filter)
  incomeExpense: 'all' | 'income' | 'expenses'
  descriptionSearch: string
}

export const DEFAULT_LOG_FILTER: LogFilterState = {
  datePreset: 'all',
  activeCategories: new Set(),   // empty = no category filter applied
  incomeExpense: 'all',
  descriptionSearch: '',
}

interface LogFilterBarProps {
  filterState: LogFilterState
  allCategories: string[]
  onChange: (state: LogFilterState) => void
}

const DATE_PRESETS: { key: LogDatePreset; label: string }[] = [
  { key: 'this-month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'all', label: 'All' },
]

const INCOME_EXPENSE_OPTIONS: { key: LogFilterState['incomeExpense']; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
]

export function LogFilterBar({ filterState, allCategories, onChange }: LogFilterBarProps): JSX.Element {
  function handleChipToggle(cat: string): void {
    const next = new Set(filterState.activeCategories)
    if (next.has(cat)) {
      next.delete(cat)
    } else {
      next.add(cat)
    }
    onChange({ ...filterState, activeCategories: next })
  }

  return (
    <div className="log-filter-bar">
      {/* Row 1: date presets + income/expense toggle + description search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Date presets */}
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
          {DATE_PRESETS.map((preset, i) => {
            const isActive = filterState.datePreset === preset.key
            return (
              <button
                key={preset.key}
                className="preset-segment"
                onClick={() => onChange({ ...filterState, datePreset: preset.key })}
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

        {/* Income/expense toggle */}
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
          {INCOME_EXPENSE_OPTIONS.map((opt, i) => {
            const isActive = filterState.incomeExpense === opt.key
            return (
              <button
                key={opt.key}
                className="preset-segment"
                onClick={() => onChange({ ...filterState, incomeExpense: opt.key })}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  background: isActive ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                  color: isActive ? '#1a1d23' : 'var(--text-muted)',
                  border: 'none',
                  borderRight: i < INCOME_EXPENSE_OPTIONS.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
                  transition: 'background 0.15s, color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Description search */}
        <input
          type="text"
          placeholder="Search description..."
          value={filterState.descriptionSearch}
          onChange={(e) => onChange({ ...filterState, descriptionSearch: e.target.value })}
          style={{
            fontSize: 12,
            padding: '5px 10px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            outline: 'none',
            width: 180,
          }}
        />
      </div>

      {/* Row 2: category chips */}
      <div
        className="log-category-chips"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 2,
          scrollbarWidth: 'none',
        }}
      >
        {/* Clear chip — only when categories are selected */}
        {filterState.activeCategories.size > 0 && (
          <button
            onClick={() => onChange({ ...filterState, activeCategories: new Set() })}
            style={{
              borderRadius: 999, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)',
              color: 'var(--color-accent)', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Clear
          </button>
        )}

        {/* Category chips */}
        {allCategories.map((cat) => {
          const isActive = filterState.activeCategories.has(cat)
          return (
            <button
              key={cat}
              className="filter-chip"
              onClick={() => handleChipToggle(cat)}
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
                whiteSpace: 'nowrap',
                flexShrink: 0,
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
