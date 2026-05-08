import { app, BrowserWindow, ipcMain, screen } from 'electron'
import sharp from 'sharp'
import { capturePrimaryScreen } from '../services/screen'
import { validateRegionRect } from '../services/ipc-validators'
import { resolvePreloadPath, resolveRendererPath } from '../utils/paths'

const isDev = !app.isPackaged

// RegionRect type lives in services/ipc-validators.ts now (alongside the
// runtime validator). We don't import the type here because we accept
// `unknown` from the IPC bridge and let `validateRegionRect()` narrow it.

let overlayWindow: BrowserWindow | null = null
let listenersBound = false
let activeResolver:
  | { resolve: (buf: Buffer) => void; reject: (err: Error) => void }
  | null = null

function bindListeners(): void {
  if (listenersBound) return
  listenersBound = true

  ipcMain.handle('region:complete', async (_event, rawRect: unknown) => {
    // Validate the rect before doing ANYTHING with it — a malicious or
    // bug-induced renderer payload could otherwise feed garbage to sharp's
    // .extract() or wedge the activeResolver in an inconsistent state.
    const rect = validateRegionRect(rawRect)
    const resolver = activeResolver
    activeResolver = null
    closeOverlay()

    if (!rect) {
      console.warn('[region-main] complete: invalid rect payload — dropping')
      if (resolver) resolver.reject(new Error('Invalid region rect from renderer'))
      return { ok: false }
    }

    if (!resolver) {
      return { ok: false }
    }

    // Brief wait for OS to redraw without the overlay on top.
    await new Promise((r) => setTimeout(r, 100))

    try {
      const cap = await capturePrimaryScreen()
      const sf = cap.scaleFactor
      const left = Math.max(0, Math.round(rect.x * sf))
      const top = Math.max(0, Math.round(rect.y * sf))
      const width = Math.max(1, Math.min(cap.width - left, Math.round(rect.w * sf)))
      const height = Math.max(1, Math.min(cap.height - top, Math.round(rect.h * sf)))

      const cropped = await sharp(cap.pngBuffer)
        .extract({ left, top, width, height })
        .png()
        .toBuffer()

      resolver.resolve(cropped)
      return { ok: true }
    } catch (err) {
      console.error('[region-main] capture/crop failed:', err)
      resolver.reject(err as Error)
      return { ok: false }
    }
  })

  ipcMain.handle('region:cancel', () => {
    const resolver = activeResolver
    activeResolver = null
    closeOverlay()
    if (resolver) resolver.reject(new RegionCanceledError())
    return { ok: true }
  })
}

export class RegionCanceledError extends Error {
  constructor() {
    super('Region capture canceled')
    this.name = 'RegionCanceledError'
  }
}

export async function selectAndCaptureRegion(): Promise<Buffer> {
  bindListeners()

  return new Promise<Buffer>((resolve, reject) => {
    activeResolver = { resolve, reject }

    // Safety timeout: if no selection within 60s, abort. Prevents a stuck overlay
    // from holding the screen indefinitely if something goes wrong.
    const safetyTimeout = setTimeout(() => {
      if (activeResolver) {
        const r = activeResolver
        activeResolver = null
        closeOverlay()
        r.reject(new RegionCanceledError())
      }
    }, 60_000)

    const display = screen.getPrimaryDisplay()
    const { x, y, width, height } = display.bounds

    overlayWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
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
      show: false,
      webPreferences: {
        preload: resolvePreloadPath('region'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.setSkipTaskbar(true)

    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      overlayWindow.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}/windows/picker/region-overlay.html`
      )
    } else {
      overlayWindow.loadFile(resolveRendererPath('windows/picker/region-overlay.html'))
    }

    overlayWindow.once('ready-to-show', () => {
      overlayWindow?.show()
      overlayWindow?.focus()
    })

    overlayWindow.on('closed', () => {
      clearTimeout(safetyTimeout)
      overlayWindow = null
    })
  })
}

export function closeRegionOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}

function closeOverlay(): void {
  closeRegionOverlay()
}
