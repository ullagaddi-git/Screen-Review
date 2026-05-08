import { clipboard } from 'electron'
import { keyboard, Key, getActiveWindow } from '@nut-tree-fork/nut-js'

export interface PasteResult {
  pasted: boolean
  reason?: string
  /** Title of the active window we attempted to paste into (or skipped). */
  targetTitle?: string
}

// Make nut-js as snappy as possible — defaults add 500ms between key events.
keyboard.config.autoDelayMs = 0

/**
 * Returns true if the given window title looks like one of our own windows
 * (Settings or Result Panel) — we never want to paste transcribed text
 * into ScreenSpeak's own UI; the user wanted it in their target app.
 */
function isOwnWindow(title: string): boolean {
  return /screenspeak/i.test(title) || /result panel/i.test(title)
}

/**
 * Writes text to clipboard and simulates Ctrl+V to paste at the current cursor.
 *
 * If the foreground window is one of our OWN windows (e.g. user clicked the
 * "Stop & transcribe" button in Settings), we deliberately skip the synthetic
 * Ctrl+V — pasting into Settings does nothing useful and confuses the user.
 * The text stays on the clipboard and the caller surfaces a notification
 * telling them where it is.
 *
 * If the foreground is some other app with no focused text field, the
 * Ctrl+V is a no-op there too, but we still try (the user might have a
 * focused input — we have no clean way to detect that vs. no input).
 */
export async function pasteAtCursor(text: string): Promise<PasteResult> {
  if (!text) return { pasted: false, reason: 'empty-text' }

  clipboard.writeText(text)

  let targetTitle: string | undefined
  try {
    const win = await getActiveWindow()
    targetTitle = await win.title
    if (targetTitle && isOwnWindow(targetTitle)) {
      // Don't paste into ourselves. The clipboard already has the text and
      // the caller will show "Copied to clipboard — paste with Ctrl+V" notif.
      return { pasted: false, reason: 'own-window', targetTitle }
    }
  } catch {
    // If we can't even read the active window, fall through and try paste
    // anyway — worst case the keystroke goes nowhere visible, but we wrote
    // to clipboard so the user has a fallback.
  }

  try {
    // Brief delay so the clipboard write settles before the synthetic Ctrl+V
    // is consumed by the foreground window.
    await new Promise((r) => setTimeout(r, 50))
    await keyboard.pressKey(Key.LeftControl, Key.V)
    await keyboard.releaseKey(Key.LeftControl, Key.V)
    return { pasted: true, targetTitle }
  } catch (err) {
    return {
      pasted: false,
      reason: `paste-failed: ${(err as Error).message}`,
      targetTitle
    }
  }
}
