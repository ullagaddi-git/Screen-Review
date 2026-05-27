// Floating, always-on-top panel that shows the meeting transcript as
// it streams in chunk-by-chunk. Opened by meeting.ts when a meeting
// starts; destroyed when the meeting stops (or after a brief "saved"
// confirmation display).
//
// Window properties:
//   - frame:false — custom dark header inside the renderer so it
//     blends with the rest of ScreenSpeak's UI
//   - alwaysOnTop:true (screen-saver level) — stays visible over a
//     full-screen Zoom/Teams call
//   - movable:true — user can drag the header to reposition
//   - resizable:true — meetings vary; let the user widen/heighten
//   - focusable:true so the Copy buttons can take keyboard focus
//
// Default position: top-right of primary display. Persisted across
// sessions is a Phase 6 polish task — for v1 it resets each time.

import { app, BrowserWindow, clipboard, ipcMain, screen, shell } from 'electron'
import { resolvePreloadPath, resolveRendererPath } from '../utils/paths'
import { streamTranscribeService } from '../services/stream-transcribe'

const isDev = !app.isPackaged

const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 360
const MARGIN = 16

let panelWindow: BrowserWindow | null = null
let chunkUnsubscribe: (() => void) | null = null
let listenersBound = false

function computeDefaultPosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { workArea } = display
  return {
    x: workArea.x + workArea.width - DEFAULT_WIDTH - MARGIN,
    y: workArea.y + MARGIN
  }
}

function bindListeners(): void {
  if (listenersBound) return
  listenersBound = true

  // Renderer requests the current full transcript on mount (so it can
  // catch up if it was created mid-stream — shouldn't happen in v1 but
  // future-proofs against panel-reopen flows).
  ipcMain.handle('live-transcript:get-current', () => {
    return streamTranscribeService.getMeetingChunks()
  })

  /**
   * Copy the entire transcript to the system clipboard. Returns the
   * number of chunks copied so the renderer can flash a "Copied N lines"
   * confirmation.
   */
  ipcMain.handle('live-transcript:copy-all', () => {
    const chunks = streamTranscribeService.getMeetingChunks()
    const text = chunks
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .join('\n\n')
    clipboard.writeText(text)
    return { count: chunks.length, characters: text.length }
  })

  /**
   * Copy only the most recent N chunks — useful for grabbing fresh
   * context (e.g. the last thing said) without re-copying the whole
   * meeting.
   */
  ipcMain.handle('live-transcript:copy-last', (_event, n: number) => {
    const lastN = typeof n === 'number' && n > 0 ? Math.floor(n) : 5
    const chunks = streamTranscribeService.getMeetingChunks().slice(-lastN)
    const text = chunks
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .join('\n\n')
    clipboard.writeText(text)
    return { count: chunks.length, characters: text.length }
  })

  ipcMain.on('live-transcript:open-folder', (_event, folder: string) => {
    if (typeof folder !== 'string') return
    void shell.openPath(folder)
  })

  ipcMain.on('live-transcript:show-file', (_event, file: string) => {
    if (typeof file !== 'string') return
    shell.showItemInFolder(file)
  })
}

/**
 * Open the live transcript panel. Idempotent — calling while open just
 * refocuses (or no-ops if already focused). Starts forwarding meeting
 * chunks to the panel's renderer.
 */
export function openLiveTranscriptPanel(): void {
  bindListeners()

  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.show()
    return
  }

  const { x, y } = computeDefaultPosition()

  panelWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: 280,
    minHeight: 200,
    x,
    y,
    show: false,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#1E1E2E',
    hasShadow: true,
    title: 'ScreenSpeak — Live transcript',
    webPreferences: {
      preload: resolvePreloadPath('transcript'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // screen-saver level keeps the panel above Zoom/Teams call windows
  // without interfering with full-screen content like presentations.
  panelWindow.setAlwaysOnTop(true, 'screen-saver')

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    panelWindow.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}/windows/transcript/live-transcript.html`
    )
  } else {
    panelWindow.loadFile(resolveRendererPath('windows/transcript/live-transcript.html'))
  }

  panelWindow.once('ready-to-show', () => {
    panelWindow?.showInactive() // don't steal focus from the user's meeting app
  })

  // Forward each new meeting chunk to the panel's renderer. Unsubscribe
  // on close so we don't leak the listener across sessions.
  chunkUnsubscribe = streamTranscribeService.onMeetingChunk((text, allChunks) => {
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.webContents.send('live-transcript:chunk', {
        text,
        totalCount: allChunks.length
      })
    }
  })

  panelWindow.on('closed', () => {
    if (chunkUnsubscribe) {
      chunkUnsubscribe()
      chunkUnsubscribe = null
    }
    panelWindow = null
  })
}

/**
 * Tell the panel the meeting has been saved — show a "Saved" footer
 * with the file path + Open folder action. Doesn't close the window;
 * the renderer's own "Close" button handles that. (We want the user
 * to be able to do final copies after the meeting ends.)
 */
export function notifyTranscriptSaved(filePath: string): void {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('live-transcript:saved', { filePath })
  }
}

export function closeLiveTranscriptPanel(): void {
  if (chunkUnsubscribe) {
    chunkUnsubscribe()
    chunkUnsubscribe = null
  }
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.destroy()
  }
  panelWindow = null
}

export function isLiveTranscriptPanelOpen(): boolean {
  return !!panelWindow && !panelWindow.isDestroyed()
}
