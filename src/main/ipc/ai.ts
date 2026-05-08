import { ipcMain } from 'electron'
import { ollamaService } from '../services/ollama'
import { openaiService } from '../services/openai'
import { aiService } from '../services/ai'
import type {
  OllamaCheckResult,
  OpenAITestKeyResult,
  AIAnalyzeIPCRequest,
  AIAnalyzeIPCResult
} from './ai-types'

export type {
  OllamaCheckResult,
  OpenAITestKeyResult,
  AIAnalyzeIPCRequest,
  AIAnalyzeIPCResult,
  AIErrorKind
} from './ai-types'

export function registerAIIPC(): void {
  ipcMain.handle('ollama:check', async (): Promise<OllamaCheckResult> => {
    const running = await ollamaService.isRunning()
    if (!running) {
      return { running: false, models: [] }
    }
    const models = await ollamaService.listModels()
    return { running: true, models }
  })

  ipcMain.handle(
    'openai:test-key',
    async (_event, apiKey: string): Promise<OpenAITestKeyResult> => {
      // We accept the plaintext key from the renderer here only for
      // validation. We never log it and don't store it from this handler.
      // Storing happens via settings:set, which encrypts on the way in.
      return openaiService.testKey(apiKey)
    }
  )

  ipcMain.handle(
    'ai:analyze',
    async (_event, req: AIAnalyzeIPCRequest): Promise<AIAnalyzeIPCResult> => {
      if (!req || typeof req !== 'object' || typeof req.imageBase64 !== 'string') {
        return {
          ok: false,
          provider: 'router',
          errorKind: 'router-error',
          message: 'ai:analyze requires { imageBase64: string }'
        }
      }
      return aiService.analyze({
        imageBase64: req.imageBase64,
        prompt: typeof req.prompt === 'string' ? req.prompt : undefined
      })
    }
  )
}
