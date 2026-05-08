import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { HotkeyChip } from './HotkeyChip'
import { Button } from './Button'
import {
  formatHotkeyFromEvent,
  type FormatHotkeyError
} from '../../windows/settings/tabs/hotkey-format'

export interface HotkeyRecorderProps {
  /** Currently-bound hotkey string, e.g. "Ctrl+Shift+Space". */
  value: string
  /** Called with a new combo when the user successfully records one. */
  onChange: (combo: string) => void
  /** When the user records this exact combo, show an error instead of saving. */
  conflictWith?: { combo: string; label: string }
  /** Aria label for the click-to-record button. */
  label?: string
}

const REASON_HINTS: Record<FormatHotkeyError['reason'], string> = {
  'modifier-only': 'Keep holding — press the key you want…',
  'unsupported-key': 'That key isn\'t supported. Try a letter, digit, F-key, or Space.',
  'no-modifier': 'Hotkeys must include at least one modifier (Ctrl, Shift, or Alt).'
}

export function HotkeyRecorder({
  value,
  onChange,
  conflictWith,
  label
}: HotkeyRecorderProps): JSX.Element {
  const [recording, setRecording] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const cancel = useCallback((): void => {
    setRecording(false)
    setHint(null)
    void window.electronAPI?.hotkeys?.resume()
  }, [])

  // When entering recording mode, tell main to suspend global hotkeys so the
  // user can press the existing voice/capture combos and have us see them
  // (instead of those combos triggering their normal actions).
  useEffect(() => {
    if (!recording) return
    void window.electronAPI?.hotkeys?.pause()
    return () => {
      void window.electronAPI?.hotkeys?.resume()
    }
  }, [recording])

  useEffect(() => {
    if (!recording) return

    const handler = (e: KeyboardEvent): void => {
      // Always intercept while recording so the user can press hotkeys that
      // would otherwise trigger app actions (e.g. Tab, Esc, even Ctrl+S).
      e.preventDefault()
      e.stopPropagation()

      // Cancel on Escape — check both `code` and `key` for cross-keyboard reliability.
      if (e.code === 'Escape' || e.key === 'Escape') {
        cancel()
        return
      }

      const result = formatHotkeyFromEvent({
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey
      })

      if (!result.ok) {
        // Modifier-only press: keep listening silently. Any other reason: show a hint.
        if (result.reason !== 'modifier-only') {
          setHint(REASON_HINTS[result.reason])
        }
        return
      }

      if (conflictWith && result.combo === conflictWith.combo) {
        setHint(`Already used for ${conflictWith.label}.`)
        return
      }

      onChange(result.combo)
      setRecording(false)
      setHint(null)
      void window.electronAPI?.hotkeys?.resume()
    }

    // Capture phase + window — we want first dibs on every key.
    // We also listen on document for redundancy (some Electron versions
    // dispatch keydown on document but not window in certain focus states).
    window.addEventListener('keydown', handler, true)
    document.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      document.removeEventListener('keydown', handler, true)
    }
  }, [recording, conflictWith, onChange, cancel])

  if (recording) {
    return (
      <div className="space-y-2">
        <div
          aria-live="polite"
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded border border-primary bg-surface-1'
          )}
        >
          <span className="loading-pulse text-sm font-mono text-text-primary flex-1">
            Press key combination…
          </span>
          {/* Cancel inline with the prompt so it's always visible. */}
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
        </div>
        {hint ? <div className="text-xs text-warning px-1">{hint}</div> : null}
        <div className="text-xs text-text-muted px-1">
          Or press <span className="font-mono">Esc</span> to cancel.
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <HotkeyChip hotkey={value} />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setRecording(true)
          setHint(null)
        }}
        aria-label={label ?? 'Change hotkey'}
      >
        Change…
      </Button>
    </div>
  )
}
