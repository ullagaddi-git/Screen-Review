import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface LiveTranscriptChunkEvent {
  text: string
  totalCount: number
}
export interface LiveTranscriptSavedEvent {
  filePath: string
}

type ChunkHandler = (payload: LiveTranscriptChunkEvent) => void
type SavedHandler = (payload: LiveTranscriptSavedEvent) => void

contextBridge.exposeInMainWorld('liveTranscriptBridge', {
  /** Fetch all transcript chunks accumulated so far. Returned in arrival order. */
  getCurrent: (): Promise<string[]> => ipcRenderer.invoke('live-transcript:get-current'),

  /** Copy the entire transcript to the clipboard. */
  copyAll: (): Promise<{ count: number; characters: number }> =>
    ipcRenderer.invoke('live-transcript:copy-all'),

  /** Copy only the most recent N chunks (default 5). */
  copyLast: (n: number): Promise<{ count: number; characters: number }> =>
    ipcRenderer.invoke('live-transcript:copy-last', n),

  /** Open the meetings folder. */
  openFolder: (folder: string): void => {
    ipcRenderer.send('live-transcript:open-folder', folder)
  },

  /** Reveal the saved transcript file in Explorer. */
  showFile: (file: string): void => {
    ipcRenderer.send('live-transcript:show-file', file)
  },

  /** Subscribe to new chunks as they arrive. */
  onChunk: (handler: ChunkHandler): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: LiveTranscriptChunkEvent): void =>
      handler(payload)
    ipcRenderer.on('live-transcript:chunk', listener)
    return () => ipcRenderer.removeListener('live-transcript:chunk', listener)
  },

  /** Subscribe to the "meeting saved" event (fires when the user stops the meeting). */
  onSaved: (handler: SavedHandler): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: LiveTranscriptSavedEvent): void =>
      handler(payload)
    ipcRenderer.on('live-transcript:saved', listener)
    return () => ipcRenderer.removeListener('live-transcript:saved', listener)
  }
})
