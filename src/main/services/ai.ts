import { ollamaService, OllamaError } from './ollama'
import { openaiService, OpenAIError, OpenAIKeyMissingError } from './openai'
import { getConfigValue } from './store'
import { pickStrategy, type AIStrategy } from './ai-router'
import { DEFAULT_PROMPT } from './ollama-helpers'
import { prepareImageForAI } from './image-prep'

export interface AIAnalyzeOptions {
  /** PNG image as base64 (no data: prefix). */
  imageBase64: string
  /** Optional override prompt. Falls back to each backend's default. */
  prompt?: string
}

export type AIAnalyzeResult =
  | {
      ok: true
      text: string
      provider: AIStrategy
    }
  | {
      ok: false
      /** Which backend the request was attempted against (or 'router' if neither could be tried). */
      provider: AIStrategy | 'router'
      /**
       * A small enum the result-panel UI switches on to render the right
       * message + setup link. Stable across versions — don't rename casually.
       */
      errorKind:
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
      message: string
      /** URL the result panel can link to for setup help (e.g. ollama.com). */
      setupHint?: string
    }

class AIService {
  private static instance: AIService | null = null

  static getInstance(): AIService {
    if (!AIService.instance) AIService.instance = new AIService()
    return AIService.instance
  }

  async analyze(opts: AIAnalyzeOptions): Promise<AIAnalyzeResult> {
    const aiMode = getConfigValue('aiMode')
    const hasOpenAIKey = !!openaiService.getStoredKey()
    const strategy = pickStrategy({ aiMode, hasOpenAIKey })

    // Resize before dispatching to either backend. Native captures are
    // typically 1920×1080+ but vision models don't benefit from that
    // resolution and CPU inference time scales with input size.
    const pngBuffer = Buffer.from(opts.imageBase64, 'base64')
    const prepped = await prepareImageForAI(pngBuffer)
    if (prepped.resized) {
      console.log(
        `[ai] resized for analysis: ${prepped.width}x${prepped.height} (was larger; helps CPU inference)`
      )
    }
    const preppedOpts: AIAnalyzeOptions = {
      ...opts,
      imageBase64: prepped.base64
    }

    if (strategy === 'ollama') return this.runOllama(preppedOpts)
    if (strategy === 'openai') return this.runOpenAI(preppedOpts)

    return {
      ok: false,
      provider: 'router',
      errorKind: 'router-error',
      message: `Unknown AI strategy: ${strategy as string}`
    }
  }

  /**
   * Text-only AI call. Routes through Ollama or OpenAI based on the same
   * strategy logic as `analyze()`, but sends `prompt` only — no image.
   * Used by TASK-060 (upload recording → extract action items) and any
   * future feature that needs to summarize / extract from text.
   *
   * Returns the same AIAnalyzeResult shape so callers can reuse the same
   * error-handling pattern as image analysis.
   */
  async analyzeText(prompt: string): Promise<AIAnalyzeResult> {
    if (!prompt || !prompt.trim()) {
      return {
        ok: false,
        provider: 'router',
        errorKind: 'router-error',
        message: 'analyzeText: empty prompt'
      }
    }

    const aiMode = getConfigValue('aiMode')
    const hasOpenAIKey = !!openaiService.getStoredKey()
    const strategy = pickStrategy({ aiMode, hasOpenAIKey })

    if (strategy === 'ollama') {
      const running = await ollamaService.isRunning()
      if (!running) {
        return {
          ok: false,
          provider: 'ollama',
          errorKind: 'ollama-unavailable',
          message: 'Local AI is not running. Install Ollama (free) to enable.',
          setupHint: 'https://ollama.com'
        }
      }
      try {
        const text = await ollamaService.generateText({ prompt })
        return { ok: true, text, provider: 'ollama' }
      } catch (err) {
        return this.mapOllamaError(err)
      }
    }

    if (strategy === 'openai') {
      try {
        const text = await openaiService.generateText({ prompt })
        return { ok: true, text, provider: 'openai' }
      } catch (err) {
        return this.mapOpenAIError(err)
      }
    }

    return {
      ok: false,
      provider: 'router',
      errorKind: 'router-error',
      message: `Unknown AI strategy: ${strategy as string}`
    }
  }

  /** Shared Ollama error → AIAnalyzeResult mapper (used by both analyze and analyzeText). */
  private mapOllamaError(err: unknown): AIAnalyzeResult {
    if (err instanceof OllamaError) {
      const map: Record<OllamaError['kind'], AIAnalyzeResult & { ok: false }> = {
        unreachable: {
          ok: false,
          provider: 'ollama',
          errorKind: 'ollama-unavailable',
          message: err.message,
          setupHint: 'https://ollama.com'
        },
        'model-missing': {
          ok: false,
          provider: 'ollama',
          errorKind: 'ollama-model-missing',
          message: err.message
        },
        timeout: {
          ok: false,
          provider: 'ollama',
          errorKind: 'ollama-timeout',
          message: err.message
        },
        'http-error': {
          ok: false,
          provider: 'ollama',
          errorKind: 'ollama-error',
          message: err.message
        },
        'invalid-response': {
          ok: false,
          provider: 'ollama',
          errorKind: 'ollama-error',
          message: err.message
        }
      }
      return map[err.kind]
    }
    return {
      ok: false,
      provider: 'ollama',
      errorKind: 'ollama-error',
      message: (err as Error).message
    }
  }

