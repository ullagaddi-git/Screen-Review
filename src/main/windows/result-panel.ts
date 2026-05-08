import { app, BrowserWindow, clipboard, ipcMain, nativeImage, screen, shell } from 'electron'
import { uIOhook } from 'uiohook-napi'
import type { ResultPanelData } from '../ipc/result-panel-types'
import { resolvePreloadPath, resolveRendererPath } from '../utils/paths'

const isDev = !app.isPackaged

const WINDOW_WIDTH = 460
const INITIAL_HEIGHT = 480
const MIN_HEIGHT = 200
const MAX_HEIGHT = 600
const MARGIN = 16

let panelWindow: BrowserWindow | null = null
/**
 * The data the panel will fetch on mount via `result-panel:get-initial`.
 * Captured here so the renderer doesn't have to deal with arbitrary IPC
 * timing — it just asks for "current state" when ready.
 */
let pendingData: ResultPanelData | null = null
let listenersBound = false
/** Registered uIOhook handler for click-outside-to-dismiss. Null when no panel is open. */
let outsideMousedownHandler: ((e: { x: number; y: number }) => void) | null = null

function computePosition(width: number, height: number): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { workArea } = display
  return {
    x: workArea.x + workArea.width - width - MARGIN,
    y: workArea.y + workArea.height - height - MARGIN
  }
}

function bindListeners(): void {
  if (listenersBound) return
  listenersBound = true

  ipcMain.handle('result-panel:get-initial', () => pendingData)

  ipcMain.handle('result-panel:copy-text', (_event, text: string) => {
    if (typeof text === 'string' && text.length > 0) {
      clipboard.writeText(text)
    }
  })

  ipcMain.handle('result-panel:copy-image', () => {
    // Copy from the cached pendingData. Only meaningful when there's an image.
    const data = pendingData
    if (!data || !data.imageBase64) return
    const buf = Buffer.from(data.imageBase64, 'base64')
    const img = nativeImage.createFromBuffer(buf)
    if (!img.isEmpty()) clipboard.writeImage(img)
  })

  ipcMain.on('result-panel:dismiss', () => {
    closeResultPanel()
  })

  ipcMain.on('result-panel:open-external', (_event, url: string) => {
    if (typeof url !== 'string') return
    // Only allow http(s) URLs — never `file://` or anything else from the renderer.
    if (!/^https?:\/\//i.test(url)) return
    void shell.openExternal(url)
  })
}

export function showResultPanel(data: ResultPanelData): void {
  bindListeners()
  pendingData = data

  // Reuse the existing window if it's still alive — just push fresh data.
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('result-panel:data', data)
    if (!panelWindow.isVisible()) panelWindow.showInactive()
    return
  }

  const { x, y } = computePosition(WINDOW_WIDTH, INITIAL_HEIGHT)

  panelWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: INITIAL_HEIGHT,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    // transparent:false per the PRD note ("avoid transparency rendering bugs").
    transparent: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#1E1E2E',
    hasShadow: true,
    webPreferences: {
      preload: resolvePreloadPath('result'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // screen-saver level keeps the panel above other always-on-top apps
  // without interfering with full-screen content.
  panelWindow.setAlwaysOnTop(true, 'screen-saver')

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    panelWindow.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}/windows/result/result-panel.html`
    )
  } else {
    panelWindow.loadFile(resolveRendererPath('windows/result/result-panel.html'))
  }

  panelWindow.once('ready-to-show', () => {
    panelWindow?.showInactive()
  })

  // Click-outside-to-dismiss: focusable:false means the panel never receives
  // OS focus, so the 'blur' event isn't reliable. Instead we hook the global
  // mousedown stream (uIOhook is already running for the voice hotkey) and
  // check whether the click landed inside the panel's screen bounds. If
  // outside, dismiss. This works regardless of focus model, on any HiDPI
  // setting (we convert DIP bounds → screen pixels to match uIOhook coords).
  outsideMousedownHandler = (e: { x: number; y: number }): void => {
    if (!panelWindow || panelWindow.isDestroyed()) return
    const dipBounds = panelWindow.getBounds()
    const tl = screen.dipToScreenPoint({ x: dipBounds.x, y: dipBounds.y })
    const br = screen.dipToScreenPoint({
      x: dipBounds.x + dipBounds.width,
      y: dipBounds.y + dipBounds.height
    })
    const inside = e.x >= tl.x && e.x <= br.x && e.y >= tl.y && e.y <= br.y
    if (!inside) closeResultPanel()
  }
  uIOhook.on('mousedown', outsideMousedownHandler)

  panelWindow.on('closed', () => {
    if (outsideMousedownHandler) {
      uIOhook.off('mousedown', outsideMousedownHandler)
      outsideMousedownHandler = null
    }
    panelWindow = null
    pendingData = null
  })
}

export function closeResultPanel(): void {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.destroy()
  }
  panelWindow = null
  pendingData = null
}

export function isResultPanelOpen(): boolean {
  return !!panelWindow && !panelWindow.isDestroyed()
}
