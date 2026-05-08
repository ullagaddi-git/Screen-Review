import { Notification, shell } from 'electron'
import { getConfig, setConfig } from './store'
import { ollamaService } from './ollama'
import {
  shouldShowWelcome,
  shouldPromptOllama,
  welcomeBody
} from './first-run-helpers'

const WELCOME_DELAY_MS = 1_500 // give the tray icon time to appear first
const OLLAMA_PROMPT_DELAY_MS = 4_000 // staggered so the two notifications don't collide

/**
 * One-shot first-launch experience. Idempotent — flips `firstRun: false`
 * after running so subsequent launches skip the whole flow.
 *
 * Runs entirely in the background (setTimeouts) so it never blocks app
 * startup. All errors are swallowed; a broken first-run shouldn't ever
 * prevent the app from launching.
 */
export function runFirstRunFlow(): void {
  let cfg
  try {
    cfg = getConfig()
  } catch (err) {
    console.warn('[first-run] could not read config:', (err as Error).message)
    return
  }

  const decisionInput = {
    isFirstRun: cfg.firstRun,
    notificationsEnabled: cfg.showTrayNotifications,
    voiceHotkey: cfg.voiceHotkey,
    captureHotkey: cfg.captureHotkey
  }

  if (!shouldShowWelcome(decisionInput)) {
    return
  }

  console.log('[first-run] firstRun=true — running welcome flow')

  // 1. Welcome notification (after a tiny delay so it doesn't race the tray
  //    icon registration — feels nicer when the icon appears first).
  setTimeout(() => {
    try {
      if (!Notification.isSupported()) return
      const n = new Notification({
        title: 'ScreenSpeak is running',
        body: welcomeBody(cfg.voiceHotkey, cfg.captureHotkey),
        silent: true
      })
      n.show()
    } catch (err) {
      console.warn('[first-run] welcome notify failed:', (err as Error).message)
    }
  }, WELCOME_DELAY_MS)

  // 2. Ollama setup nudge. Check live status (don't trust cached) — if not
  //    running, show a second notification with a clickable link.
  setTimeout(() => {
    void (async (): Promise<void> => {
      try {
        const running = await ollamaService.isRunning()
        if (!shouldPromptOllama({ isFirstRun: true, notificationsEnabled: cfg.showTrayNotifications, ollamaRunning: running })) {
          return
        }

        if (!Notification.isSupported()) return
        const n = new Notification({
          title: 'Want AI screenshot analysis?',
          body: 'Install Ollama (free) to enable local AI. Click for setup.',
          silent: true
        })
        n.on('click', () => {
          void shell.openExternal('https://ollama.com')
        })
        n.show()
      } catch (err) {
        console.warn('[first-run] ollama prompt failed:', (err as Error).message)
      }
    })()
  }, OLLAMA_PROMPT_DELAY_MS)

  // 3. Flip the firstRun flag immediately. Even if the notifications fail
  //    above, we don't want to badger the user every launch — better one
  //    silent miss than a recurring annoyance.
  try {
    setConfig({ firstRun: false })
    console.log('[first-run] flag flipped — won\'t run again')
  } catch (err) {
    console.warn('[first-run] could not flip firstRun flag:', (err as Error).message)
  }
}
