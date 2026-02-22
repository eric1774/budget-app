export interface Transaction {
  date: Date           // parsed from Excel date serial or string
  description: string
  category: string
  income: number       // 0 if blank
  debit: number        // 0 if blank
  balance: number
  rowIndex: number     // 1-based Excel row number for debugging
}

export interface ParseResult {
  transactions: Transaction[]
  categories: string[]          // unique, sorted alphabetically
  skippedRows: number           // count of rows skipped due to bad data
  skippedReason?: string        // summary of skip reasons (for banner)
}

export type ParseError =
  | { kind: 'wrong-file-type'; message: string }
  | { kind: 'missing-sheet'; message: string }
  | { kind: 'missing-columns'; missing: string[]; message: string }
  | { kind: 'read-error'; message: string }

export type ParseResponse =
  | { ok: true; result: ParseResult }
  | { ok: false; error: ParseError }
