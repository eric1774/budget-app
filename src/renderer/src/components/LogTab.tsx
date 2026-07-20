import { useState, useMemo } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import type { Transaction } from '../../../shared/types'

type SortCol = 'date' | 'description' | 'category' | 'income' | 'debit' | 'balance'
type SortDir = 'asc' | 'desc'

interface LogTabProps {
  transactions: Transaction[]
  totalCount: number
}

const fmt = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

const COLUMNS: { col: SortCol; label: string; right?: boolean }[] = [
  { col: 'date', label: 'Date' },
  { col: 'description', label: 'Description' },
  { col: 'category', label: 'Category' },
  { col: 'income', label: 'Income', right: true },
  { col: 'debit', label: 'Debit', right: true },
  { col: 'balance', label: 'Balance', right: true },
]

// Mobile sort dropdown options (thead is hidden on small screens)
const MOBILE_SORTS: { value: string; label: string; col: SortCol; dir: SortDir }[] = [
  { value: 'date-desc', label: 'Newest first', col: 'date', dir: 'desc' },
  { value: 'date-asc', label: 'Oldest first', col: 'date', dir: 'asc' },
  { value: 'debit-desc', label: 'Largest debit', col: 'debit', dir: 'desc' },
  { value: 'income-desc', label: 'Largest income', col: 'income', dir: 'desc' },
  { value: 'description-asc', label: 'Description A–Z', col: 'description', dir: 'asc' },
]

export function LogTab({ transactions, totalCount }: LogTabProps): JSX.Element {
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(col: SortCol): void {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortDir(col === 'date' ? 'desc' : 'asc')
      setSortCol(col)
    }
  }

  const sorted = useMemo(() => {
    return [...transactions].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'date') { cmp = a.date.getTime() - b.date.getTime(); if (cmp === 0) return a.rowIndex - b.rowIndex }
      else if (sortCol === 'description') cmp = a.description.localeCompare(b.description)
      else if (sortCol === 'category')    cmp = a.category.localeCompare(b.category)
      else if (sortCol === 'income')      cmp = a.income - b.income
      else if (sortCol === 'debit')       cmp = a.debit - b.debit
      else if (sortCol === 'balance')     cmp = a.balance - b.balance
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [transactions, sortCol, sortDir])

  // Filtered-view money totals — the answer to "how much is this search?"
  const totalIn  = useMemo(() => transactions.reduce((s, t) => s + t.income, 0), [transactions])
  const totalOut = useMemo(() => transactions.reduce((s, t) => s + t.debit, 0), [transactions])

  const mobileSortValue = MOBILE_SORTS.find((o) => o.col === sortCol && o.dir === sortDir)?.value ?? 'date-desc'

  function SortArrow({ col }: { col: SortCol }): JSX.Element | null {
    if (col !== sortCol) return null
    return (
      <svg className="log-th__arrow" width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {sortDir === 'asc' ? <path d="M12 4l8 16H4z"/> : <path d="M12 20L4 4h16z"/>}
      </svg>
    )
  }

  return (
    <div className="log-tab">
      {/* Result count + filtered totals + mobile sort */}
      <div className="log-count">
        <span className="log-count__n">
          {transactions.length.toLocaleString('en-CA')} of {totalCount.toLocaleString('en-CA')} transactions
        </span>
        {transactions.length > 0 && (
          <span className="log-count__sums">
            {totalIn > 0 && <span className="log-count__in">↑ {fmt.format(totalIn)}</span>}
            {totalOut > 0 && <span className="log-count__out">↓ {fmt.format(totalOut)}</span>}
          </span>
        )}
        <select
          className="log-sort-mobile"
          value={mobileSortValue}
          onChange={(e) => {
            const opt = MOBILE_SORTS.find((o) => o.value === e.target.value)
            if (opt) { setSortCol(opt.col); setSortDir(opt.dir) }
          }}
          aria-label="Sort transactions"
        >
          {MOBILE_SORTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table scroll region */}
      <div className="log-scroll">
        {sorted.length === 0 ? (
          <div className="log-empty">
            <MagnifyingGlass size={26} weight="duotone" />
            <p>No transactions match your filters</p>
            <span>Try a broader date range or clear the search.</span>
          </div>
        ) : (
          <table className="log-table">
            <thead>
              <tr>
                {COLUMNS.map(({ col, label, right }) => (
                  <th
                    key={col}
                    className={`log-th${right ? ' log-th--right' : ''}`}
                    aria-sort={col === sortCol ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <button className="log-th__btn" onClick={() => handleSort(col)}>
                      {label}
                      <SortArrow col={col} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.rowIndex} className="log-row">
                  <td className="log-td log-td--date">{fmtDate(t.date)}</td>
                  <td className="log-td log-td--desc" title={t.description}>{t.description}</td>
                  <td className="log-td log-td--cat"><span className="cat-pill">{t.category}</span></td>
                  <td className={`log-td log-td--income${t.income > 0 ? '' : ' log-td--blank'}`}>
                    {t.income > 0 ? <span className="log-amt log-amt--in">{fmt.format(t.income)}</span> : <span className="log-dash">—</span>}
                  </td>
                  <td className={`log-td log-td--debit${t.debit > 0 ? '' : ' log-td--blank'}`}>
                    {t.debit > 0 ? <span className="log-amt log-amt--out">−{fmt.format(t.debit)}</span> : <span className="log-dash">—</span>}
                  </td>
                  <td className="log-td log-td--balance">{fmt.format(t.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
