import { app, BrowserWindow, ipcMain, screen } from 'electron'
import type { CaptureMode } from '../services/capture'
import { isValidCaptureMode } from '../services/ipc-validators'
import { resolvePreloadPath, resolveRendererPath } from '../utils/paths'

let pendingTargetTitle: string | null = null

export function setPickerTargetTitle(title: string | null): void {
  pendingTargetTitle = title
}

const isDev = !app.isPackaged

const WINDOW_WIDTH = 580
const WINDOW_HEIGHT = 100
const BOTTOM_MARGIN = 80

let pickerWindow: BrowserWindow | null = null
let onModeSelected: ((mode: CaptureMode) => void) | null = null
let listenersBound = false

function computePosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { workArea } = display
  return {
    x: workArea.x + Math.round((workArea.width - WINDOW_WIDTH) / 2),
    y: workArea.y + workArea.height - WINDOW_HEIGHT - BOTTOM_MARGIN
  }
}

function bindListeners(): void {
  if (listenersBound) return
  listenersBound = true

  ipcMain.on('capture:mode-selected', (_event, rawMode: unknown) => {
    // Validate before invoking the callback — the renderer should only ever
    // send one of 4 known mode strings, so anything else is either a bug
    // or a hostile payload.
    if (!isValidCaptureMode(rawMode)) {
      console.warn(`[picker] capture:mode-selected with invalid mode: ${String(rawMode)}`)
      onModeSelected = null
      closePicker()
      return
    }
    const cb = onModeSelected
    onModeSelected = null
    closePicker()
    if (cb) cb(rawMode)
  })

  ipcMain.on('capture:cancel', () => {
    onModeSelected = null
    closePicker()
  })

  ipcMain.handle('capture:target-title', () => pendingTargetTitle)
}

export function showModePicker(callback: (mode: CaptureMode) => void): void {
  bindListeners()

  // If picker is already open, just refocus it.
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    onModeSelected = callback
    pickerWindow.show()
    pickerWindow.focus()
    return
  }

  onModeSelected = callback
  const { x, y } = computePosition()

  pickerWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: resolvePreloadPath('picker'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  pickerWindow.setAlwaysOnTop(true, 'screen-saver')

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    pickerWindow.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}/windows/picker/mode-picker.html`
    )
  } else {
    pickerWindow.loadFile(resolveRendererPath('windows/picker/mode-picker.html'))
  }

  pickerWindow.once('ready-to-show', () => {
    pickerWindow?.show()
    pickerWindow?.focus()
  })

  // Click outside the picker → close
  pickerWindow.on('blur', () => {
    if (pickerWindow && !pickerWindow.isDestroyed()) {
      onModeSelected = null
      closePicker()
    }
  })

  pickerWindow.on('closed', () => {
    pickerWindow = null
  })
}

export function closePicker(): void {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.destroy()
  }
  pickerWindow = null
}

export function isPickerOpen(): boolean {
  return !!pickerWindow && !pickerWindow.isDestroyed()
}
