import { contextBridge, ipcRenderer } from 'electron'

// Generic invoke wrapper — supports all future IPC channels without rewriting preload
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args)
})
