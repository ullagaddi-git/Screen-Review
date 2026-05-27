import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Config } from './services/store'
import type { PublicConfig } from './ipc/settings-types'
import type {
  OllamaCheckResult,
  OpenAITestKeyResult,
  AIAnalyzeIPCRequest,
  AIAnalyzeIPCResult
} from './ipc/ai-types'

export type VoiceStatePayload = {
  state: 'idle' | 'recording' | 'transcribing' | 'error'
  message?: string
  text?: string
}

type VoiceStateHandler = (payload: VoiceStatePayload) => void

type FocusTabHandler = (tab: string) => void

const api = {
  settings: {
    get: (): Promise<PublicConfig> => ipcRenderer.invoke('settings:get'),
    set: (partial: Partial<Config>): Promise<PublicConfig> =>
      ipcRenderer.invoke('settings:set', partial),
    onFocusTab: (handler: FocusTabHandler): (() => void) => {
      const listener = (_event: IpcRendererEvent, tab: string): void => handler(tab)
      ipcRenderer.on('settings:focus-tab', listener)
      return () => ipcRenderer.removeListener('settings:focus-tab', listener)
    }
  },
  /** Opens an http(s) URL in the user's default browser. */
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
  hotkeys: {
    /** Suspend global hotkeys (voice + capture). Used during Settings → Hotkeys recording. */
    pause: (): Promise<void> => ipcRenderer.invoke('hotkeys:pause'),
    /** Re-register global hotkeys from current config. */
    resume: (): Promise<void> => ipcRenderer.invoke('hotkeys:resume')
  },
  app: {
    getInfo: (): Promise<{ version: string; isPackaged: boolean; loginItemEnabled: boolean }> =>
      ipcRenderer.invoke('app:get-info'),
    checkForUpdates: (): Promise<{
      status: 'up-to-date' | 'available' | 'unavailable' | 'error'
      message?: string
      version?: string
    }> => ipcRenderer.invoke('app:check-for-updates'),
    getMemory: (): Promise<{
      mainProcessMB: number
      rendererMB: number
      otherMB: number
      totalMB: number
      liveWindowCount: number
      meetsIdleTarget: boolean
    } | null> => ipcRenderer.invoke('app:get-memory')
  },
  ollama: {
    check: (): Promise<OllamaCheckResult> => ipcRenderer.invoke('ollama:check')
  },
  openai: {
    testKey: (apiKey: string): Promise<OpenAITestKeyResult> =>
      ipcRenderer.invoke('openai:test-key', apiKey)
  },
  ai: {
    analyze: (req: AIAnalyzeIPCRequest): Promise<AIAnalyzeIPCResult> =>
      ipcRenderer.invoke('ai:analyze', req)
  },
  voice: {
    requestStart: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('voice:request-start'),
    /**
     * Force a stream-mode dictation session regardless of the global
     * voiceStreamPaste setting. Used by the dedicated "Start live
     * streaming" button in the Voice tab.
     */
    requestStartStream: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('voice:request-start-stream'),
    requestStop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('voice:request-stop'),
    reloadHotkey: (): Promise<{ ok: boolean; hotkey?: string }> =>
      ipcRenderer.invoke('voice:reload-hotkey'),
    onStateChange: (handler: VoiceStateHandler): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: VoiceStatePayload): void =>
        handler(payload)
      ipcRenderer.on('voice:state', listener)
      return () => ipcRenderer.removeListener('voice:state', listener)
    }
  },
  /**
   * Upload-and-transcribe (TASK-060). Renderer decodes the user's
   * uploaded audio/video into a 16 kHz mono WAV via Web Audio API,
   * then sends the WAV here. Main runs whisper-cli + optionally the
   * action-items LLM prompt.
   */
  transcribeFile: {
    run: (payload: {
      sourceFilename: string
      durationSeconds: number
      wav: ArrayBuffer
    }): Promise<
      | { ok: true; transcript: string; durationSeconds: number; sourceFilename: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('transcribe-file:run', payload),
    extractActions: (
      transcript: string
    ): Promise<{ ok: boolean; text?: string; error?: string; provider?: string }> =>
      ipcRenderer.invoke('transcribe-file:extract-actions', transcript),
    saveTranscript: (payload: {
      sourceFilename: string
      durationSeconds: number
      transcript: string
    }): Promise<{ ok: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('transcribe-file:save-transcript', payload),
    saveActions: (payload: {
      sourceFilename: string
      actions: string
    }): Promise<{ ok: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('transcribe-file:save-actions', payload),
    openFolder: (): Promise<{ ok: boolean; folder?: string }> =>
      ipcRenderer.invoke('transcribe-file:open-folder'),
    showFile: (filePath: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('transcribe-file:show-file', filePath)
  },
  meeting: {
    /** Start or stop the meeting recording (single-tap toggle semantics). */
    toggle: (): Promise<{ ok: boolean; state: 'idle' | 'recording' | 'saving' }> =>
      ipcRenderer.invoke('meeting:toggle'),
    /** Current meeting state + whether the consent banner has been acknowledged. */
    getState: (): Promise<{
      state: 'idle' | 'recording' | 'saving'
      consentAcknowledged: boolean
    }> => ipcRenderer.invoke('meeting:get-state'),
    /** Persist the user's acknowledgement of the recording-consent banner. */
    acknowledgeConsent: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('meeting:acknowledge-consent'),
    /** Open the meetings folder in Explorer. */
    openFolder: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('meeting:open-folder')
  },
  capture: {
    execute: (
      mode: 'region' | 'window' | 'desktop' | 'autoscroll'
    ): Promise<{
      mode: string
      width: number
      height: number
      base64: string
      singleFrame?: boolean
      warning?: string
    }> => ipcRenderer.invoke('capture:execute', mode),
    reloadHotkey: (): Promise<{ ok: boolean; hotkey?: string }> =>
      ipcRenderer.invoke('capture:reload-hotkey')
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
