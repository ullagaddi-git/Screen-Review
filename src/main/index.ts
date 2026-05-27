import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { createTray, destroyTray } from './tray'
import { registerSettingsIPC } from './ipc/settings'
import { registerAIIPC } from './ipc/ai'
import {
  registerVoiceIPC,
  startVoiceHotkey,
  stopVoiceHotkey,
  suspendVoiceHotkey,
  resumeVoiceHotkey
} from './ipc/voice'
import {
  registerCaptureIPC,
  startCaptureHotkey,
  stopCaptureHotkey,
  suspendCaptureHotkey,
  resumeCaptureHotkey
} from './ipc/capture'
import { audioService } from './services/audio'
import { destroyMicIndicator } from './windows/mic-indicator'
import { closePicker } from './windows/mode-picker'
import { closeResultPanel } from './windows/result-panel'
import { runFirstRunFlow } from './services/first-run'
import { applyAppSecurity } from './services/security'
import { registerTranscribeFileIPC } from './services/transcribe-file'
import { getMemorySummary } from './services/memory'
import { formatMemorySummary } from './services/memory-helpers'
import { startAutoUpdater } from './services/updater'
import { initLogger, log } from './services/logger'
import { resolvePreloadPath, resolveRendererPath } from './utils/paths'
import { runSelfCheck } from './utils/selfcheck'

const isDev = !app.isPackaged

// TASK-043: Disable hardware acceleration to drop the Chromium GPU helper
// process (~50–80 MB). ScreenSpeak's renderer uses Tailwind transitions and
// CSS animations only — no Canvas, WebGL, or smooth-scroll-heavy content —
// so software compositing is fine. Big idle-memory win.
//
// Note: must be called BEFORE app.whenReady().
app.disableHardwareAcceleration()

let settingsWindow: BrowserWindow | null = null

