import { useState, useMemo } from 'react'
import type { Transaction } from '../../../shared/types'

type SortCol = 'date' | 'description' | 'category' | 'income' | 'debit' | 'balance'
type SortDir = 'asc' | 'desc'

interface LogTabProps {
  transactions: Transaction[]   // filtered by parent
  totalCount: number            // total transactions before any filter
}

const fmt = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD locale format
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  whiteSpace: 'nowrap',
  background: 'rgba(255,255,255,0.02)',
}

const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: 'right' }

const tdStyle: React.CSSProperties = {
  padding: '5px 12px',
  fontSize: 13,
  color: 'var(--text-primary)',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  whiteSpace: 'nowrap',
}

const tdStyleRight: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

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
      if (sortCol === 'date') cmp = a.date.getTime() - b.date.getTime()
      else if (sortCol === 'description') cmp = a.description.localeCompare(b.description)
      else if (sortCol === 'category') cmp = a.category.localeCompare(b.category)
      else if (sortCol === 'income') cmp = a.income - b.income
      else if (sortCol === 'debit') cmp = a.debit - b.debit
      else if (sortCol === 'balance') cmp = a.balance - b.balance
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [transactions, sortCol, sortDir])

  function SortIndicator({ col }: { col: SortCol }): JSX.Element | null {
    if (col !== sortCol) return null
    return <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Row count */}
      <div style={{ padding: '8px 16px 4px', fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
        Showing {transactions.length} of {totalCount} transactions
      </div>

      {/* Table scroll wrapper */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
        {sorted.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No transactions match your filters
          </div>
        ) : (
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort('date')}>
                  Date<SortIndicator col="date" />
                </th>
                <th style={thStyle} onClick={() => handleSort('description')}>
                  Description<SortIndicator col="description" />
                </th>
                <th style={thStyle} onClick={() => handleSort('category')}>
                  Category<SortIndicator col="category" />
                </th>
                <th style={thStyleRight} onClick={() => handleSort('income')}>
                  Income<SortIndicator col="income" />
                </th>
                <th style={thStyleRight} onClick={() => handleSort('debit')}>
                  Debit<SortIndicator col="debit" />
                </th>
                <th style={thStyleRight} onClick={() => handleSort('balance')}>
                  Balance<SortIndicator col="balance" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, i) => (
                <tr
                  key={`${t.rowIndex}`}
                  style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                >
                  <td style={tdStyle}>{fmtDate(t.date)}</td>
                  <td style={{ ...tdStyle, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.description}
                  </td>
                  <td style={tdStyle}>{t.category}</td>
                  <td style={tdStyleRight}>
                    {t.income > 0 ? (
                      <span style={{ color: 'var(--color-income)' }}>{fmt.format(t.income)}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyleRight}>
                    {t.debit > 0 ? (
                      <span style={{ color: 'var(--color-expense)' }}>{fmt.format(t.debit)}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdStyleRight, color: 'var(--color-balance)' }}>{fmt.format(t.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
