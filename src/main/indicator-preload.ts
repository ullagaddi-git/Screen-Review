import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

type StateHandler = (event: IpcRendererEvent, payload: { state: string }) => void

contextBridge.exposeInMainWorld('indicatorBridge', {
  onState: (handler: StateHandler) => {
    ipcRenderer.on('voice:state', handler)
  },
  offState: (handler: StateHandler) => {
    ipcRenderer.removeListener('voice:state', handler)
  }
})
