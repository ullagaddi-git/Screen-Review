// Types-only file for the settings IPC contract. Kept import-light so it
// can be referenced from the preload's .d.ts without dragging in services.
import type { Config } from '../services/store'

/**
 * What `settings:get` and `settings:set` return to the renderer.
 *
 * `openaiApiKey` is replaced with a boolean flag. The encrypted blob never
 * leaves the main process — the renderer doesn't need it; it just shows
 * "Key saved" vs "Add key" and can call `openai:test-key` with a fresh
 * plaintext key when the user wants to validate or replace it.
 */
export interface PublicConfig extends Omit<Config, 'openaiApiKey'> {
  hasOpenAIKey: boolean
}
