import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

type StartHandler = (
  maxSeconds: number,
  streamMode: boolean,
  meetingMode: boolean
) => void

contextBridge.exposeInMainWorld('recorderBridge', {
  onStart: (handler: StartHandler) => {
    ipcRenderer.on(
      'recorder:start',
      (
        _event: IpcRendererEvent,
        maxSeconds?: number,
        streamMode?: boolean,
        meetingMode?: boolean
      ) =>
        handler(
          typeof maxSeconds === 'number' && maxSeconds > 0 ? maxSeconds : 300,
          streamMode === true,
          meetingMode === true
        )
    )
  },
  onStop: (handler: () => void) => {
    ipcRenderer.on('recorder:stop', handler)
  },
  /**
   * Final WAV for the entire recording (batch mode) OR the residual
   * tail-end of a stream-mode session (any audio captured since the
   * last interim chunk was flushed).
   */
  sendAudio: (wav: ArrayBuffer) => {
    ipcRenderer.send('recorder:audio', wav)
  },
  /**
   * Stream mode only: an interim chunk emitted ~every 3 s while
   * recording continues. Main pipes these into stream-transcribe.
   */
  sendAudioChunk: (wav: ArrayBuffer) => {
    ipcRenderer.send('recorder:audio-chunk', wav)
  },
  sendError: (message: string) => {
    ipcRenderer.send('recorder:error', message)
  },
  sendReady: () => {
    ipcRenderer.send('recorder:ready')
  }
})
