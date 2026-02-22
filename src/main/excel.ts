import * as XLSX from 'xlsx'
import { extname } from 'path'
import type { ParseResponse, Transaction } from '../shared/types'

// Required column names — matched case-insensitively against actual headers.
// 'description' also matches 'decription' (typo in Budget.xlsx) via fuzzy fallback.
const REQUIRED_COLUMNS = ['date', 'description', 'category', 'income', 'debit', 'balance']

/**
 * Normalize a header string for matching: lowercase + trim.
 * Also handle the known typo "decription" → treat as "description".
 */
function normalizeHeader(h: string): string {
  const s = h.toLowerCase().trim()
  if (s === 'decription') return 'description'
  return s
}

export function parseWorkbook(filePath: string): ParseResponse {
  try {
    // Validate file extension
    const ext = extname(filePath).toLowerCase()
    if (ext !== '.xlsx' && ext !== '.xls') {
      return {
        ok: false,
        error: { kind: 'wrong-file-type', message: 'Expected .xlsx or .xls file' }
      }
    }

    const workbook = XLSX.readFile(filePath, { cellDates: true, dense: false })

    // Validate Logbook sheet exists
    const sheet = workbook.Sheets['Logbook']
    if (!sheet) {
      return {
        ok: false,
        error: {
          kind: 'missing-sheet',
          message: `No sheet named "Logbook" found. Available sheets: ${workbook.SheetNames.join(', ')}`
        }
      }
    }

    // Convert to rows — header: 1 gives arrays; first row is headers
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

    if (rows.length === 0) {
      return {
        ok: false,
        error: {
          kind: 'missing-columns',
          missing: REQUIRED_COLUMNS,
          message: 'Logbook sheet is empty'
        }
      }
    }

    // Normalize headers for matching
    const rawHeaders = (rows[0] as unknown[]).map((h) => (h != null ? String(h) : ''))
    const normalizedHeaders = rawHeaders.map(normalizeHeader)

    // Validate required columns are present (after normalization)
    const missing = REQUIRED_COLUMNS.filter((col) => !normalizedHeaders.includes(col))
    if (missing.length > 0) {
      return {
        ok: false,
        error: {
          kind: 'missing-columns',
          missing,
          message: `Logbook is missing required columns: ${missing.join(', ')}. Found: ${rawHeaders.filter(Boolean).join(', ')}`
        }
      }
    }

    // Map normalized column names to indices
    const colIndex: Record<string, number> = {}
    for (const col of REQUIRED_COLUMNS) {
      colIndex[col] = normalizedHeaders.indexOf(col)
    }

    const transactions: Transaction[] = []
    let skippedRows = 0

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[]

      const rawCategory = row[colIndex['category']]
      const rawIncome = row[colIndex['income']]
      const rawDebit = row[colIndex['debit']]
      const rawDate = row[colIndex['date']]
      const rawDescription = row[colIndex['description']]
      const rawBalance = row[colIndex['balance']]

      // Skip if category is blank
      if (rawCategory == null || String(rawCategory).trim() === '') {
        skippedRows++
        continue
      }

      // Parse income and debit values
      const incomeStr = rawIncome != null ? String(rawIncome).trim() : ''
      const debitStr = rawDebit != null ? String(rawDebit).trim() : ''
      const incomeVal = incomeStr === '' ? 0 : parseFloat(incomeStr)
      const debitVal = debitStr === '' ? 0 : parseFloat(debitStr)

      // Skip if non-numeric (and non-blank) income or debit
      if (incomeStr !== '' && isNaN(incomeVal)) {
        skippedRows++
        continue
      }
      if (debitStr !== '' && isNaN(debitVal)) {
        skippedRows++
        continue
      }

      // Skip if both income and debit are blank/zero
      if (incomeVal === 0 && debitVal === 0 && incomeStr === '' && debitStr === '') {
        skippedRows++
        continue
      }

      // Parse date
      let date: Date
      if (rawDate instanceof Date) {
        date = rawDate
      } else if (rawDate == null) {
        skippedRows++
        continue
      } else {
        date = new Date(String(rawDate))
        if (isNaN(date.getTime())) {
          skippedRows++
          continue
        }
      }

      // Parse balance (may be 0 or blank on first rows)
      const balanceStr = rawBalance != null ? String(rawBalance).trim() : ''
      const balance = balanceStr === '' ? 0 : parseFloat(balanceStr)

      transactions.push({
        date,
        description: rawDescription != null ? String(rawDescription).trim() : '',
        category: String(rawCategory).trim(),
        income: isNaN(incomeVal) ? 0 : incomeVal,
        debit: isNaN(debitVal) ? 0 : debitVal,
        balance: isNaN(balance) ? 0 : balance,
        rowIndex: i + 1  // 1-based Excel row (header is row 1, first data row is row 2)
      })
    }

    const categories = [...new Set(transactions.map((t) => t.category))].sort()

    return {
      ok: true,
      result: {
        transactions,
        categories,
        skippedRows,
        skippedReason:
          skippedRows > 0
            ? `${skippedRows} rows skipped due to missing required fields`
            : undefined
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { kind: 'read-error', message } }
  }
}
