// Pure keyboard-navigation helpers for the ModePicker. Extracted from the
// component so the reducer can be unit-tested without rendering React or
// spinning up Electron. The component just maps DOM KeyboardEvents through
// `keyToAction` and dispatches the resulting NavAction.
//
// L2 acceptance criteria for TASK-041:
//  - First mode button receives focus on open  (handled in component init)
//  - Arrow Left/Right wrap around the 4 modes
//  - Tab AND Shift+Tab also navigate (forward / backward respectively)
//  - Enter selects the focused mode
//  - Escape cancels (closes picker)

export type NavAction =
  | { kind: 'move'; idx: number }
  | { kind: 'select' }
  | { kind: 'cancel' }
  | { kind: 'noop' }

export interface KeyInput {
  key: string
  shiftKey?: boolean
}

/**
 * Computes the next focus index, wrapping around at the ends.
 * `direction` is +1 (forward) or -1 (backward). `total` must be >= 1.
 */
export function nextIdx(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return 0
  return (current + direction + total) % total
}

/**
 * Maps a keyboard event to the NavAction the component should perform.
 * Returns `{ kind: 'noop' }` for any key the picker doesn't care about, so
 * the caller can decide whether to preventDefault.
 */
export function keyToAction(currentIdx: number, total: number, e: KeyInput): NavAction {
  if (e.key === 'Escape') return { kind: 'cancel' }
  if (e.key === 'Enter') return { kind: 'select' }
  if (e.key === 'ArrowRight') return { kind: 'move', idx: nextIdx(currentIdx, total, 1) }
  if (e.key === 'ArrowLeft') return { kind: 'move', idx: nextIdx(currentIdx, total, -1) }
  if (e.key === 'Tab') {
    // Shift+Tab → backward; plain Tab → forward. Both wrap.
    const dir: 1 | -1 = e.shiftKey ? -1 : 1
    return { kind: 'move', idx: nextIdx(currentIdx, total, dir) }
  }
  return { kind: 'noop' }
}
