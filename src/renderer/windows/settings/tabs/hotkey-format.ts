// Pure helpers for translating browser KeyboardEvent → our config-format
// hotkey strings ("Ctrl+Shift+V"). Extracted so we can unit-test the
// transformation without spinning up React or Electron.
//
// Our config format is the same one Electron's globalShortcut.register()
// accepts (with "Ctrl" used in the UI; we'll translate "Ctrl" →
// "CommandOrControl" inside the main process when registering).

/**
 * Map a browser KeyboardEvent's `code` to our hotkey-string token.
 * Returns null for codes we don't allow as hotkey keys (e.g. modifier-only
 * keys, dead keys).
 */
export function eventCodeToToken(code: string): string | null {
  if (!code) return null
  if (code.startsWith('Key') && code.length === 4) return code.slice(3) // KeyA → A
  if (code.startsWith('Digit') && /^Digit\d$/.test(code)) return code.slice(5) // Digit1 → 1
  if (/^F\d+$/.test(code)) return code // F1, F12, F24 → as-is

  // Special keys — values match Electron Accelerator format so the main
  // process can pass them straight through.
  switch (code) {
    case 'Space':
      return 'Space'
    case 'Enter':
    case 'NumpadEnter':
      return 'Enter'
    case 'Tab':
      return 'Tab'
    case 'Backspace':
      return 'Backspace'
    case 'Delete':
      return 'Delete'
    case 'Insert':
      return 'Insert'
    case 'Home':
      return 'Home'
    case 'End':
      return 'End'
    case 'PageUp':
      return 'PageUp'
    case 'PageDown':
      return 'PageDown'
    case 'ArrowUp':
      return 'Up'
    case 'ArrowDown':
      return 'Down'
    case 'ArrowLeft':
      return 'Left'
    case 'ArrowRight':
      return 'Right'
    case 'Minus':
      return '-'
    case 'Equal':
      return '='
    case 'BracketLeft':
      return '['
    case 'BracketRight':
      return ']'
    case 'Semicolon':
      return ';'
    case 'Quote':
      return "'"
    case 'Backquote':
      return '`'
    case 'Comma':
      return ','
    case 'Period':
      return '.'
    case 'Slash':
      return '/'
    case 'Backslash':
      return '\\'
    default:
      return null
  }
}

export interface HotkeyEvent {
  code: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

export interface FormatHotkeyResult {
  ok: true
  combo: string
}

export interface FormatHotkeyError {
  ok: false
  reason: 'modifier-only' | 'unsupported-key' | 'no-modifier'
}

/**
 * Builds a "Ctrl+Shift+V"-style hotkey string from a KeyboardEvent.
 *
 *  - Returns `{ok:false, reason:'modifier-only'}` for a modifier-only press
 *    (the user is mid-combo; ignore and wait for the actual key).
 *  - Returns `{ok:false, reason:'unsupported-key'}` if the key code doesn't
 *    map to anything Electron's globalShortcut accepts.
 *  - Returns `{ok:false, reason:'no-modifier'}` if the user pressed a plain
 *    key like just `F12` — we require at least one modifier so hotkeys
 *    can't accidentally collide with normal typing.
 */
export function formatHotkeyFromEvent(
  e: HotkeyEvent
): FormatHotkeyResult | FormatHotkeyError {
  // Modifier-only keys (Ctrl, Shift, Alt, Meta) → caller should keep listening
  if (
    e.code === 'ControlLeft' ||
    e.code === 'ControlRight' ||
    e.code === 'ShiftLeft' ||
    e.code === 'ShiftRight' ||
    e.code === 'AltLeft' ||
    e.code === 'AltRight' ||
    e.code === 'MetaLeft' ||
    e.code === 'MetaRight'
  ) {
    return { ok: false, reason: 'modifier-only' }
  }

  const token = eventCodeToToken(e.code)
  if (!token) return { ok: false, reason: 'unsupported-key' }

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Meta')

  if (parts.length === 0) return { ok: false, reason: 'no-modifier' }

  parts.push(token)
  return { ok: true, combo: parts.join('+') }
}
