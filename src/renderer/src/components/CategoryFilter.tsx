import { useState, useRef, useEffect } from 'react'

interface CategoryFilterProps {
  allCategories: string[]
  activeCategories: Set<string>
  onChange: (next: Set<string>) => void
  /**
   * include — dashboard semantics: the set lists what is shown; empty = nothing.
   * filter  — log semantics: the set narrows results; empty = no filter (all shown).
   */
  mode: 'include' | 'filter'
}

export function CategoryFilter({ allCategories, activeCategories, onChange, mode }: CategoryFilterProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
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
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Reset search each time the popover opens
  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  // Recompute the scroll hint when the popover opens or the list changes
  useEffect(() => {
    if (open) updateOverflow()
  }, [open, search, allCategories])

  const toggle = (cat: string): void => {
    const next = new Set(activeCategories)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    onChange(next)
  }

  const visible = search.trim() === ''
    ? allCategories
    : allCategories.filter((c) => c.toLowerCase().includes(search.trim().toLowerCase()))

  const isFiltered = mode === 'include'
    ? activeCategories.size < allCategories.length
    : activeCategories.size > 0

  const countText = mode === 'filter' && activeCategories.size === 0
    ? 'All'
    : `${activeCategories.size}/${allCategories.length}`

  return (
    <div className="cat-filter" ref={rootRef}>
      <button
        className={`cat-filter__btn${isFiltered ? ' cat-filter__btn--filtered' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        Categories
        <span className="cat-filter__count">{countText}</span>
      </button>

      {open && (
        <div className={`filter-popover${listOverflows ? ' filter-popover--overflowing' : ''}`} role="dialog" aria-label="Filter categories">
          <input
            type="search"
            className="filter-popover__search"
            placeholder="Search categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="filter-popover__actions">
            {mode === 'include' ? (
              <>
                <button className="filter-popover__action" onClick={() => onChange(new Set(allCategories))}>Select all</button>
                <button className="filter-popover__action" onClick={() => onChange(new Set())}>Clear</button>
              </>
            ) : (
              <button
                className="filter-popover__action"
                onClick={() => onChange(new Set())}
                disabled={activeCategories.size === 0}
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="filter-popover__list" ref={listRef} onScroll={updateOverflow}>
            {visible.length === 0 && (
              <span className="filter-popover__empty">No matches</span>
            )}
            {visible.map((cat) => {
              const isActive = activeCategories.has(cat)
              return (
                <label
                  key={cat}
                  className={`filter-popover__item${isActive ? ' filter-popover__item--checked' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggle(cat)}
                  />
                  {cat}
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
