// Pure helpers for the Ollama API. Extracted so we can unit-test request
// shape and response parsing without spinning up a real Ollama instance.

export const DEFAULT_PROMPT =
  'You are analyzing a screenshot. Describe what you see. If there are errors, exceptions, or stack traces, explain what caused them and suggest a specific fix. If there is code, summarize what it does. Be concise and technical.'

export interface AnalyzeRequestOptions {
  model: string
  /** PNG image as base64 (no data: prefix). */
  imageBase64: string
  prompt?: string
}

export interface OllamaAnalyzeBody {
  model: string
  prompt: string
  images: string[]
  stream: false
  /**
   * Ollama-specific generation options. We cap `num_predict` to keep
   * inference time reasonable on CPU — vision generation scales linearly
   * with output tokens, so a 256-token cap roughly halves typical wait
   * times vs the model's default (~512–1024).
   */
  options?: {
    num_predict?: number
    temperature?: number
  }
}

/**
 * Default cap on Ollama output length. Concise responses also fit better in
 * the result panel UI. Lower values dramatically reduce wait time on CPU
 * (each token takes ~50–200 ms on typical hardware), at the cost of less
 * descriptive responses. 128 is enough for "this is X with Y error, fix Z."
 */
export const MAX_OUTPUT_TOKENS = 128

/** Builds the POST body for Ollama's /api/generate endpoint. */
export function buildAnalyzeRequest(opts: AnalyzeRequestOptions): OllamaAnalyzeBody {
  if (!opts.model) throw new Error('Ollama model is required')
  if (!opts.imageBase64) throw new Error('Image base64 is required')
  return {
    model: opts.model,
    prompt: opts.prompt && opts.prompt.trim() ? opts.prompt : DEFAULT_PROMPT,
    images: [opts.imageBase64],
    stream: false,
    options: {
      num_predict: MAX_OUTPUT_TOKENS,
      temperature: 0.1 // low temp → faster + more deterministic for analysis
    }
  }
}

/**
 * Extracts the response text from Ollama's /api/generate response.
 * Returns empty string for malformed responses (caller decides what to do).
 */
export function parseAnalyzeResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const body = data as { response?: unknown }
  if (typeof body.response !== 'string') return ''
  return body.response.trim()
}

/**
 * Extracts model names from Ollama's /api/tags response.
 * Returns [] for malformed responses.
 */
export function parseModelsResponse(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []
  const body = data as { models?: unknown }
  if (!Array.isArray(body.models)) return []
  const names: string[] = []
  for (const m of body.models) {
    if (m && typeof m === 'object' && typeof (m as { name?: unknown }).name === 'string') {
      names.push((m as { name: string }).name)
    }
  }
  return names
}

/** Normalizes an ollamaHost value: ensures it has a scheme and no trailing slash. */
export function normalizeHost(host: string): string {
  let h = host.trim()
  if (!h) h = 'http://localhost:11434'
  if (!/^https?:\/\//i.test(h)) h = `http://${h}`
  return h.replace(/\/+$/, '')
}
