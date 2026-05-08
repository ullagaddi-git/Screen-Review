import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

type StartHandler = (maxSeconds: number) => void

contextBridge.exposeInMainWorld('recorderBridge', {
  onStart: (handler: StartHandler) => {
    ipcRenderer.on('recorder:start', (_event: IpcRendererEvent, maxSeconds?: number) =>
      handler(typeof maxSeconds === 'number' && maxSeconds > 0 ? maxSeconds : 300)
    )
  },
  onStop: (handler: () => void) => {
    ipcRenderer.on('recorder:stop', handler)
  },
  sendAudio: (wav: ArrayBuffer) => {
    ipcRenderer.send('recorder:audio', wav)
  },
  sendError: (message: string) => {
    ipcRenderer.send('recorder:error', message)
  },
  sendReady: () => {
    ipcRenderer.send('recorder:ready')
  }
})
