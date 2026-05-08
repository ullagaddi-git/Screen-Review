import { app, ipcMain } from 'electron'
import { getConfig, setConfig, type Config } from '../services/store'
import { reloadVoiceHotkey } from './voice'
import { reloadCaptureHotkey } from './capture'
import { encryptSecret, isEncryptionAvailable } from '../services/secret-store'
import type { PublicConfig } from './settings-types'

export type { PublicConfig } from './settings-types'

function toPublic(cfg: Config): PublicConfig {
  const { openaiApiKey, ...rest } = cfg
  return { ...rest, hasOpenAIKey: typeof openaiApiKey === 'string' && openaiApiKey.length > 0 }
}

export function registerSettingsIPC(): void {
  ipcMain.handle('settings:get', (): PublicConfig => toPublic(getConfig()))

  ipcMain.handle('settings:set', (_event, partial: Partial<Config>) => {
    if (!partial || typeof partial !== 'object') {
      throw new Error('settings:set expects an object payload')
    }

    const next: Partial<Config> = { ...partial }

    // Special-case openaiApiKey: encrypt before storing. The renderer sends
    // plaintext when the user enters a new key (or null to clear).
    if (Object.prototype.hasOwnProperty.call(next, 'openaiApiKey')) {
      const raw = next.openaiApiKey
      if (raw === null || raw === undefined || raw === '') {
        next.openaiApiKey = null
      } else if (typeof raw === 'string') {
        if (!isEncryptionAvailable()) {
          throw new Error(
            'safeStorage encryption is unavailable on this OS — refusing to store the API key in plaintext.'
          )
        }
        const encrypted = encryptSecret(raw)
        if (!encrypted) {
          throw new Error('Failed to encrypt the OpenAI API key.')
        }
        next.openaiApiKey = encrypted
      }
    }

    setConfig(next)
    if (Object.prototype.hasOwnProperty.call(partial, 'voiceHotkey')) {
      reloadVoiceHotkey()
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'captureHotkey')) {
      reloadCaptureHotkey()
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'launchOnStartup')) {
      // Register/unregister with Windows' "Run on startup" so the change
      // takes effect immediately. `openAsHidden` ensures we boot directly
      // to the tray on next login (no Settings window flash).
      try {
        app.setLoginItemSettings({
          openAtLogin: !!next.launchOnStartup,
          openAsHidden: true
        })
      } catch (err) {
        console.warn('[settings] setLoginItemSettings failed:', (err as Error).message)
      }
    }
    return toPublic(getConfig())
  })
}
