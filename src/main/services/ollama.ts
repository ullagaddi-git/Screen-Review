import axios, { type AxiosInstance } from 'axios'
import { getConfigValue } from './store'
import {
  buildAnalyzeRequest,
  normalizeHost,
  parseAnalyzeResponse,
  parseModelsResponse
} from './ollama-helpers'

export { DEFAULT_PROMPT } from './ollama-helpers'

const CHECK_TIMEOUT_MS = 2_000
const MODELS_TIMEOUT_MS = 5_000
// Cold-start of a vision model on CPU can legitimately take 60–180 s on
// first inference (model loads into RAM, processes the image, generates
// tokens). Subsequent calls within Ollama's keep_alive window (5 min by
// default) take ~5–20 s. Originally 30 s per the PRD spec, but that
// assumed GPU acceleration; CPU users hit timeout false-positives.
// Combined with image resize + num_predict cap, this rarely fires now.
const ANALYZE_TIMEOUT_MS = 180_000

export interface OllamaAnalyzeOptions {
  /** Override model name. Falls back to config.ollamaModel. */
  model?: string
  /** Override prompt. Falls back to DEFAULT_PROMPT. */
  prompt?: string
  /** PNG image as base64 (no data: prefix). */
  imageBase64: string
}

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'unreachable'
      | 'model-missing'
      | 'timeout'
      | 'http-error'
      | 'invalid-response'
  ) {
    super(message)
    this.name = 'OllamaError'
  }
}

class OllamaService {
  private static instance: OllamaService | null = null

  static getInstance(): OllamaService {
    if (!OllamaService.instance) OllamaService.instance = new OllamaService()
    return OllamaService.instance
  }

  private getClient(timeoutMs: number): AxiosInstance {
    const baseURL = normalizeHost(getConfigValue('ollamaHost'))
    return axios.create({
      baseURL,
      timeout: timeoutMs,
      // We want axios to RESOLVE on non-2xx so we can return structured errors
      // instead of throwing for things like "model not found".
      validateStatus: () => true
    })
  }

  /**
   * Returns true if Ollama is reachable. Connection refused / timeout / DNS
   * failure all return false WITHOUT throwing — callers should be able to
   * call this on every analysis attempt without wrapping in try/catch.
   */
  async isRunning(): Promise<boolean> {
    try {
      const client = this.getClient(CHECK_TIMEOUT_MS)
      const res = await client.get('/')
      return res.status >= 200 && res.status < 300
    } catch {
      return false
    }
  }

  /**
   * Lists locally-installed model names. Returns empty array if Ollama is
   * unreachable (so callers don't have to distinguish "no models" from "no
   * Ollama" — the common UI need is just "is anything available").
   */
  async listModels(): Promise<string[]> {
    try {
      const client = this.getClient(MODELS_TIMEOUT_MS)
      const res = await client.get('/api/tags')
      if (res.status < 200 || res.status >= 300) return []
      return parseModelsResponse(res.data)
    } catch {
      return []
    }
  }

  /**
   * Sends an image to Ollama for analysis. Throws OllamaError with a kind
   * indicating the failure mode so callers can show the right UI.
   */
  async analyze(opts: OllamaAnalyzeOptions): Promise<string> {
    const model = opts.model ?? getConfigValue('ollamaModel')
    const body = buildAnalyzeRequest({
      model,
      prompt: opts.prompt,
      imageBase64: opts.imageBase64
    })

    let res
    try {
      const client = this.getClient(ANALYZE_TIMEOUT_MS)
      res = await client.post('/api/generate', body)
    } catch (err) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
        throw new OllamaError(
          `Ollama timed out — analysis took longer than ${Math.round(
            ANALYZE_TIMEOUT_MS / 1000
          )} seconds.`,
          'timeout'
        )
      }
      throw new OllamaError(
        `Ollama unreachable: ${e.message ?? String(err)}`,
        'unreachable'
      )
    }

    if (res.status === 404) {
      // Ollama responds 404 when the requested model is not installed.
      throw new OllamaError(
        `Ollama model "${model}" is not installed. Run \`ollama pull ${model}\` to install it.`,
        'model-missing'
      )
    }
    if (res.status < 200 || res.status >= 300) {
      throw new OllamaError(
        `Ollama returned HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`,
        'http-error'
      )
    }

    const text = parseAnalyzeResponse(res.data)
    if (!text) {
      throw new OllamaError(
        'Ollama returned an empty response. Try a different model or rephrase the prompt.',
        'invalid-response'
      )
    }
    return text
  }

  /**
   * Text-only generate — same /api/generate endpoint, no `images` field.
   * Used by aiService.analyzeText for tasks like extracting action items
   * from a meeting transcript. The user's configured `ollamaModel` is
   * reused; vision models like llava:7b handle text-only prompts fine
   * (just slower than a pure text model would be).
   */
  async generateText(opts: { prompt: string; model?: string }): Promise<string> {
    const model = opts.model ?? getConfigValue('ollamaModel')
    const body = {
      model,
      prompt: opts.prompt,
      stream: false,
      options: {
        temperature: 0.2 // deterministic-ish — extracting facts, not creative writing
      }
    }

    let res
    try {
      const client = this.getClient(ANALYZE_TIMEOUT_MS)
      res = await client.post('/api/generate', body)
    } catch (err) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
        throw new OllamaError(
          `Ollama timed out after ${Math.round(ANALYZE_TIMEOUT_MS / 1000)}s`,
          'timeout'
        )
      }
      throw new OllamaError(
        `Ollama unreachable: ${e.message ?? String(err)}`,
        'unreachable'
      )
    }

    if (res.status === 404) {
      throw new OllamaError(
        `Ollama model "${model}" is not installed. Run \`ollama pull ${model}\` to install it.`,
        'model-missing'
      )
    }
    if (res.status < 200 || res.status >= 300) {
      throw new OllamaError(
        `Ollama returned HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`,
        'http-error'
      )
    }

    const text = parseAnalyzeResponse(res.data)
    if (!text) {
      throw new OllamaError(
        'Ollama returned an empty response.',
        'invalid-response'
      )
    }
    return text
  }
}

export const ollamaService = OllamaService.getInstance()
