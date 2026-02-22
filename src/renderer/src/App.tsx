import { useEffect, useState } from 'react'
import type { ParseResponse } from '../../shared/types'

// Relative path — in Electron dev mode, main process cwd is the project root.
// Plan 03 replaces this with the file picker flow (stored absolute path).
const BUDGET_PATH = 'Budget.xlsx'

export default function App(): JSX.Element {
  const [result, setResult] = useState<ParseResponse | null>(null)

  useEffect(() => {
    window.electronAPI.invoke('parse-file', BUDGET_PATH).then((res) => {
      setResult(res as ParseResponse)
    })
  }, [])

  if (!result) return <div>Loading...</div>
  if (!result.ok) return <div>Error: {result.error.message}</div>

  return (
    <div>
      <h1>Budget Dashboard</h1>
      <p>Transactions: {result.result.transactions.length}</p>
      <p>Categories: {result.result.categories.join(', ')}</p>
      {result.result.skippedRows > 0 && (
        <p>Skipped: {result.result.skippedRows} rows</p>
      )}
    </div>
  )
}
