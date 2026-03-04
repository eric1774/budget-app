import { useState, useMemo } from 'react'
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

const thBase: React.CSSProperties = {
  padding: '9px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  background: 'var(--bg-surface)',
  transition: 'color 150ms ease',
}

const thRight: React.CSSProperties = { ...thBase, textAlign: 'right' }

export function LogTab({ transactions, totalCount }: LogTabProps): JSX.Element {
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)

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

  function SortArrow({ col }: { col: SortCol }): JSX.Element | null {
    if (col !== sortCol) return null
    return (
      <svg
        style={{ marginLeft: 4, opacity: 0.7, verticalAlign: 'middle' }}
        width="9" height="9" viewBox="0 0 24 24" fill="currentColor"
      >
        {sortDir === 'asc'
          ? <path d="M12 4l8 16H4z"/>
          : <path d="M12 20L4 4h16z"/>
        }
      </svg>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Row count */}
      <div style={{
        padding: '8px 20px 6px',
        fontSize: 11,
        color: 'var(--text-muted)',
        flexShrink: 0,
        letterSpacing: '0.03em',
      }}>
        {transactions.length} of {totalCount} transactions
      </div>

      {/* Table scroll */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
        {sorted.length === 0 ? (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}>
            No transactions match your filters
          </div>
        ) : (
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thBase} onClick={() => handleSort('date')}>
                  Date<SortArrow col="date" />
                </th>
                <th style={thBase} onClick={() => handleSort('description')}>
                  Description<SortArrow col="description" />
                </th>
                <th style={thBase} onClick={() => handleSort('category')}>
                  Category<SortArrow col="category" />
                </th>
                <th style={thRight} onClick={() => handleSort('income')}>
                  Income<SortArrow col="income" />
                </th>
                <th style={thRight} onClick={() => handleSort('debit')}>
                  Debit<SortArrow col="debit" />
                </th>
                <th style={thRight} onClick={() => handleSort('balance')}>
                  Balance<SortArrow col="balance" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, i) => {
                const isHovered = hoveredRow === i
                return (
                  <tr
                    key={`${t.rowIndex}`}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      backgroundColor: isHovered
                        ? 'rgba(255,255,255,0.04)'
                        : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      transition: 'background-color 100ms ease',
                    }}
                  >
                    <td style={{
                      padding: '7px 14px',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border-subtle)',
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {fmtDate(t.date)}
                    </td>
                    <td style={{
                      padding: '7px 14px',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      borderBottom: '1px solid var(--border-subtle)',
                      maxWidth: 260,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {t.description}
                    </td>
                    <td style={{
                      padding: '7px 14px',
                      borderBottom: '1px solid var(--border-subtle)',
                      whiteSpace: 'nowrap',
                    }}>
                      <span className="cat-pill">{t.category}</span>
                    </td>
                    <td style={{
                      padding: '7px 14px',
                      fontSize: 13,
                      textAlign: 'right',
                      borderBottom: '1px solid var(--border-subtle)',
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {t.income > 0
                        ? <span style={{ color: 'var(--income)', fontWeight: 500 }}>{fmt.format(t.income)}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                      }
                    </td>
                    <td style={{
                      padding: '7px 14px',
                      fontSize: 13,
                      textAlign: 'right',
                      borderBottom: '1px solid var(--border-subtle)',
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {t.debit > 0
                        ? <span style={{ color: 'var(--expense)', fontWeight: 500 }}>{fmt.format(t.debit)}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                      }
                    </td>
                    <td style={{
                      padding: '7px 14px',
                      fontSize: 13,
                      textAlign: 'right',
                      borderBottom: '1px solid var(--border-subtle)',
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--balance)',
                      fontWeight: 500,
                    }}>
                      {fmt.format(t.balance)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
