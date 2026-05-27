// Live transcript panel — floating window that streams meeting chunks
// as they're transcribed by Whisper. Stays open during the meeting and
// across the "saving" transition so the user can do final copies after.
//
// Architecture:
//   - Subscribes to `liveTranscriptBridge.onChunk` on mount → appends to
//     local state, auto-scrolls.
//   - "Copy all" / "Copy last 5" → IPC to main; main writes to system
//     clipboard. We show a brief toast on success.
//   - "Open file" / "Open folder" — only available after the meeting's
//     saved event fires.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Copy,
  FolderOpen,
  FileText,
  X
} from 'lucide-react'

const LAST_N = 5

interface SavedState {
  filePath: string
}

export function LiveTranscriptPanel(): JSX.Element {
  const [chunks, setChunks] = useState<string[]>([])
  const [saved, setSaved] = useState<SavedState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Subscribe to chunk + saved events.
  useEffect(() => {
    // Fetch any chunks that arrived before we mounted (race-proof).
    window.liveTranscriptBridge.getCurrent().then((existing) => {
      if (existing.length > 0) setChunks(existing)
    })

    const offChunk = window.liveTranscriptBridge.onChunk(({ text }) => {
      setChunks((prev) => [...prev, text])
    })
    const offSaved = window.liveTranscriptBridge.onSaved(({ filePath }) => {
      setSaved({ filePath })
    })

    return () => {
      offChunk()
      offSaved()
    }
  }, [])

  // Auto-scroll to bottom each time a chunk arrives.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [chunks])

  const showToast = useCallback((msg: string): void => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 1500)
  }, [])

  const handleCopyAll = async (): Promise<void> => {
    const result = await window.liveTranscriptBridge.copyAll()
    showToast(
      result.count === 0
        ? 'Nothing to copy yet'
        : `Copied ${result.count} line${result.count === 1 ? '' : 's'}`
    )
  }

  const handleCopyLast = async (): Promise<void> => {
    const result = await window.liveTranscriptBridge.copyLast(LAST_N)
    showToast(
      result.count === 0
        ? 'Nothing to copy yet'
        : `Copied last ${result.count} line${result.count === 1 ? '' : 's'}`
    )
  }

  const handleOpenFile = (): void => {
    if (saved) window.liveTranscriptBridge.showFile(saved.filePath)
  }

  const handleClose = (): void => {
    // Close the window. The main process treats the user closing this
    // window as final cleanup — meeting is already stopped at this point.
    window.close()
  }

  return (
    <div className="flex flex-col h-full bg-surface-1 border border-border rounded shadow-panel overflow-hidden">
      {/* Header — drag region for moving the borderless window, plus close button */}
      <header className="drag-region flex items-center justify-between px-3 py-2 border-b border-border bg-surface-2 select-none">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={[
              'inline-block w-2 h-2 rounded-full',
              saved ? 'bg-text-muted' : 'bg-primary animate-mic-pulse'
            ].join(' ')}
          />
          <span className="text-xs font-mono text-text-primary uppercase tracking-wide">
            {saved ? 'Meeting saved' : 'Recording meeting'}
          </span>
          <span className="text-xs text-text-muted ml-1">
            · {chunks.length} line{chunks.length === 1 ? '' : 's'}
          </span>
        </div>
        <button
          onClick={handleClose}
          aria-label="Close transcript panel"
          className="no-drag p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors duration-fast cursor-pointer"
        >
          <X size={14} />
        </button>
      </header>

      {/* Transcript scroll body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-sm text-text-primary leading-relaxed"
      >
        {chunks.length === 0 ? (
          <p className="text-xs text-text-muted italic">
            Waiting for the first chunk… (Whisper processes audio in ~3 s
            windows. If nothing appears after 10 s, check that the meeting
            audio is playing through your speakers.)
          </p>
        ) : (
          chunks.map((c, i) => (
            <p key={i} className="chunk-fade-in whitespace-pre-wrap">
              {c.trim()}
            </p>
          ))
        )}
      </div>

      {/* Footer — copy actions + (after save) open-file action */}
      <footer className="no-drag flex flex-col gap-2 px-3 py-2 border-t border-border bg-surface-1">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyAll}
            disabled={chunks.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-primary text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-fast"
          >
            <Copy size={12} />
            Copy all
          </button>
          <button
            onClick={handleCopyLast}
            disabled={chunks.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded border border-border text-text-primary hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-fast"
          >
            <Copy size={12} />
            Copy last {LAST_N}
          </button>
          {saved ? (
            <button
              onClick={handleOpenFile}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded border border-border text-text-primary hover:bg-surface-3 cursor-pointer transition-colors duration-fast ml-auto"
            >
              <FolderOpen size={12} />
              Open file
            </button>
          ) : null}
        </div>
        {saved ? (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <FileText size={11} />
            <span className="truncate font-mono" title={saved.filePath}>
              {saved.filePath}
            </span>
          </div>
        ) : (
          <div className="text-xs text-text-muted">
            Tip: paste anywhere with Ctrl+V — works in your meeting chat,
            email, notes, Slack, etc.
          </div>
        )}
        {toast ? (
          <div className="text-xs text-success font-medium">{toast}</div>
        ) : null}
      </footer>
    </div>
  )
}
