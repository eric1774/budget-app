import * as XLSX from 'xlsx'

// Generates a minimal valid Budget workbook (Logbook sheet, real header names).
// The category column header must be literally 'category' — excel.ts matches
// REQUIRED_COLUMNS case-insensitively and has no 'Budget'→'category' alias.
// NEVER point tests at Eric's real Budget .xlsx files.
export function writeFixtureWorkbook(filePath: string): void {
  const rows = [
    ['date', 'description', 'category', 'income', 'debit', 'balance'],
    ['2026-07-01', 'Paycheck', 'Income', 2500, '', 2500],
    ['2026-07-02', 'HEB', 'Groceries', '', 85.5, 2414.5],
    ['2026-07-03', 'Gas station', 'Auto & Gas', '', 40, 2374.5],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Logbook')
  XLSX.writeFile(wb, filePath)
}
