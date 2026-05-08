export interface RecorderBridge {
  onStart: (handler: (maxSeconds: number) => void) => void
  onStop: (handler: () => void) => void
  sendAudio: (wav: ArrayBuffer) => void
  sendError: (message: string) => void
  sendReady: () => void
}

declare global {
  interface Window {
    recorderBridge: RecorderBridge
  }
}

export {}
