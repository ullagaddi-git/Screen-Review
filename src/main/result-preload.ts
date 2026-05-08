import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ResultPanelData } from '../preload/result'

type UpdateHandler = (data: ResultPanelData) => void

contextBridge.exposeInMainWorld('resultBridge', {
  getInitialData: (): Promise<ResultPanelData | null> =>
    ipcRenderer.invoke('result-panel:get-initial'),

  onUpdate: (handler: UpdateHandler): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: ResultPanelData): void => handler(data)
    ipcRenderer.on('result-panel:data', listener)
    return () => ipcRenderer.removeListener('result-panel:data', listener)
  },

  copyText: (text: string): Promise<void> => ipcRenderer.invoke('result-panel:copy-text', text),
  copyImage: (): Promise<void> => ipcRenderer.invoke('result-panel:copy-image'),
  dismiss: (): void => {
    ipcRenderer.send('result-panel:dismiss')
  },
  openExternal: (url: string): void => {
    ipcRenderer.send('result-panel:open-external', url)
  },
  openSettings: (tab?: string): Promise<void> => ipcRenderer.invoke('app:open-settings', tab)
})
