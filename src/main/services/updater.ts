// electron-updater wrapper. Polls GitHub Releases (configured in
// electron-builder.yml `publish:`) for newer installers; if found,
// shows a tray notification and downloads the update in the background.
//
// Behavior matrix:
//
//   isPackaged=false (dev) → noop. The dev build has no installable update
//                            channel; calling autoUpdater here would log
//                            confusing "skipping checkForUpdates because
//                            application is not packed" warnings.
//
//   isPackaged=true        → schedule a check 5s after app start; on hit,
//                            tray notification → user clicks → installer
//                            applies on next quit.
//
// All errors are swallowed at the top level (`autoUpdater.on('error')`):
// a misconfigured update channel should never crash a launched app.

import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'

const STARTUP_DELAY_MS = 5_000

let started = false

/**
 * Schedule the auto-update check 5 seconds after app start. Idempotent —
 * calling more than once is a no-op so re-bootstraps don't pile up timers.
 */
export function startAutoUpdater(): void {
  if (started) return
  started = true

  if (!app.isPackaged) {
    // Dev mode — autoUpdater would warn and do nothing useful. Skip.
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking for updates…')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] update available: v${info.version}`)
    try {
      const n = new Notification({
        title: 'ScreenSpeak update available',
        body: `Downloading v${info.version} in the background — click here when ready to install.`,
        silent: true
      })
      n.show()
    } catch {
      // Notifications can fail in some Windows configs; the next launch will
      // still try to apply any downloaded update.
    }
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] up to date')
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] downloaded v${info.version}; will apply on quit`)
    try {
      const n = new Notification({
        title: 'ScreenSpeak update ready',
        body: `v${info.version} will install when you quit. Click to quit and update now.`,
        silent: true
      })
      n.on('click', () => {
        autoUpdater.quitAndInstall()
      })
      n.show()
    } catch {
      // ignore — the update still applies on next quit via autoInstallOnAppQuit
    }
  })

  autoUpdater.on('error', (err) => {
    // A misconfigured channel, transient network failure, or rate-limit
    // shouldn't ever crash the app. Just log and move on.
    console.warn('[updater] error:', err.message)
  })

  setTimeout(() => {
    void autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[updater] checkForUpdatesAndNotify threw:', (err as Error).message)
    })
  }, STARTUP_DELAY_MS)
}
