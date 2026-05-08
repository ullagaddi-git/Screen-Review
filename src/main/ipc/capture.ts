import { globalShortcut, ipcMain } from 'electron'
import { captureService } from '../services/capture'
import { getConfigValue } from '../services/store'
import { isValidCaptureMode } from '../services/ipc-validators'

let currentAccelerator: string | null = null

/**
 * Translates our config-format hotkey ("Ctrl+Shift+S") into Electron's
 * Accelerator format. Electron uses "CommandOrControl" (not "Ctrl") for the
 * platform-aware modifier; everything else is the same.
 *
 * We intentionally use Electron's `globalShortcut.register()` for capture
 * (instead of the uIOhook approach used for voice) because globalShortcut
 * uses the OS's RegisterHotKey API which CONSUMES the key event — the
 * focused app never sees it. uIOhook only observes events, so apps like
 * VS Code (which binds Ctrl+Shift+S to "Save As") would still trigger
 * their own action when the user pressed our hotkey. globalShortcut
 * eliminates that conflict.
 */
function toAccelerator(configHotkey: string): string | null {
  const parts = configHotkey.split('+').map((p) => p.trim())
  if (parts.length === 0) return null
  const out: string[] = []
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') out.push('CommandOrControl')
    else if (lower === 'shift') out.push('Shift')
    else if (lower === 'alt') out.push('Alt')
    else if (lower === 'meta' || lower === 'cmd' || lower === 'super' || lower === 'win')
      out.push('Super')
    else out.push(part)
  }
  return out.join('+')
}

/**
 * When true, the capture hotkey is unregistered at the OS level — used
 * during the Settings → Hotkeys live recorder so the user can press
 * the hotkey to flag a conflict instead of triggering a capture.
 */
let suspended = false

export function startCaptureHotkey(): void {
  if (suspended) return // Don't register while suspended; resume() will re-register.

  const hotkeyStr = getConfigValue('captureHotkey') || 'Ctrl+Shift+S'
  const accelerator = toAccelerator(hotkeyStr)
  if (!accelerator) {
    console.warn(`[capture] could not parse hotkey "${hotkeyStr}" — capture disabled`)
    return
  }

  if (currentAccelerator) {
    globalShortcut.unregister(currentAccelerator)
    currentAccelerator = null
  }

  const ok = globalShortcut.register(accelerator, () => {
    console.log(`[capture] hotkey "${accelerator}" pressed — opening mode picker`)
    void captureService.openModePicker()
  })

  if (!ok) {
    console.error(
      `[capture] globalShortcut.register("${accelerator}") returned false — another app may already own this hotkey`
    )
    return
  }

  currentAccelerator = accelerator
  console.log(`[capture] registered hotkey: ${accelerator}`)
}

export function stopCaptureHotkey(): void {
  if (currentAccelerator) {
    globalShortcut.unregister(currentAccelerator)
    currentAccelerator = null
  }
}

export function reloadCaptureHotkey(): void {
  stopCaptureHotkey()
  startCaptureHotkey()
}

export function suspendCaptureHotkey(): void {
  suspended = true
  stopCaptureHotkey()
}

export function resumeCaptureHotkey(): void {
  suspended = false
  startCaptureHotkey()
}

export function registerCaptureIPC(): void {
  ipcMain.handle('capture:reload-hotkey', () => {
    reloadCaptureHotkey()
    return { ok: true, hotkey: currentAccelerator ?? null }
  })

  ipcMain.handle('capture:execute', async (_event, rawMode: unknown) => {
    if (!isValidCaptureMode(rawMode)) {
      throw new Error(`capture:execute received invalid mode: ${String(rawMode)}`)
    }
    const result = await captureService.executeMode(rawMode)
    return {
      mode: result.mode,
      width: result.width,
      height: result.height,
      base64: result.pngBuffer.toString('base64'),
      singleFrame: result.singleFrame,
      warning: result.warning
    }
  })
}
