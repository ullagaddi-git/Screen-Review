// Pure router for picking which AI backend handles a capture.
// Extracted as a pure function so it's unit-testable without spinning up
// services or filling in config.

export type AIMode = 'local' | 'cloud' | 'ask'
export type AIStrategy = 'ollama' | 'openai'

export interface RouterInput {
  aiMode: AIMode
  /** Whether an OpenAI key is currently stored (post-decrypt). */
  hasOpenAIKey: boolean
}

/**
 * Decides which backend to use:
 *   - `local` → ollama (always; falls through to error if Ollama is down)
 *   - `cloud` → openai (always; falls through to "key missing" error if not set)
 *   - `ask`   → defaults to ollama in v1 per the roadmap. The renderer will
 *               eventually expose a per-capture chooser (out of scope here).
 *
 * We do NOT auto-fallback from cloud → local on errors. Each mode is a
 * deliberate user choice; surfacing the actual error helps them fix the
 * underlying problem (start Ollama, fix the API key) rather than masking it.
 */
export function pickStrategy(input: RouterInput): AIStrategy {
  if (input.aiMode === 'cloud') return 'openai'
  // local + ask both go to ollama
  return 'ollama'
}
