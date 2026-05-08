// Result panel bridge + the ResultPanelData type. Defined here (a .d.ts in
// src/preload/) so it's visible from BOTH the main tsconfig and the
// renderer tsconfig without dragging non-type files across project boundaries.
import type { AIErrorKind } from '../main/ipc/ai-types'

/**
 * Snapshot of state the result panel renders. The main process pushes this
 * via `result-panel:get-initial` (one-shot) and `result-panel:data` (updates).
 */
export type ResultPanelData =
  | {
      kind: 'success'
      /** PNG image as base64 (no data: prefix). Used for the thumbnail. */
      imageBase64: string
      /** AI response text. May contain ```code``` blocks. */
      text: string
      provider: 'ollama' | 'openai'
    }
  | {
      kind: 'error'
      /** PNG of what we captured, even though AI failed. Lets the user inspect it. */
      imageBase64: string
      errorKind: AIErrorKind
      message: string
      /** URL to open if the user clicks "Set up" / "Install" link. */
      setupHint?: string
    }
  | {
      kind: 'loading'
      imageBase64: string
      /** Optional progress message (e.g. "Analyzing…"). */
      label?: string
    }

export interface ResultBridge {
  getInitialData: () => Promise<ResultPanelData | null>
  onUpdate: (handler: (data: ResultPanelData) => void) => () => void
  copyText: (text: string) => Promise<void>
  copyImage: () => Promise<void>
  dismiss: () => void
  openExternal: (url: string) => void
  /** Opens the Settings window. Optional `tab` parameter focuses a specific tab on open. */
  openSettings: (tab?: string) => Promise<void>
}

declare global {
  interface Window {
    resultBridge: ResultBridge
  }
}

export {}
