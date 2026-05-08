import { contextBridge, ipcRenderer } from 'electron'
import type { OllamaCheckResult } from './ipc/ai-types'

export type PickerCaptureMode = 'region' | 'window' | 'desktop' | 'autoscroll'

contextBridge.exposeInMainWorld('pickerBridge', {
  selectMode: (mode: PickerCaptureMode): void => {
    ipcRenderer.send('capture:mode-selected', mode)
  },
  cancel: (): void => {
    ipcRenderer.send('capture:cancel')
  },
  checkOllama: (): Promise<OllamaCheckResult> => ipcRenderer.invoke('ollama:check'),
  getTargetTitle: (): Promise<string | null> => ipcRenderer.invoke('capture:target-title')
})
