import { contextBridge, ipcRenderer } from 'electron'

export interface RegionRect {
  x: number
  y: number
  w: number
  h: number
}

contextBridge.exposeInMainWorld('regionBridge', {
  complete: (rect: RegionRect): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('region:complete', rect),
  cancel: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('region:cancel')
})
