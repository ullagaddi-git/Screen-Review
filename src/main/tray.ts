import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import sharp from 'sharp'
import { showResultPanel } from './windows/result-panel'
import { meetingService } from './services/meeting'

let tray: Tray | null = null
/**
 * Cached so refreshTrayMenu() can rebuild the menu with the same "open
 * Settings" callback when the meeting state changes between renders.
 */
let onOpenSettingsCached: (() => void) | null = null
let meetingUnsubscribe: (() => void) | null = null

const APP_VERSION = '1.0.0'

const isDev = !app.isPackaged

/** Generates a 320x180 navy-blue PNG to use as a placeholder thumbnail. */
async function makePlaceholderImage(): Promise<string> {
  const buf = await sharp({
    create: {
      width: 320,
      height: 180,
      channels: 3,
      background: { r: 30, g: 30, b: 46 }
    }
  })
    .png()
    .toBuffer()
  return buf.toString('base64')
}

function resolveIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icons', 'tray-icon.png')
  }
  return join(app.getAppPath(), 'resources', 'icons', 'tray-icon.png')
}

/**
 * Rebuilds + sets the tray context menu using the current meeting state
 * so the "Start meeting recording" / "Stop meeting" label updates live.
 * Called both at tray creation AND whenever meeting state changes.
 */
function refreshTrayMenu(): void {
  if (!tray || !onOpenSettingsCached) return

  const meetingState = meetingService.getState()
  const meetingLabel =
    meetingState === 'recording'
      ? '■ Stop meeting recording'
      : meetingState === 'saving'
        ? 'Saving meeting…'
        : '● Start meeting recording'

  const menuItems: Electron.MenuItemConstructorOptions[] = [
    { label: 'Settings', click: onOpenSettingsCached },
    { type: 'separator' },
    {
      label: meetingLabel,
      enabled: meetingState !== 'saving',
      click: async () => {
        if (meetingState === 'recording') {
          await meetingService.stop()
        } else if (meetingState === 'idle') {
          await meetingService.start()
        }
      }
    },
    {
      label: 'Open meetings folder',
      click: () => meetingService.openMeetingsFolder()
    },
    { type: 'separator' },
    { label: `About ScreenSpeak v${APP_VERSION}`, enabled: false }
  ]

  // Dev-only: show a fake result panel so we can verify TASK-032 layout
  // without the full capture→AI flow (TASK-034). Removed from production.
  if (isDev) {
    menuItems.push(
      { type: 'separator' },
      {
        label: 'Dev: show sample result panel (success)',
        click: async () => {
          const imageBase64 = await makePlaceholderImage()
          showResultPanel({
            kind: 'success',
            imageBase64,
            provider: 'ollama',
            text: `This terminal output shows a Python KeyError exception.\n\nThe error occurred because the dictionary 'config' has no key 'timeout' but the code tried to read it directly.\n\n\`\`\`python\n# Fix:\ntimeout = config.get('timeout', 30)\n\`\`\`\n\nThis sets a default of 30 seconds when the key is missing.`
          })
        }
      },
      {
        label: 'Dev: show sample result panel (Ollama unavailable)',
        click: async () => {
          const imageBase64 = await makePlaceholderImage()
          showResultPanel({
            kind: 'error',
            imageBase64,
            errorKind: 'ollama-unavailable',
            message: 'Local AI is not running. Install Ollama (free) to enable analysis.',
            setupHint: 'https://ollama.com'
          })
        }
      },
      {
        label: 'Dev: show sample result panel (loading)',
        click: async () => {
          const imageBase64 = await makePlaceholderImage()
          showResultPanel({ kind: 'loading', imageBase64, label: 'Analyzing…' })
        }
      }
    )
  }

  menuItems.push({ type: 'separator' }, { label: 'Quit', click: () => app.quit() })

  const menu = Menu.buildFromTemplate(menuItems)
  tray.setContextMenu(menu)
}

export function createTray(onOpenSettings: () => void): Tray {
  if (tray) return tray

  const icon = nativeImage.createFromPath(resolveIconPath())
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('ScreenSpeak')
  onOpenSettingsCached = onOpenSettings

  // Build the menu once now and again whenever meeting state changes
  // (so the label flips between "Start meeting recording" and "Stop
  // meeting recording" + the tooltip can carry status info later).
  refreshTrayMenu()
  meetingUnsubscribe = meetingService.onStateChange((state) => {
    refreshTrayMenu()
    // Surface the current meeting state in the tray tooltip too — handy
    // for users who hover the icon mid-meeting to confirm it's recording.
    if (tray) {
      tray.setToolTip(
        state === 'recording'
          ? 'ScreenSpeak — recording meeting'
          : state === 'saving'
            ? 'ScreenSpeak — saving meeting'
            : 'ScreenSpeak'
      )
    }
  })

  tray.on('click', onOpenSettings)

  return tray
}

export function destroyTray(): void {
  if (meetingUnsubscribe) {
    meetingUnsubscribe()
    meetingUnsubscribe = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
  onOpenSettingsCached = null
}
