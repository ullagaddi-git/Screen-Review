export interface RecorderBridge {
  onStart: (
    handler: (maxSeconds: number, streamMode: boolean, meetingMode: boolean) => void
  ) => void
  onStop: (handler: () => void) => void
  /** Final WAV at end of session (batch) or residual tail (stream). */
  sendAudio: (wav: ArrayBuffer) => void
  /** Interim WAV chunk during a stream-mode session (every ~3 s). */
  sendAudioChunk: (wav: ArrayBuffer) => void
  sendError: (message: string) => void
  sendReady: () => void
}

declare global {
  interface Window {
    recorderBridge: RecorderBridge
  }
}

export {}
