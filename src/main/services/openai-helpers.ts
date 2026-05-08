// Pure helpers for OpenAI Chat Completions vision requests.
// Extracted so we can unit-test request shape, response parsing, and error
// classification without an API key or network access.

export type OpenAIRole = 'system' | 'user' | 'assistant'

export interface OpenAITextPart {
  type: 'text'
  text: string
}

export interface OpenAIImagePart {
  type: 'image_url'
  image_url: { url: string }
}

export type OpenAIContentPart = OpenAITextPart | OpenAIImagePart

export interface OpenAIMessage {
  role: OpenAIRole
  content: OpenAIContentPart[]
}

/**
 * Builds the messages array for `chat.completions.create` with a vision input.
 * Mirrors the PRD's API spec for image analysis: a single user message with
 * the prompt as text plus the image as a data URL.
 */
export function buildAnalyzeMessages(prompt: string, imageBase64: string): OpenAIMessage[] {
  if (!prompt || !prompt.trim()) throw new Error('Prompt is required')
  if (!imageBase64) throw new Error('Image base64 is required')
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt.trim() },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${imageBase64}` }
        }
      ]
    }
  ]
}

/**
 * Extracts the text response from a Chat Completions response object.
 * Returns empty string for malformed or missing content.
 */
export function parseAnalyzeResponse(response: unknown): string {
  if (!response || typeof response !== 'object') return ''
  const r = response as { choices?: unknown }
  if (!Array.isArray(r.choices) || r.choices.length === 0) return ''
  const first = r.choices[0]
  if (!first || typeof first !== 'object') return ''
  const message = (first as { message?: unknown }).message
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content !== 'string') return ''
  return content.trim()
}

export type OpenAIErrorKind =
  | 'auth' // 401 — bad API key
  | 'rate-limit' // 429 — too many requests
  | 'quota' // 429 with insufficient_quota
  | 'timeout' // request took too long
  | 'network' // unreachable / connection error
  | 'unknown'

/**
 * Classifies an error from the OpenAI SDK or axios into a small enum we can
 * switch on in the result panel UI. Avoids leaking SDK-specific types.
 */
export function classifyOpenAIError(err: unknown): {
  kind: OpenAIErrorKind
  message: string
} {
  if (err && typeof err === 'object') {
    const e = err as {
      status?: number
      code?: string
      message?: string
      type?: string
      error?: { type?: string; code?: string; message?: string }
    }
    const status = e.status
    const code = e.code ?? e.error?.code
    const type = e.type ?? e.error?.type
    const message = e.error?.message ?? e.message ?? 'Unknown OpenAI error'

    if (status === 401) return { kind: 'auth', message }
    if (status === 429) {
      if (type === 'insufficient_quota' || code === 'insufficient_quota') {
        return { kind: 'quota', message }
      }
      return { kind: 'rate-limit', message }
    }
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(message)) {
      return { kind: 'timeout', message }
    }
    if (
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      /network|fetch failed/i.test(message)
    ) {
      return { kind: 'network', message }
    }
    return { kind: 'unknown', message }
  }
  return { kind: 'unknown', message: String(err) }
}

/**
 * Returns true if a string looks like an OpenAI API key (starts with `sk-`,
 * has reasonable length). Used as a cheap client-side sanity check before
 * spending an API call to test it.
 */
export function isPlausibleApiKey(key: string): boolean {
  if (typeof key !== 'string') return false
  const trimmed = key.trim()
  if (trimmed.length < 20) return false
  return /^sk-[A-Za-z0-9_-]+$/.test(trimmed)
}
