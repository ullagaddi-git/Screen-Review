import { app, BrowserWindow, ipcMain, session } from 'electron'
import { resolvePreloadPath, resolveRendererPath } from '../utils/paths'
import { getConfigValue } from './store'
import { streamTranscribeService } from './stream-transcribe'

const isDev = !app.isPackaged
const RECORDER_TIMEOUT_MS = 5000
/** Hard upper bound on recording length, regardless of user config. Safety net. */
const HARD_MAX_RECORDING_SECONDS = 60 * 60 // 60 minutes
const DEFAULT_MAX_RECORDING_SECONDS = 300 // 5 minutes
/**
 * After this much idle time post-recording, destroy the recorder window to
 * recover ~30–45MB of Chromium overhead. The next recording will pay a
 * ~200ms re-creation cost — acceptable trade for users who only dictate
 * occasionally. (TASK-043 idle-memory optimization.)
 */
const RECORDER_IDLE_DESTROY_MS = 5 * 60 * 1000 // 5 minutes

class AudioService {
  private window: BrowserWindow | null = null
  private ready = false
  private readyWaiters: Array<() => void> = []
  private pendingStop:
    | { resolve: (buf: Buffer) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
    | null = null
  private recording = false
  private listenersBound = false
  private autoStopHandler: ((buf: Buffer) => void) | null = null
  /**
   * Tracks an in-flight startRecording() so that a quick stopRecording()
   * (e.g. user taps the hotkey for <100ms) waits for the start to complete
   * before sending the stop signal — otherwise we race and get 0 bytes back.
   */
  private startInProgress: Promise<void> | null = null
  /** Timer that destroys the idle recorder window to reclaim memory. */
  private idleDestroyTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * Snapshot of the session mode captured at startRecording. Drives:
   *  - 'batch'  : current default — full WAV returned at stop, caller
   *               transcribes via whisper + pastes via paste.ts.
   *  - 'stream' : interim chunks streamed to stream-transcribe with
   *               sink='paste', no final batch — text is already in
   *               the target app.
   *  - 'meeting': same chunk streaming but with sink='meeting' and the
   *               recorder captures mic + system audio mixed. Caller
   *               (meeting.ts) drains stream-transcribe at stop and
   *               saves the transcript .txt.
   */
  private sessionMode: 'batch' | 'stream' | 'meeting' = 'batch'

  isRecording(): boolean {
    return this.recording
  }

  /**
   * Was the currently-active (or most-recently-completed) recording
   * captured in stream-or-meeting mode? Voice IPC checks this to decide
   * whether to do a final batch paste at hotkey release — in those
   * modes the text is already in the target app (stream) or
   * accumulated for save (meeting), so the final paste is a no-op.
   */
  isStreamSession(): boolean {
    return this.sessionMode !== 'batch'
  }

  /** True if the active session was a meeting (mic + system audio). */
  isMeetingSession(): boolean {
    return this.sessionMode === 'meeting'
  }

  /**
   * Schedule destruction of the idle recorder window after
   * RECORDER_IDLE_DESTROY_MS. Cancelled if a new recording starts.
   * Idempotent — calling repeatedly resets the same timer.
   */
  private scheduleIdleDestroy(): void {
    if (this.idleDestroyTimer) clearTimeout(this.idleDestroyTimer)
    this.idleDestroyTimer = setTimeout(() => {
      this.idleDestroyTimer = null
      if (this.recording) return // Should never happen, but guard anyway.
      if (this.window && !this.window.isDestroyed()) {
        console.log('[audio] recorder idle for 5min — destroying to free memory')
        this.window.destroy()
        this.window = null
        this.ready = false
      }
    }, RECORDER_IDLE_DESTROY_MS)
  }

  private cancelIdleDestroy(): void {
    if (this.idleDestroyTimer) {
      clearTimeout(this.idleDestroyTimer)
      this.idleDestroyTimer = null
    }
  }

  /**
   * Called when the renderer auto-stops recording (e.g. hits the 60s cap)
   * before main has requested stop. The handler receives the buffer that the
   * renderer captured up to that point.
   */
  setAutoStopHandler(handler: ((buf: Buffer) => void) | null): void {
    this.autoStopHandler = handler
  }

  async startRecording(options?: {
    forceStream?: boolean
    /**
     * Force a meeting session — captures mic + system audio mixed and
     * uses stream-transcribe with sink='meeting'. Implies forceStream.
     */
    forceMeeting?: boolean
  }): Promise<void> {
    if (this.recording) return
    if (this.startInProgress) return this.startInProgress

    // Cancel any pending idle-destroy — we're about to use the window again.
    this.cancelIdleDestroy()

    // Mark recording=true synchronously so an immediately-following
    // stopRecording() knows there's work to wait for. The actual
    // window setup + 'recorder:start' send happens in the awaitable.
    this.recording = true

    this.startInProgress = (async () => {
      try {
        await this.ensureWindow()
        // Read the user's configured max length each time, clamped to a hard
        // safety cap so a corrupt config can't make the recorder run for days.
        const configured = Number(getConfigValue('voiceMaxSeconds'))
        const maxSeconds =
          Number.isFinite(configured) && configured > 0
            ? Math.min(configured, HARD_MAX_RECORDING_SECONDS)
            : DEFAULT_MAX_RECORDING_SECONDS

        // Capture session mode once at start. Changing the setting
        // mid-session shouldn't reroute audio paths halfway through.
        // forceMeeting > forceStream > config default. Meeting implies
        // streaming (chunks).
        if (options?.forceMeeting === true) {
          this.sessionMode = 'meeting'
        } else if (
          options?.forceStream === true ||
          !!getConfigValue('voiceStreamPaste')
        ) {
          this.sessionMode = 'stream'
        } else {
          this.sessionMode = 'batch'
        }
        if (this.sessionMode !== 'batch') {
          streamTranscribeService.beginSession(
            this.sessionMode === 'meeting' ? 'meeting' : 'paste'
          )
        }

        this.window?.webContents.send(
          'recorder:start',
          maxSeconds,
          this.sessionMode === 'stream' || this.sessionMode === 'meeting',
          this.sessionMode === 'meeting'
        )
      } finally {
        this.startInProgress = null
      }
    })()

    return this.startInProgress
  }

  async stopRecording(): Promise<Buffer> {
    // If a start is mid-flight, wait for it to finish — otherwise the renderer
    // never gets the 'recorder:start' message and our 'recorder:stop' arrives
    // at a recorder that has nothing to stop, returning 0 bytes.
    if (this.startInProgress) {
      try {
        await this.startInProgress
      } catch {
        // ensureWindow failures will surface via the pending stop's reject
      }
    }

    if (!this.recording) {
      return Buffer.alloc(0)
    }
    this.recording = false

    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingStop) {
          this.pendingStop = null
          reject(new Error(`Recorder did not respond within ${RECORDER_TIMEOUT_MS}ms`))
        }
      }, RECORDER_TIMEOUT_MS)
      this.pendingStop = {
        resolve: (buf) => {
          // Recording finished — schedule idle destroy so a one-off voice
          // user doesn't pay ~40MB indefinitely.
          this.scheduleIdleDestroy()
          resolve(buf)
        },
        reject,
        timer
      }
      this.window?.webContents.send('recorder:stop')
    })
  }

  destroy(): void {
    this.cancelIdleDestroy()
    this.bindListeners() // ensure handlers are removed if needed
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
    this.ready = false
  }

  private ensureWindow(): Promise<void> {
    this.bindListeners()
    if (this.window && !this.window.isDestroyed() && this.ready) {
      return Promise.resolve()
    }

    if (!this.window || this.window.isDestroyed()) {
      this.ready = false
      this.window = new BrowserWindow({
        width: 1,
        height: 1,
        x: -10000,
        y: -10000,
        show: false,
        focusable: false,
        skipTaskbar: true,
        autoHideMenuBar: true,
        webPreferences: {
          preload: resolvePreloadPath('recorder'),
          // Sandbox is safe — preload only uses contextBridge + ipcRenderer,
          // and the renderer's MediaRecorder/getUserMedia work fine in
          // sandboxed contexts (they're standard Web APIs).
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      this.window.on('closed', () => {
        this.window = null
        this.ready = false
      })

      const recorderUrl =
        isDev && process.env['ELECTRON_RENDERER_URL']
          ? `${process.env['ELECTRON_RENDERER_URL']}/windows/recorder/recorder.html`
          : `file://${resolveRendererPath('windows/recorder/recorder.html')}`

      this.window.loadURL(recorderUrl)
    }

    return new Promise<void>((resolve) => {
      if (this.ready) {
        resolve()
        return
      }
      this.readyWaiters.push(resolve)
    })
  }

  private bindListeners(): void {
    if (this.listenersBound) return
    this.listenersBound = true

    const partition = session.defaultSession
    partition.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'media') return callback(true)
      callback(false)
    })

    ipcMain.on('recorder:ready', () => {
      this.ready = true
      const waiters = this.readyWaiters
      this.readyWaiters = []
      for (const w of waiters) w()
    })

    // Interim audio chunk during a stream-mode session — route directly
    // to the stream-transcribe orchestrator. Never resolves a pending
    // stop, never invokes the auto-stop handler.
    ipcMain.on('recorder:audio-chunk', (_event, audio: ArrayBuffer | Uint8Array) => {
      const buffer =
        audio instanceof ArrayBuffer
          ? Buffer.from(audio)
          : Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength)
      streamTranscribeService.pushChunk(buffer)
    })

    ipcMain.on('recorder:audio', (_event, audio: ArrayBuffer | Uint8Array) => {
      const buffer =
        audio instanceof ArrayBuffer
          ? Buffer.from(audio)
          : Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength)

      // Stream-or-meeting session: the "final" audio is just the residual
      // tail. Push it as one more chunk, then resolve the stop promise
      // with an empty buffer so voice.ts knows there's no batch
      // transcription to do — the text is either already in the user's
      // editor (stream) or being held by stream-transcribe pending a
      // drain (meeting). The CALLER is responsible for invoking
      // streamTranscribeService.endSession() and using the result —
      // we don't do it here because in meeting mode the caller needs
      // to await the drain and save the transcript.
      if (this.sessionMode !== 'batch') {
        if (buffer.length > 0) streamTranscribeService.pushChunk(buffer)

        // Auto-end paste-sink sessions (existing dictation behavior) so
        // we don't strand the queue with no one to drain it. Meeting
        // sessions are explicitly drained by meeting.ts after stop.
        if (this.sessionMode === 'stream') {
          void streamTranscribeService.endSession()
        }

        if (this.pendingStop) {
          const { resolve, timer } = this.pendingStop
          clearTimeout(timer)
          this.pendingStop = null
          this.scheduleIdleDestroy()
          // Return an empty buffer — voice.ts checks isStreamSession()
          // and short-circuits the batch transcription.
          resolve(Buffer.alloc(0))
        } else if (this.recording) {
          // Renderer auto-stopped (max-duration cap) — recovery: signal
          // autoStopHandler with empty so it logs and broadcasts state
          // cleanly. For meeting mode, meeting.ts has its own handler.
          this.recording = false
          this.scheduleIdleDestroy()
          if (this.autoStopHandler) this.autoStopHandler(Buffer.alloc(0))
        }
        return
      }

      // Batch mode (existing behavior, unchanged).
      if (this.pendingStop) {
        const { resolve, timer } = this.pendingStop
        clearTimeout(timer)
        this.pendingStop = null
        resolve(buffer)
        return
      }

      if (this.recording) {
        // Renderer auto-stopped (e.g. 60s cap) — clean up state, schedule
        // idle destroy, and notify handler.
        this.recording = false
        this.scheduleIdleDestroy()
        if (this.autoStopHandler) this.autoStopHandler(buffer)
      }
    })

    ipcMain.on('recorder:error', (_event, message: string) => {
      if (this.pendingStop) {
        const { reject, timer } = this.pendingStop
        clearTimeout(timer)
        this.pendingStop = null
        reject(new Error(message))
      } else {
        // Non-fatal — main can decide what to do with this on the next start.
        this.recording = false
      }
    })
  }
}

export const audioService = new AudioService()