  /** Shared OpenAI error → AIAnalyzeResult mapper. */
  private mapOpenAIError(err: unknown): AIAnalyzeResult {
    if (err instanceof OpenAIKeyMissingError) {
      return {
        ok: false,
        provider: 'openai',
        errorKind: 'openai-key-missing',
        message: err.message
      }
    }
    if (err instanceof OpenAIError) {
      const map: Record<OpenAIError['kind'], AIAnalyzeResult & { ok: false }> = {
        auth: {
          ok: false,
          provider: 'openai',
          errorKind: 'openai-auth',
          message: 'OpenAI key is invalid. Check it in Settings → AI.'
        },
        'rate-limit': {
          ok: false,
          provider: 'openai',
          errorKind: 'openai-rate-limit',
          message: 'OpenAI rate limit hit. Wait a moment and try again.'
        },
        quota: {
          ok: false,
          provider: 'openai',
          errorKind: 'openai-quota',
          message: 'OpenAI quota exceeded. Check your billing at platform.openai.com.'
        },
        timeout: {
          ok: false,
          provider: 'openai',
          errorKind: 'openai-timeout',
          message: 'OpenAI request timed out. Try again or switch to Local AI.'
        },
        network: {
          ok: false,
          provider: 'openai',
          errorKind: 'openai-network',
          message: 'Could not reach api.openai.com. Check your network.'
        },
        unknown: {
          ok: false,
          provider: 'openai',
          errorKind: 'openai-error',
          message: err.message
        }
      }
      return map[err.kind]
    }
    return {
      ok: false,
      provider: 'openai',
      errorKind: 'openai-error',
      message: (err as Error).message
    }
  }

  private async runOllama(opts: AIAnalyzeOptions): Promise<AIAnalyzeResult> {
    const running = await ollamaService.isRunning()
    if (!running) {
      return {
        ok: false,
        provider: 'ollama',
        errorKind: 'ollama-unavailable',
        message: 'Local AI is not running. Install Ollama (free) to enable analysis.',
        setupHint: 'https://ollama.com'
      }
    }
    try {
      const text = await ollamaService.analyze({
        imageBase64: opts.imageBase64,
        prompt: opts.prompt
      })
      return { ok: true, text, provider: 'ollama' }
    } catch (err) {
      if (err instanceof OllamaError) {
        const map: Record<OllamaError['kind'], AIAnalyzeResult & { ok: false }> = {
          unreachable: {
            ok: false,
            provider: 'ollama',
            errorKind: 'ollama-unavailable',
            message: err.message,
            setupHint: 'https://ollama.com'
          },
          'model-missing': {
            ok: false,
            provider: 'ollama',
            errorKind: 'ollama-model-missing',
            message: err.message
          },
          timeout: {
            ok: false,
            provider: 'ollama',
            errorKind: 'ollama-timeout',
            message: err.message
          },
          'http-error': {
            ok: false,
            provider: 'ollama',
            errorKind: 'ollama-error',
            message: err.message
          },
          'invalid-response': {
            ok: false,
            provider: 'ollama',
            errorKind: 'ollama-error',
            message: err.message
          }
        }
        return map[err.kind]
      }
      return {
        ok: false,
        provider: 'ollama',
        errorKind: 'ollama-error',
        message: (err as Error).message
      }
    }
  }

  private async runOpenAI(opts: AIAnalyzeOptions): Promise<AIAnalyzeResult> {
    // OpenAI analyze() requires a non-empty prompt — Ollama applies its own
    // default internally, but for consistency both backends use the same
    // default prompt here.
    const prompt = opts.prompt && opts.prompt.trim() ? opts.prompt : DEFAULT_PROMPT
    try {
      const text = await openaiService.analyze({
        imageBase64: opts.imageBase64,
        prompt
      })
      return { ok: true, text, provider: 'openai' }
    } catch (err) {
      if (err instanceof OpenAIKeyMissingError) {
        return {
          ok: false,
          provider: 'openai',
          errorKind: 'openai-key-missing',
          message: err.message
        }
      }
      if (err instanceof OpenAIError) {
        const map: Record<OpenAIError['kind'], AIAnalyzeResult & { ok: false }> = {
          auth: {
            ok: false,
            provider: 'openai',
            errorKind: 'openai-auth',
            message: 'OpenAI key is invalid. Check it in Settings → AI.'
          },
          'rate-limit': {
            ok: false,
            provider: 'openai',
            errorKind: 'openai-rate-limit',
            message: 'OpenAI rate limit hit. Wait a moment and try again.'
          },
          quota: {
            ok: false,
            provider: 'openai',
            errorKind: 'openai-quota',
            message: 'OpenAI quota exceeded. Check your billing at platform.openai.com.'
          },
          timeout: {
            ok: false,
            provider: 'openai',
            errorKind: 'openai-timeout',
            message: 'OpenAI request timed out. Try again or switch to Local AI.'
          },
          network: {
            ok: false,
            provider: 'openai',
            errorKind: 'openai-network',
            message: 'Could not reach api.openai.com. Check your network.'
          },
          unknown: {
            ok: false,
            provider: 'openai',
            errorKind: 'openai-error',
            message: err.message
          }
        }
        return map[err.kind]
      }
      return {
        ok: false,
        provider: 'openai',
        errorKind: 'openai-error',
        message: (err as Error).message
      }
    }
  }
}

export const aiService = AIService.getInstance()
