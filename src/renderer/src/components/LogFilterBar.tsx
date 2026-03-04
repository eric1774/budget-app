import React from 'react'

export type LogDatePreset = 'this-month' | 'specific-month' | 'all'

export interface LogFilterState {
  datePreset: LogDatePreset
  selectedMonthYear: string | null
  activeCategories: Set<string>
  incomeExpense: 'all' | 'income' | 'expenses'
  descriptionSearch: string
}

export const DEFAULT_LOG_FILTER: LogFilterState = {
  datePreset: 'all',
  selectedMonthYear: null,
  activeCategories: new Set(),
  incomeExpense: 'all',
  descriptionSearch: '',
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface LogFilterBarProps {
  filterState: LogFilterState
  allCategories: string[]
  availableMonths: string[]
  onChange: (state: LogFilterState) => void
}

const TOP_PRESETS: { key: LogDatePreset; label: string }[] = [
  { key: 'this-month', label: 'This Month' },
  { key: 'all', label: 'All' },
]

const INCOME_EXPENSE_OPTIONS: { key: LogFilterState['incomeExpense']; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'income',   label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
]

function segmentGroup(children: React.ReactNode): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      borderRadius: 8,
      overflow: 'hidden',
      border: '1px solid var(--border)',
      background: 'rgba(255,255,255,0.03)',
    }}>
      {children}
    </div>
  )
}

function segBtn(
  label: string,
  isActive: boolean,
  onClick: () => void,
  isLast = false,
): JSX.Element {
  return (
    <button
      key={label}
      className="preset-segment"
      onClick={onClick}
      style={{
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: isActive ? 600 : 400,
        fontFamily: 'inherit',
        cursor: 'pointer',
        background: isActive ? 'var(--accent)' : 'transparent',
        color: isActive ? '#080B10' : 'var(--text-muted)',
        border: 'none',
        borderRight: !isLast ? '1px solid var(--border)' : 'none',
        whiteSpace: 'nowrap',
        minHeight: 34,
        transition: 'background 150ms ease, color 150ms ease',
      }}
    >
      {label}
    </button>
  )
}

export function LogFilterBar({ filterState, allCategories, availableMonths, onChange }: LogFilterBarProps): JSX.Element {
  function handleChipToggle(cat: string): void {
    const next = new Set(filterState.activeCategories)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    onChange({ ...filterState, activeCategories: next })
  }

  return (
    <div className="log-filter-bar">
      {/* Row 1: date + type toggle + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

        {segmentGroup(
          TOP_PRESETS.map((preset, i) =>
            segBtn(
              preset.label,
              filterState.datePreset === preset.key,
              () => onChange({ ...filterState, datePreset: preset.key, selectedMonthYear: null }),
              i === TOP_PRESETS.length - 1,
            )
          )
        )}

        {segmentGroup(
          INCOME_EXPENSE_OPTIONS.map((opt, i) =>
            segBtn(
              opt.label,
              filterState.incomeExpense === opt.key,
              () => onChange({ ...filterState, incomeExpense: opt.key }),
              i === INCOME_EXPENSE_OPTIONS.length - 1,
            )
          )
        )}

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg
            width="12" height="12"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 9, color: 'var(--text-muted)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={filterState.descriptionSearch}
            onChange={(e) => onChange({ ...filterState, descriptionSearch: e.target.value })}
            style={{
              fontSize: 12,
              padding: '5px 10px 5px 28px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              outline: 'none',
              width: 160,
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Month picker chips */}
      {availableMonths.length > 0 && (
        <div
          className="log-category-chips"
          style={{
            display: 'flex',
            gap: 5,
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 1,
            scrollbarWidth: 'none',
          }}
        >
          {availableMonths.map((ym) => {
            const [y, m] = ym.split('-')
            const label    = `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y.slice(2)}`
            const isActive = filterState.datePreset === 'specific-month' && filterState.selectedMonthYear === ym
            return (
              <button
                key={ym}
                onClick={() => onChange({ ...filterState, datePreset: 'specific-month', selectedMonthYear: ym })}
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
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Category chips */}
      <div
        className="log-category-chips"
        style={{
          display: 'flex',
          gap: 5,
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 1,
          scrollbarWidth: 'none',
        }}
      >
        {filterState.activeCategories.size > 0 && (
          <button
            onClick={() => onChange({ ...filterState, activeCategories: new Set() })}
            style={{
              borderRadius: 99, padding: '3px 11px', fontSize: 11,
              fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              border: '1px solid rgba(45,212,191,0.35)', background: 'transparent',
              color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Clear
          </button>
        )}

        {allCategories.map((cat) => {
          const isActive = filterState.activeCategories.has(cat)
          return (
            <button
              key={cat}
              className="filter-chip"
              onClick={() => handleChipToggle(cat)}
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
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease',
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
