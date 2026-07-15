import * as XLSX from 'xlsx'

// Generates a minimal valid Budget workbook (Logbook sheet, real header names).
// excel.ts matches REQUIRED_COLUMNS case-insensitively and aliases
// 'Budget'→'category'; when both headers exist the leftmost ('Budget') wins.
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

// Mirrors the real Logbook layout: 'Budget' (left) AND 'category' (right)
// both present with different values. The parser must use 'Budget'.
export function writeFixtureWorkbookWithBothColumns(filePath: string): void {
  const rows = [
    ['date', 'description', 'Budget', 'income', 'debit', 'balance', 'category'],
    ['2026-07-01', 'Paycheck', 'Income', 2500, '', 2500, 'Eric Income'],
    ['2026-07-02', 'Joes BBQ', 'Dining Out', '', 35.42, 2464.58, 'Resturaunts'],
    ['2026-07-03', 'ChatGPT', 'Subscriptions', '', 20, 2444.58, ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Logbook')
  XLSX.writeFile(wb, filePath)
}
