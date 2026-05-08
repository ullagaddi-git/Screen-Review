import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { getConfigValue } from './store'

const execFileAsync = promisify(execFile)

export class WhisperBinaryMissingError extends Error {
  constructor(public binPath: string) {
    super(`Whisper binary not found at ${binPath}. Run "npm run download:whisper-bin".`)
    this.name = 'WhisperBinaryMissingError'
  }
}

export class WhisperModelMissingError extends Error {
  constructor(public modelPath: string) {
    super(`Whisper model not found at ${modelPath}. Run "npm run download:whisper".`)
    this.name = 'WhisperModelMissingError'
  }
}

export class WhisperTranscriptionError extends Error {
  constructor(message: string, public stderr?: string) {
    super(message)
    this.name = 'WhisperTranscriptionError'
  }
}

function resolveResourceDir(...segments: string[]): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(base, ...segments)
}

function getBinaryPath(): string {
  return resolveResourceDir('whisper', 'bin', 'whisper-cli.exe')
}

function getModelPath(): string {
  const model = getConfigValue('whisperModel')
  return resolveResourceDir('whisper', `ggml-${model}.bin`)
}

const TIMESTAMP_LINE = /^\s*\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/

function parseTranscript(stdout: string): string {
  const lines = stdout.split(/\r?\n/)
  const cleaned: string[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    if (line.startsWith('whisper_')) continue // diagnostic noise
    if (line.startsWith('system_info:')) continue
    if (line.startsWith('main:')) continue
    cleaned.push(line.replace(TIMESTAMP_LINE, '').trim())
  }
  return cleaned.join(' ').replace(/\s+/g, ' ').trim()
}

export class WhisperService {
  private static instance: WhisperService | null = null

  static getInstance(): WhisperService {
    if (!WhisperService.instance) WhisperService.instance = new WhisperService()
    return WhisperService.instance
  }

  isReady(): { ok: true } | { ok: false; reason: string } {
    const binPath = getBinaryPath()
    if (!existsSync(binPath)) {
      return { ok: false, reason: `whisper-cli.exe missing at ${binPath}` }
    }
    const modelPath = getModelPath()
    if (!existsSync(modelPath)) {
      return { ok: false, reason: `model missing at ${modelPath}` }
    }
    return { ok: true }
  }

  async transcribe(audioWav: Buffer): Promise<string> {
    const binPath = getBinaryPath()
    if (!existsSync(binPath)) throw new WhisperBinaryMissingError(binPath)

    const modelPath = getModelPath()
    if (!existsSync(modelPath)) throw new WhisperModelMissingError(modelPath)

    const language = getConfigValue('voiceLanguage') || 'en'

    const tmpDir = join(tmpdir(), 'screenshpeak-whisper')
    mkdirSync(tmpDir, { recursive: true })
    const audioPath = join(tmpDir, `${randomUUID()}.wav`)

    writeFileSync(audioPath, audioWav)

    try {
      const { stdout } = await execFileAsync(
        binPath,
        [
          '-m', modelPath,
          '-l', language,
          '-nt', // no timestamps
          '-np', // no diagnostic prints — stdout is just the transcription
          '-f', audioPath
        ],
        {
          maxBuffer: 32 * 1024 * 1024,
          windowsHide: true
        }
      )

      // With -np the output is just the transcription text. parseTranscript
      // also handles the case where -np didn't suppress everything (older builds).
      return parseTranscript(stdout)
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
      throw new WhisperTranscriptionError(
        `whisper-cli failed: ${e.message}`,
        e.stderr
      )
    } finally {
      try {
        unlinkSync(audioPath)
      } catch {
        // ignore
      }
    }
  }
}

export const whisperService = WhisperService.getInstance()
