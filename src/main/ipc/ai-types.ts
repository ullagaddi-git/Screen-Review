// Types-only file for the AI IPC contract. The renderer's preload .d.ts
// references these types, and we don't want pulling them in to drag along
// every implementation module (ollama, openai, axios, sharp, etc.).
// Keep this file imports-free or import-only-of-other-types.

export interface OllamaCheckResult {
  running: boolean
  models: string[]
  /** Selected model from config — useful for the UI to show which one is active. */
  selectedModel?: string
  error?: string
}

export interface OpenAITestKeyResult {
  valid: boolean
  error?: string
}

/**
 * Stable contract for `ai:analyze`. The result panel switches on `errorKind`
 * to render the right setup link / message — these strings are part of the
 * IPC API surface.
 */
export type AIErrorKind =
  | 'ollama-unavailable'
  | 'ollama-model-missing'
  | 'ollama-timeout'
  | 'ollama-error'
  | 'openai-key-missing'
  | 'openai-auth'
  | 'openai-rate-limit'
  | 'openai-quota'
  | 'openai-timeout'
  | 'openai-network'
  | 'openai-error'
  | 'router-error'

export type AIAnalyzeIPCResult =
  | { ok: true; text: string; provider: 'ollama' | 'openai' }
  | {
      ok: false
      provider: 'ollama' | 'openai' | 'router'
      errorKind: AIErrorKind
      message: string
      setupHint?: string
    }

export interface AIAnalyzeIPCRequest {
  /** PNG image as base64 (no data: prefix). */
  imageBase64: string
  /** Optional override prompt. Falls back to the backend's default. */
  prompt?: string
}
