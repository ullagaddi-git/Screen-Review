import { app, BrowserWindow, screen } from 'electron'
import { resolvePreloadPath, resolveRendererPath } from '../utils/paths'

const isDev = !app.isPackaged

const WINDOW_WIDTH = 140
const WINDOW_HEIGHT = 44
const MARGIN = 16

let indicatorWindow: BrowserWindow | null = null
let lastState: 'idle' | 'recording' | 'transcribing' | 'error' = 'idle'

function computePosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { workArea } = display
  return {
    x: workArea.x + workArea.width - WINDOW_WIDTH - MARGIN,
    y: workArea.y + workArea.height - WINDOW_HEIGHT - MARGIN
  }
}

function ensureIndicatorWindow(): BrowserWindow {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) return indicatorWindow

  const { x, y } = computePosition()

  indicatorWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: resolvePreloadPath('indicator'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  indicatorWindow.setAlwaysOnTop(true, 'screen-saver')
  indicatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  indicatorWindow.setIgnoreMouseEvents(true, { forward: false })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    indicatorWindow.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}/windows/result/mic-indicator.html`
    )
  } else {
    indicatorWindow.loadFile(resolveRendererPath('windows/result/mic-indicator.html'))
  }

  indicatorWindow.on('closed', () => {
    indicatorWindow = null
  })

  return indicatorWindow
}

export function showMicIndicator(state: 'recording' | 'transcribing'): void {
  lastState = state
  const win = ensureIndicatorWindow()
  // Refresh position in case displays changed.
  const { x, y } = computePosition()
  win.setBounds({ x, y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT })
  win.showInactive()
  win.webContents.send('voice:state', { state })
}

export function hideMicIndicator(): void {
  lastState = 'idle'
  if (indicatorWindow && !indicatorWindow.isDestroyed()) {
    indicatorWindow.webContents.send('voice:state', { state: 'idle' })
    indicatorWindow.hide()
  }
}

export function destroyMicIndicator(): void {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) {
    indicatorWindow.destroy()
  }
  indicatorWindow = null
  lastState = 'idle'
}

export function getMicIndicatorState(): typeof lastState {
  return lastState
}
