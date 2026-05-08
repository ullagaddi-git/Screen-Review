// Pure helpers for the first-run experience. Extracted from first-run.ts so
// the message-formatting and decision logic can be unit-tested without
// spinning up Electron Notification or hitting Ollama.

export interface FirstRunInput {
  isFirstRun: boolean
  notificationsEnabled: boolean
  voiceHotkey: string
  captureHotkey: string
}

/**
 * Decides whether to show the welcome notification at all.
 * Returns false if it's not the first run, or if the user has tray
 * notifications turned off (we honor that as a global silence preference).
 */
export function shouldShowWelcome(input: FirstRunInput): boolean {
  return input.isFirstRun && input.notificationsEnabled
}

/**
 * Builds the welcome message body, substituting the user's currently-bound
 * hotkeys so the prompt always matches what they actually have configured.
 */
export function welcomeBody(voiceHotkey: string, captureHotkey: string): string {
  return `Hold ${voiceHotkey} to dictate, press ${captureHotkey} to capture & analyze a screenshot.`
}

export interface OllamaPromptInput {
  isFirstRun: boolean
  notificationsEnabled: boolean
  ollamaRunning: boolean
}

/**
 * Decides whether to nudge the user to install Ollama. Only shows on first
 * run AND if Ollama is genuinely not running (we don't want to badger users
 * who have it set up). Subject to the same notifications-off opt-out.
 */
export function shouldPromptOllama(input: OllamaPromptInput): boolean {
  return input.isFirstRun && input.notificationsEnabled && !input.ollamaRunning
}
