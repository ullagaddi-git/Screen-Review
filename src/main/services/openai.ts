import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { decryptSecret } from './secret-store'
import { getConfigValue } from './store'
import {
  buildAnalyzeMessages,
  classifyOpenAIError,
  parseAnalyzeResponse,
  type OpenAIErrorKind
} from './openai-helpers'

const ANALYZE_TIMEOUT_MS = 30_000
const TEST_KEY_TIMEOUT_MS = 10_000
const DEFAULT_MODEL = 'gpt-4o'
const MAX_OUTPUT_TOKENS = 1000

export interface OpenAIAnalyzeOptions {
  /** Override API key. Falls back to the encrypted key in config. */
  apiKey?: string
  /** Override model. Defaults to gpt-4o. */
  model?: string
  prompt: string
  /** PNG image as base64 (no data: prefix). */
  imageBase64: string
}

export class OpenAIError extends Error {
  constructor(
    message: string,
    public readonly kind: OpenAIErrorKind
  ) {
    super(message)
    this.name = 'OpenAIError'
  }
}

export class OpenAIKeyMissingError extends Error {
  constructor() {
    super('No OpenAI API key configured. Add one in Settings → AI.')
    this.name = 'OpenAIKeyMissingError'
  }
}

class OpenAIService {
  private static instance: OpenAIService | null = null

  static getInstance(): OpenAIService {
    if (!OpenAIService.instance) OpenAIService.instance = new OpenAIService()
    return OpenAIService.instance
  }

  /**
   * Returns the stored API key (decrypted) or null if not set / can't decrypt.
   * Never logs the key. Never returns the encrypted form.
   */
  getStoredKey(): string | null {
    const enc = getConfigValue('openaiApiKey')
    return decryptSecret(enc)
  }

  /**
   * Validates an API key by calling /v1/models. Returns valid:true on 200,
   * valid:false with a useful error message on 401/network/timeout etc.
   * Never throws.
   */
  async testKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return { valid: false, error: 'Empty key' }
    }
    try {
      const client = new OpenAI({
        apiKey: apiKey.trim(),
        timeout: TEST_KEY_TIMEOUT_MS,
        // Important: we do NOT want this client to be used by anything
        // accidentally — it's purely for the test call.
        maxRetries: 0
      })
      // Calling /v1/models is the cheapest way to validate a key; it costs
      // nothing and returns immediately on auth failure.
      await client.models.list()
      return { valid: true }
    } catch (err) {
      const c = classifyOpenAIError(err)
      const friendly =
        c.kind === 'auth'
          ? 'Invalid API key — check the key and try again.'
          : c.kind === 'rate-limit'
            ? 'Rate limited — try again in a moment.'
            : c.kind === 'quota'
              ? 'API quota exceeded — check your OpenAI billing.'
              : c.kind === 'timeout'
                ? 'Connection timed out.'
                : c.kind === 'network'
                  ? 'Could not reach api.openai.com — check your network.'
                  : c.message
      return { valid: false, error: friendly }
    }
  }

  /**
   * Analyzes an image with GPT-4o vision. Throws OpenAIError on failure so
   * the AI router can surface a typed message in the result panel.
   */
  async analyze(opts: OpenAIAnalyzeOptions): Promise<string> {
    const apiKey = opts.apiKey ?? this.getStoredKey()
    if (!apiKey) throw new OpenAIKeyMissingError()

    const model = opts.model ?? DEFAULT_MODEL
    const messages = buildAnalyzeMessages(opts.prompt, opts.imageBase64)

    let response
    try {
      const client = new OpenAI({
        apiKey,
        timeout: ANALYZE_TIMEOUT_MS,
        maxRetries: 1
      })
      response = await client.chat.completions.create({
        model,
        // Cast: our buildAnalyzeMessages produces a single user message that
        // satisfies the SDK's discriminated union, but the structural type
        // we export is intentionally simpler/more reusable.
        messages: messages as unknown as ChatCompletionMessageParam[],
        max_tokens: MAX_OUTPUT_TOKENS
      })
    } catch (err) {
      const c = classifyOpenAIError(err)
      throw new OpenAIError(c.message, c.kind)
    }

    const text = parseAnalyzeResponse(response)
    if (!text) {
      throw new OpenAIError(
        'OpenAI returned an empty response. Try a different prompt.',
        'unknown'
      )
    }
    return text
  }
}

export const openaiService = OpenAIService.getInstance()
