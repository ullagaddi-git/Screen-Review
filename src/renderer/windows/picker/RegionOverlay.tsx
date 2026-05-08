import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface Point {
  x: number
  y: number
}

interface Selection {
  start: Point
  end: Point
}

const MIN_SIZE = 50

function normalize(sel: Selection): { x: number; y: number; w: number; h: number } {
  const x = Math.min(sel.start.x, sel.end.x)
  const y = Math.min(sel.start.y, sel.end.y)
  const w = Math.abs(sel.end.x - sel.start.x)
  const h = Math.abs(sel.end.y - sel.start.y)
  return { x, y, w, h }
}

export function RegionOverlay(): JSX.Element {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [tooSmall, setTooSmall] = useState(false)
  const dragging = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        window.regionBridge.cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    // Right-click also cancels (in case Esc isn't reaching us).
    const onContext = (e: MouseEvent): void => {
      e.preventDefault()
      window.regionBridge.cancel()
    }
    window.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [])

  const onMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    dragging.current = true
    setTooSmall(false)
    setSelection({
      start: { x: e.clientX, y: e.clientY },
      end: { x: e.clientX, y: e.clientY }
    })
  }

  const onMouseMove = (e: React.MouseEvent): void => {
    if (!dragging.current || !selection) return
    setSelection({ start: selection.start, end: { x: e.clientX, y: e.clientY } })
  }

  const onMouseUp = (): void => {
    if (!dragging.current || !selection) return
    dragging.current = false
    const rect = normalize(selection)
    if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) {
      setTooSmall(true)
      setSelection(null)
      setTimeout(() => setTooSmall(false), 1500)
      return
    }
    window.regionBridge.complete(rect).catch((err) => {
      // Surface unexpected IPC failures to the dev console only — under normal
      // operation main returns void and we don't need a confirmation here.
      console.warn('[region-overlay] complete failed:', String(err))
    })
  }

  const rect = selection ? normalize(selection) : null

  return (
    <div
      className="absolute inset-0 select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      style={{
        cursor: 'crosshair',
        // Near-invisible bg color forces Windows to hit-test transparent pixels
        // — without this, mousedown on the empty overlay falls through to the OS.
        backgroundColor: 'rgba(0, 0, 0, 0.001)'
      }}
    >
      {/* Dim layer — covers everything except the selection */}
      {rect && rect.w > 0 && rect.h > 0 ? (
        <>
          {/* Top */}
          <div className="absolute pointer-events-none bg-black/40" style={{ left: 0, top: 0, right: 0, height: rect.y }} />
          {/* Bottom */}
          <div className="absolute pointer-events-none bg-black/40" style={{ left: 0, top: rect.y + rect.h, right: 0, bottom: 0 }} />
          {/* Left */}
          <div className="absolute pointer-events-none bg-black/40" style={{ left: 0, top: rect.y, width: rect.x, height: rect.h }} />
          {/* Right */}
          <div className="absolute pointer-events-none bg-black/40" style={{ left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h }} />
          {/* Selection outline */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              boxShadow: '0 0 0 2px var(--color-primary)'
            }}
          />
          {/* Dimensions readout */}
          <div
            className="absolute text-xs font-mono text-text-primary bg-surface-1 border border-border rounded-sm px-2 py-1 pointer-events-none"
            style={{
              left: Math.min(rect.x, window.innerWidth - 140),
              top: Math.max(rect.y - 28, 4)
            }}
          >
            {rect.w} × {rect.h}
          </div>
        </>
      ) : (
        <div className="absolute inset-0 pointer-events-none bg-black/40" />
      )}

      {/* Bottom instruction */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs font-mono text-text-primary bg-surface-1 border border-border rounded-sm px-3 py-2 pointer-events-none">
        {tooSmall ? (
          <span className="text-warning">Selection too small — try a larger area</span>
        ) : (
          <>Drag to select • Release to capture • Esc or right-click to cancel</>
        )}
      </div>

      {/* Always-visible cancel button (top-right) — escape hatch in case keyboard/mouse misroutes */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          window.regionBridge.cancel()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 rounded bg-surface-1 border border-border text-text-primary hover:bg-surface-3 text-xs font-medium cursor-pointer"
        title="Cancel region capture"
      >
        <X size={14} />
        Cancel
      </button>
    </div>
  )
}
