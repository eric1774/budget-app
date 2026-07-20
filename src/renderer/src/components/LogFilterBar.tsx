import { useRef, useEffect } from 'react'
import { CategoryFilter } from './CategoryFilter'

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

const INCOME_EXPENSE_OPTIONS: { key: LogFilterState['incomeExpense']; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'income',   label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
]

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
}

export function LogFilterBar({ filterState, allCategories, availableMonths, onChange }: LogFilterBarProps): JSX.Element {
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" focuses search from anywhere on the page (unless already typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '/') return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Month dropdown value: preset or a specific YYYY-MM
  const monthValue = filterState.datePreset === 'specific-month' && filterState.selectedMonthYear
    ? filterState.selectedMonthYear
    : filterState.datePreset

  const handleMonthChange = (value: string): void => {
    if (value === 'all' || value === 'this-month') {
      onChange({ ...filterState, datePreset: value, selectedMonthYear: null })
    } else {
      onChange({ ...filterState, datePreset: 'specific-month', selectedMonthYear: value })
    }
  }

  return (
    <div className="log-filter-bar">
      <div className="filter-bar-top">
        {/* Search — the primary control */}
        <div className="log-search">
          <svg
            className="log-search__icon"
            width="13" height="13"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchRef}
            type="search"
            className="log-search__input"
            placeholder="Search transactions…  ( / )"
            aria-label="Search transaction descriptions"
            value={filterState.descriptionSearch}
            onChange={(e) => onChange({ ...filterState, descriptionSearch: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && filterState.descriptionSearch !== '') {
                e.stopPropagation()
                onChange({ ...filterState, descriptionSearch: '' })
              }
            }}
          />
          {filterState.descriptionSearch !== '' && (
            <button
              className="log-search__clear"
              onClick={() => onChange({ ...filterState, descriptionSearch: '' })}
              aria-label="Clear search"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Month dropdown — replaces the scrolling month chip row */}
        <select
          className="log-month-select"
          value={monthValue}
          onChange={(e) => handleMonthChange(e.target.value)}
          aria-label="Filter by month"
        >
          <option value="all">All time</option>
          <option value="this-month">This month</option>
          {availableMonths.map((ym) => (
            <option key={ym} value={ym}>{monthLabel(ym)}</option>
          ))}
        </select>

        {/* Income / expense segmented toggle */}
        <div className="date-preset-group" role="group" aria-label="Transaction type">
          {INCOME_EXPENSE_OPTIONS.map((opt) => {
            const isActive = filterState.incomeExpense === opt.key
            return (
              <button
                key={opt.key}
                className={`preset-segment${isActive ? ' preset-segment--active' : ''}`}
                aria-pressed={isActive}
                onClick={() => onChange({ ...filterState, incomeExpense: opt.key })}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <CategoryFilter
          mode="filter"
          allCategories={allCategories}
          activeCategories={filterState.activeCategories}
          onChange={(next) => onChange({ ...filterState, activeCategories: next })}
        />
      </div>
    </div>
  )
}
