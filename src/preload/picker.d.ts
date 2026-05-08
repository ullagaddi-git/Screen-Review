import type { OllamaCheckResult } from '../main/ipc/ai-types'

export type PickerCaptureMode = 'region' | 'window' | 'desktop' | 'autoscroll'

export interface PickerBridge {
  selectMode: (mode: PickerCaptureMode) => void
  cancel: () => void
  checkOllama: () => Promise<OllamaCheckResult>
  getTargetTitle: () => Promise<string | null>
}

declare global {
  interface Window {
    pickerBridge: PickerBridge
  }
}

export {}
