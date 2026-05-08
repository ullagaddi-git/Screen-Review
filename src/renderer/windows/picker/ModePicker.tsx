import { useEffect, useRef, useState } from 'react'
import { Square, AppWindow, Monitor, ScrollText } from 'lucide-react'
import { StatusDot } from '../../components/ui'
import { keyToAction } from './mode-picker-keyboard'

export type CaptureMode = 'region' | 'window' | 'desktop' | 'autoscroll'

interface ModeItem {
  id: CaptureMode
  label: string
  Icon: typeof Square
}

const MODES: ModeItem[] = [
  { id: 'region', label: 'Region', Icon: Square },
  { id: 'window', label: 'Window', Icon: AppWindow },
  { id: 'desktop', label: 'Desktop', Icon: Monitor },
  { id: 'autoscroll', label: 'Auto-scroll', Icon: ScrollText }
]

interface OllamaState {
  running: boolean
  models: string[]
  error?: string
}

export function ModePicker(): JSX.Element {
  const [focusIdx, setFocusIdx] = useState(0)
  const [ollama, setOllama] = useState<OllamaState | null>(null)
  const [targetTitle, setTargetTitle] = useState<string | null>(null)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    window.pickerBridge.checkOllama().then(setOllama)
    window.pickerBridge.getTargetTitle().then(setTargetTitle)
  }, [])

  useEffect(() => {
    buttonRefs.current[focusIdx]?.focus()
  }, [focusIdx])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const action = keyToAction(focusIdx, MODES.length, {
        key: e.key,
        shiftKey: e.shiftKey
      })
      if (action.kind === 'noop') return

      // We handled it — stop the browser's default focus-traversal so Tab /
      // Shift+Tab wrap inside the picker instead of leaking out to chrome.
      e.preventDefault()

      switch (action.kind) {
        case 'cancel':
          window.pickerBridge.cancel()
          return
        case 'select':
          select(MODES[focusIdx].id)
          return
        case 'move':
          setFocusIdx(action.idx)
          return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusIdx])

  const select = (mode: CaptureMode): void => {
    window.pickerBridge.selectMode(mode)
  }

  const ollamaStatus =
    ollama === null
      ? { kind: 'info' as const, label: 'Checking Ollama…' }
      : ollama.running
        ? { kind: 'success' as const, label: `Ollama running (${ollama.models.length} models)` }
        : { kind: 'warning' as const, label: 'Ollama not running — AI analysis unavailable' }

  return (
    <div
      className="bg-surface-1 border border-border rounded shadow-panel px-4 py-3 select-none"
      role="dialog"
      aria-label="Capture mode"
    >
      <div className="flex items-center gap-2">
        {MODES.map((m, idx) => {
          const isFocused = idx === focusIdx
          const Icon = m.Icon
          return (
            <button
              key={m.id}
              ref={(el) => {
                buttonRefs.current[idx] = el
              }}
              onClick={() => select(m.id)}
              onMouseEnter={() => setFocusIdx(idx)}
              className={[
                'flex flex-col items-center justify-center gap-1 px-4 py-2 rounded',
                'text-xs font-medium transition-colors duration-fast outline-none',
                // Always show the 2px focus ring on the active mode button —
                // tying it to our internal `isFocused` (rather than
                // :focus-visible) means the ring shows reliably whether the
                // user got there via keyboard, programmatic .focus() after a
                // hotkey, or mouse hover. Non-active buttons stay clean.
                isFocused
                  ? 'bg-surface-3 text-text-primary border border-primary ring-2 ring-primary ring-offset-2 ring-offset-bg-base'
                  : 'text-text-primary border border-border hover:bg-surface-3'
              ].join(' ')}
            >
              <Icon size={20} aria-hidden />
              <span>{m.label}</span>
            </button>
          )
        })}
      </div>
      {targetTitle ? (
        <div className="mt-2 flex items-center justify-center text-xs">
          <span className="text-text-muted">Window/Auto-scroll target: </span>
          <span className="text-text-primary font-mono ml-1.5 truncate max-w-md">
            {targetTitle}
          </span>
        </div>
      ) : null}
      <div className="mt-1 flex items-center justify-center">
        <StatusDot status={ollamaStatus.kind} label={ollamaStatus.label} />
      </div>
      <div className="mt-2 text-center text-xs text-text-muted font-mono">
        ←→ navigate · Enter to pick · Esc to cancel
      </div>
    </div>
  )
}
