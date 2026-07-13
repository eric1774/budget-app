import { createRequire } from 'module'
const XLSX = createRequire(import.meta.url)('xlsx')

const rows = [
  ['date', 'description', 'category', 'income', 'debit', 'balance'],
  ['2026-07-01', 'Paycheck', 'Income', 2500, '', 2500],
  ['2026-07-02', 'HEB', 'Groceries', '', 85.5, 2414.5],
  ['2026-07-03', 'Gas station', 'Auto & Gas', '', 40, 2374.5],
]
const ws = XLSX.utils.aoa_to_sheet(rows)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Logbook')
const out = process.argv[2] ?? 'fixture.xlsx'
XLSX.writeFile(wb, out)
console.log(`Fixture workbook written to ${out}`)
