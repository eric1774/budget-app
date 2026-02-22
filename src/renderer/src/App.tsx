import { useEffect, useState } from 'react'

export default function App(): JSX.Element {
  const [ipc, setIpc] = useState<string>('...')

  useEffect(() => {
    window.electronAPI.invoke('ping').then((result) => setIpc(result as string))
  }, [])

  return (
    <div>
      <h1>Budget Dashboard</h1>
      <p>Phase 1 — Data Foundation</p>
      <p>IPC: {ipc}</p>
    </div>
  )
}
