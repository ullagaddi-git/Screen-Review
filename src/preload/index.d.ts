import type { Config } from '../main/services/store'
import type { PublicConfig } from '../main/ipc/settings-types'
import type {
  OllamaCheckResult,
  OpenAITestKeyResult,
  AIAnalyzeIPCRequest,
  AIAnalyzeIPCResult
} from '../main/ipc/ai-types'

export type VoiceStatePayload = {
  state: 'idle' | 'recording' | 'transcribing' | 'error'
  message?: string
  text?: string
}

export interface ElectronAPI {
  settings: {
    get: () => Promise<PublicConfig>
    set: (partial: Partial<Config>) => Promise<PublicConfig>
    /** Fires when another window (e.g. result panel) requests focusing a specific tab. */
    onFocusTab: (handler: (tab: string) => void) => () => void
  }
  openExternal: (url: string) => Promise<void>
  hotkeys: {
    pause: () => Promise<void>
    resume: () => Promise<void>
  }
  app: {
    getInfo: () => Promise<{ version: string; isPackaged: boolean; loginItemEnabled: boolean }>
    checkForUpdates: () => Promise<{
      status: 'up-to-date' | 'available' | 'unavailable' | 'error'
      message?: string
      version?: string
    }>
    getMemory: () => Promise<{
      mainProcessMB: number
      rendererMB: number
      otherMB: number
      totalMB: number
      liveWindowCount: number
      meetsIdleTarget: boolean
    } | null>
  }
  ollama: {
    check: () => Promise<OllamaCheckResult>
  }
  openai: {
    testKey: (apiKey: string) => Promise<OpenAITestKeyResult>
  }
  ai: {
    analyze: (req: AIAnalyzeIPCRequest) => Promise<AIAnalyzeIPCResult>
  }
  voice: {
    requestStart: () => Promise<{ ok: boolean; error?: string }>
    requestStartStream: () => Promise<{ ok: boolean; error?: string }>
    requestStop: () => Promise<{ ok: boolean }>
    reloadHotkey: () => Promise<{ ok: boolean; hotkey?: string }>
    onStateChange: (handler: (payload: VoiceStatePayload) => void) => () => void
  }
  transcribeFile: {
    run: (payload: {
      sourceFilename: string
      durationSeconds: number
      wav: ArrayBuffer
    }) => Promise<
      | { ok: true; transcript: string; durationSeconds: number; sourceFilename: string }
      | { ok: false; error: string }
    >
    extractActions: (
      transcript: string
    ) => Promise<{ ok: boolean; text?: string; error?: string; provider?: string }>
    saveTranscript: (payload: {
      sourceFilename: string
      durationSeconds: number
      transcript: string
    }) => Promise<{ ok: boolean; filePath?: string; error?: string }>
    saveActions: (payload: {
      sourceFilename: string
      actions: string
    }) => Promise<{ ok: boolean; filePath?: string; error?: string }>
    openFolder: () => Promise<{ ok: boolean; folder?: string }>
    showFile: (filePath: string) => Promise<{ ok: boolean }>
  }
  meeting: {
    toggle: () => Promise<{ ok: boolean; state: 'idle' | 'recording' | 'saving' }>
    getState: () => Promise<{
      state: 'idle' | 'recording' | 'saving'
      consentAcknowledged: boolean
    }>
    acknowledgeConsent: () => Promise<{ ok: boolean }>
    openFolder: () => Promise<{ ok: boolean }>
  }
  capture: {
    execute: (mode: 'region' | 'window' | 'desktop' | 'autoscroll') => Promise<{
      mode: string
      width: number
      height: number
      base64: string
      singleFrame?: boolean
      warning?: string
    }>
    reloadHotkey: () => Promise<{ ok: boolean; hotkey?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