function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 480,
    show: false,
    autoHideMenuBar: true,
    resizable: false,
    maximizable: false,
    minimizable: true,
    backgroundColor: '#1E1E2E',
    title: 'ScreenSpeak Settings',
    webPreferences: {
      preload: resolvePreloadPath('index'),
      // Sandbox is safe here: the preload only uses contextBridge +
      // ipcRenderer, both of which are available in sandboxed renderers.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    settingsWindow.loadFile(resolveRendererPath('index.html'))
  }

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    openSettingsWindow()
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.screenshpeak.app')
    }

    // Logger first — installs uncaughtException + unhandledRejection hooks
    // that any later bootstrapping should benefit from.
    initLogger()
    log('info', `app starting — v${app.getVersion()} (packaged=${app.isPackaged})`)

    // Install global security protections BEFORE any BrowserWindow is created
    // so that the `web-contents-created` hook fires for every renderer.
    applyAppSecurity()

    registerSettingsIPC()
    registerAIIPC()
    registerVoiceIPC()
    registerCaptureIPC()
    registerTranscribeFileIPC()

    // Allow other windows (e.g. the result panel's error CTAs) to open
    // the Settings window without each window-manager needing a direct
    // dependency on the main entry's `openSettingsWindow` closure.
    ipcMain.handle('app:open-settings', (_event, tab?: string) => {
      openSettingsWindow()
      if (typeof tab === 'string' && settingsWindow && !settingsWindow.isDestroyed()) {
        // Wait for the page to be ready before sending the focus event;
        // 'ready-to-show' fires after the DOM mounts and our useEffect
        // listener is installed.
        if (settingsWindow.webContents.isLoading()) {
          settingsWindow.webContents.once('did-finish-load', () => {
            settingsWindow?.webContents.send('settings:focus-tab', tab)
          })
        } else {
          settingsWindow.webContents.send('settings:focus-tab', tab)
        }
      }
    })

    // Generic external-link opener. Validates the URL is http(s) so the
    // renderer can't trick us into launching arbitrary protocols.
    ipcMain.handle('app:open-external', (_event, url: string) => {
      if (typeof url !== 'string') return
      if (!/^https?:\/\//i.test(url)) return
      void shell.openExternal(url)
    })

    // Pause global hotkeys while the user records a new one in Settings —
    // otherwise pressing the existing capture hotkey opens the mode picker
    // instead of being captured by the recorder for conflict detection.
    ipcMain.handle('hotkeys:pause', () => {
      suspendVoiceHotkey()
      suspendCaptureHotkey()
    })
    ipcMain.handle('hotkeys:resume', () => {
      resumeVoiceHotkey()
      resumeCaptureHotkey()
    })

    // App-level metadata + diagnostics for the Settings → App tab.
    ipcMain.handle('app:get-info', () => ({
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      // Windows registers this on login; surface so the UI can show a "linked"
      // status independent of our own config flag (which could drift if Windows
      // unregisters us due to user action in startup-apps settings).
      loginItemEnabled: app.getLoginItemSettings().openAtLogin
    }))

    // Memory introspection for the Settings → App tab and TASK-043's
    // <150MB-at-idle verification. Returns a snapshot of main + per-window
    // process memory, so the user can see roughly what each running window
    // costs without opening Task Manager.
    ipcMain.handle('app:get-memory', async () => {
      try {
        return await getMemorySummary()
      } catch (err) {
        console.warn('[memory] snapshot failed:', (err as Error).message)
        return null
      }
    })

    ipcMain.handle('app:check-for-updates', async () => {
      if (!app.isPackaged) {
        return {
          status: 'unavailable' as const,
          message: 'Update check is disabled in dev mode (no release channel).'
        }
      }
      // Real check via electron-updater. Resolves to the structure the App
      // tab UI expects. Errors during the check (offline, GitHub rate-limit,
      // misconfigured release channel) all surface as `kind: 'error'`.
      try {
        const { autoUpdater } = await import('electron-updater')
        const result = await autoUpdater.checkForUpdates()
        if (!result || !result.updateInfo) {
          return { status: 'up-to-date' as const, message: 'You are on the latest version.' }
        }
        const remoteVersion = result.updateInfo.version
        if (remoteVersion === app.getVersion()) {
          return { status: 'up-to-date' as const, message: 'You are on the latest version.' }
        }
        return {
          status: 'available' as const,
          version: remoteVersion,
          message: 'Downloading in the background — you\'ll be prompted to install on quit.'
        }
      } catch (err) {
        return {
          status: 'error' as const,
          message: (err as Error).message
        }
      }
    })

    // Verify preloads & critical paths exist on disk; surface a notification
    // if anything is missing so we never hit a silent IPC dead-end.
    const sc = runSelfCheck()
    if (!sc.ok) {
      try {
        new Notification({
          title: 'ScreenSpeak: build files missing',
          body: 'Some preload files were not found at runtime. Region/voice features may fail. Check console.'
        }).show()
      } catch {
        // Notifications can fail in some Windows configs; the console log is the source of truth.
      }
    }

    createTray(openSettingsWindow)
    // TASK-043: Don't pre-warm the mic indicator — it costs ~50 MB of idle
    // memory for a feature most launches never use. The indicator is now
    // created lazily on first `showMicIndicator()` call. Trade-off: first
    // voice activation pays ~200 ms window-creation lag.
    startVoiceHotkey()
    startCaptureHotkey()

    // Welcome notification + Ollama nudge for first launch only.
    // Runs entirely in background; never blocks startup.
    try {
      runFirstRunFlow()
    } catch (err) {
      console.warn('[index] first-run flow threw:', (err as Error).message)
    }

    // Auto-update — checks GitHub Releases 5 seconds after start. No-op in dev.
    try {
      startAutoUpdater()
    } catch (err) {
      console.warn('[index] startAutoUpdater threw:', (err as Error).message)
    }

    // TASK-043 verification helper: take 4 memory snapshots over the first
    // 90 seconds and log the LOWEST one. Multiple samples filters out
    // transient spikes from window-open/close during testing — the minimum
    // is the closest thing to true idle. Skipped in production to keep the
    // log clean; devs can call `app:get-memory` IPC instead.
    if (isDev) {
      const samples: Array<{ t: number; total: number; line: string }> = []
      const sampleAt = (seconds: number): void => {
        setTimeout(() => {
          void getMemorySummary()
            .then((summary) => {
              samples.push({
                t: seconds,
                total: summary.totalMB,
                line: formatMemorySummary(summary)
              })
              if (samples.length === 4) {
                const min = samples.reduce((a, b) => (b.total < a.total ? b : a))
                console.log(
                  `[memory] idle snapshot — minimum across 4 samples (T+30/60/75/90s): ` +
                    `T+${min.t}s ${min.line}`
                )
              }
            })
            .catch(() => {
              /* swallow — diagnostic only */
            })
        }, seconds * 1000)
      }
      sampleAt(30)
      sampleAt(60)
      sampleAt(75)
      sampleAt(90)
    }
  })
}

app.on('window-all-closed', () => {
  // Tray-only app — never quit when all windows close.
})

app.on('before-quit', async () => {
  stopVoiceHotkey()
  stopCaptureHotkey()
  audioService.destroy()
  destroyMicIndicator()
  closePicker()
  closeResultPanel()
  // Close the live transcript panel if a meeting was in flight at app quit.
  // We do a best-effort import here so the symbol is available without
  // restructuring the main top-level imports.
  try {
    const { closeLiveTranscriptPanel } = await import('./windows/live-transcript-panel')
    closeLiveTranscriptPanel()
  } catch {
    /* swallow — quit shouldn't fail on a cleanup helper */
  }
  destroyTray()
})
