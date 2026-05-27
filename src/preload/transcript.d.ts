export interface LiveTranscriptChunkEvent {
  text: string
  totalCount: number
}
export interface LiveTranscriptSavedEvent {
  filePath: string
}

export interface LiveTranscriptBridge {
  getCurrent: () => Promise<string[]>
  copyAll: () => Promise<{ count: number; characters: number }>
  copyLast: (n: number) => Promise<{ count: number; characters: number }>
  openFolder: (folder: string) => void
  showFile: (file: string) => void
  onChunk: (handler: (payload: LiveTranscriptChunkEvent) => void) => () => void
  onSaved: (handler: (payload: LiveTranscriptSavedEvent) => void) => () => void
}

declare global {
  interface Window {
    liveTranscriptBridge: LiveTranscriptBridge
  }
}

export {}
