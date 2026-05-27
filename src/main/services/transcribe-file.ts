// Upload-and-transcribe orchestrator (TASK-060).
//
// The renderer is responsible for decoding any user-uploaded audio file
// (MP3 / M4A / WAV / OGG / WebM / FLAC / MP4-audio-track) via
// AudioContext.decodeAudioData and re-encoding as 16 kHz mono WAV — the
// only format whisper-cli accepts directly. That keeps this service
// dependency-light (no ffmpeg) and reuses the Web Audio APIs we already
// have access to.
//
// This service receives the prepared WAV buffer, writes it to a temp
// file, runs whisper-cli, and returns the transcript text. It also
// writes the saved outputs (transcript.txt + actions.md) into the user's
// `Documents\ScreenSpeak\transcripts\` folder.

import { app, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { whisperService } from './whisper'
import { aiService } from './ai'
import {
  buildActionItemsPrompt,
  deriveUploadFilenames,
  formatTranscriptFile
} from './transcribe-file-helpers'
import { log, logError } from './logger'

export interface TranscribeFileResult {
  ok: true
  transcript: string
  durationSeconds: number
  sourceFilename: string
}
export interface TranscribeFileError {
  ok: false
  error: string
}
export type TranscribeFileResponse = TranscribeFileResult | TranscribeFileError

export interface ExtractActionsResponse {
  ok: boolean
  text?: string
  error?: string
  provider?: string
}

class TranscribeFileService {
  /**
   * Transcribe a prepared (16 kHz mono) WAV buffer that the renderer
   * decoded from the user's uploaded file. Returns the transcript text
   * or a structured error. We don't surface whisper-cli's stdout/stderr
   * verbatim — just the parsed transcript.
   */
  async transcribe(
    sourceFilename: string,
    durationSeconds: number,
    wav: Buffer
  ): Promise<TranscribeFileResponse> {
    if (!wav || wav.length === 0) {
      return { ok: false, error: 'Empty audio buffer' }
    }
    log(
      'info',
      `[transcribe-file] start: source="${sourceFilename}", duration=${durationSeconds}s, wav=${wav.length} bytes`
    )

    // Pre-check whisper is installed — avoid a confusing child-process
    // error if the user's install is missing the binary or model.
    const ready = whisperService.isReady()
    if (!ready.ok) {
      return { ok: false, error: ready.reason }
    }

    try {
      const t0 = Date.now()
      const transcript = await whisperService.transcribe(wav)
      log(
        'info',
        `[transcribe-file] done in ${Date.now() - t0}ms — ${transcript.length} chars`
      )
      return {
        ok: true,
        transcript,
        durationSeconds,
        sourceFilename
      }
    } catch (err) {
      logError('[transcribe-file] whisper failed', err)
      return { ok: false, error: (err as Error).message }
    }
  }

  /**
   * Sends the transcript to whichever AI backend is configured and asks
   * for a bulleted list of action items. The prompt is built by the
   * pure helper so it's testable independently.
   *
   * For very long transcripts we may exceed the model's context window
   * (Ollama llava:7b is ~4k tokens; ~12-15k characters of English text).
   * In that case we truncate the transcript to a safe length and tell
   * the caller via the `truncated` flag. Better partial action items
   * than zero, and the user can re-extract on a shorter slice if needed.
   */
  async extractActions(transcript: string): Promise<ExtractActionsResponse> {
    if (!transcript || !transcript.trim()) {
      log('warn', '[transcribe-file] extractActions: empty transcript — skipping')
      return { ok: false, error: 'Empty transcript — nothing to extract from.' }
    }

    log(
      'info',
      `[transcribe-file] extractActions start — ${transcript.length} chars`
    )

    // Hard cap: ~12 000 chars is roughly 3 000 tokens, which leaves headroom
    // for the prompt header + the model's response within a 4 k context.
    // Most action-item-bearing transcripts that long are meetings where the
    // actions are typically wrapped up in the final third — but truncating
    // from the START would lose the wrap-up, so we keep the TAIL instead.
    const MAX_CHARS_FOR_4K_CONTEXT = 12_000
    let promptTranscript = transcript
    let truncatedNote = ''
    if (transcript.length > MAX_CHARS_FOR_4K_CONTEXT) {
      const tail = transcript.slice(-MAX_CHARS_FOR_4K_CONTEXT)
      promptTranscript = `[Note: this transcript was truncated to the final ${MAX_CHARS_FOR_4K_CONTEXT} characters to fit the model's context window. Earlier discussion is not visible.]\n\n${tail}`
      truncatedNote = ` (truncated to final ${MAX_CHARS_FOR_4K_CONTEXT} chars)`
      log(
        'warn',
        `[transcribe-file] transcript ${transcript.length} chars exceeds 12k cap — truncating to tail`
      )
    }

    const prompt = buildActionItemsPrompt(promptTranscript)

    const t0 = Date.now()
    const result = await aiService.analyzeText(prompt)
    const elapsed = Date.now() - t0
    log(
      'info',
      `[transcribe-file] extractActions ${result.ok ? 'OK' : 'FAILED'} in ${elapsed}ms${truncatedNote}` +
        (result.ok ? ` — ${result.text.length} chars returned` : ` — ${result.message}`)
    )

    if (!result.ok) {
      return { ok: false, error: result.message, provider: result.provider }
    }
    return { ok: true, text: result.text, provider: result.provider }
  }

  /** Save the transcript .txt to Documents\ScreenSpeak\transcripts\. */
  saveTranscript(
    sourceFilename: string,
    durationSeconds: number,
    transcript: string
  ): { ok: boolean; filePath?: string; error?: string } {
    try {
      const folder = this.getOutputFolder()
      const { txtName } = deriveUploadFilenames(sourceFilename)
      const filePath = join(folder, txtName)
      const body = formatTranscriptFile({
        sourceFilename,
        durationSeconds,
        savedAt: new Date(),
        transcript
      })
      writeFileSync(filePath, body, 'utf-8')
      log('info', `[transcribe-file] saved transcript to ${filePath}`)
      return { ok: true, filePath }
    } catch (err) {
      logError('[transcribe-file] save transcript failed', err)
      return { ok: false, error: (err as Error).message }
    }
  }

  /** Save the action items .md to Documents\ScreenSpeak\transcripts\. */
  saveActions(
    sourceFilename: string,
    actionsMarkdown: string
  ): { ok: boolean; filePath?: string; error?: string } {
    try {
      const folder = this.getOutputFolder()
      const { actionsName } = deriveUploadFilenames(sourceFilename)
      const filePath = join(folder, actionsName)
      writeFileSync(filePath, actionsMarkdown, 'utf-8')
      log('info', `[transcribe-file] saved actions to ${filePath}`)
      return { ok: true, filePath }
    } catch (err) {
      logError('[transcribe-file] save actions failed', err)
      return { ok: false, error: (err as Error).message }
    }
  }

  /** %USERPROFILE%\Documents\ScreenSpeak\transcripts (created on demand). */
  getOutputFolder(): string {
    const folder = join(app.getPath('documents'), 'ScreenSpeak', 'transcripts')
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
    return folder
  }

  /**
   * Diagnostic helper — writes the prepared WAV to a temp file (used
   * during dev for troubleshooting low-quality transcriptions). Not
   * called from the production path. Returns the path so the dev can
   * play it back in Windows Media Player to verify the decode was OK.
   */
  writeDebugWav(wav: Buffer): string {
    const dir = join(tmpdir(), 'screenshpeak-debug')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const path = join(dir, `upload-${randomUUID()}.wav`)
    writeFileSync(path, wav)
    return path
  }

}

export const transcribeFileService = new TranscribeFileService()

let listenersBound = false

/**
 * Wire up the IPC handlers used by the Voice tab's "Transcribe a
 * recording" UI. Idempotent — registers once at app start.
 */
export function registerTranscribeFileIPC(): void {
  if (listenersBound) return
  listenersBound = true

  /**
   * Renderer sends a fully-decoded WAV buffer (16 kHz mono PCM with WAV
   * header) plus the original filename + duration. We validate the
   * shape, then hand off to whisper-cli.
   */
  ipcMain.handle(
    'transcribe-file:run',
    async (
      _event,
      payload: { sourceFilename?: unknown; durationSeconds?: unknown; wav?: unknown }
    ) => {
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'invalid payload' }
      }
      const sourceFilename =
        typeof payload.sourceFilename === 'string' && payload.sourceFilename.length > 0
          ? payload.sourceFilename
          : 'recording'
      const durationSeconds =
        typeof payload.durationSeconds === 'number' && payload.durationSeconds > 0
          ? payload.durationSeconds
          : 0
      const wavValue = payload.wav
      let wavBuffer: Buffer
      if (wavValue instanceof ArrayBuffer) {
        wavBuffer = Buffer.from(wavValue)
      } else if (wavValue instanceof Uint8Array) {
        wavBuffer = Buffer.from(wavValue.buffer, wavValue.byteOffset, wavValue.byteLength)
      } else {
        return { ok: false, error: 'wav must be ArrayBuffer or Uint8Array' }
      }
      return transcribeFileService.transcribe(sourceFilename, durationSeconds, wavBuffer)
    }
  )

  ipcMain.handle('transcribe-file:extract-actions', async (_event, transcript: unknown) => {
    if (typeof transcript !== 'string') {
      return { ok: false, error: 'transcript must be a string' }
    }
    return transcribeFileService.extractActions(transcript)
  })

  ipcMain.handle(
    'transcribe-file:save-transcript',
    (
      _event,
      payload: {
        sourceFilename?: unknown
        durationSeconds?: unknown
        transcript?: unknown
      }
    ) => {
      const sourceFilename =
        typeof payload?.sourceFilename === 'string' ? payload.sourceFilename : 'recording'
      const durationSeconds =
        typeof payload?.durationSeconds === 'number' ? payload.durationSeconds : 0
      const transcript = typeof payload?.transcript === 'string' ? payload.transcript : ''
      if (!transcript) return { ok: false, error: 'empty transcript' }
      return transcribeFileService.saveTranscript(sourceFilename, durationSeconds, transcript)
    }
  )

  ipcMain.handle(
    'transcribe-file:save-actions',
    (_event, payload: { sourceFilename?: unknown; actions?: unknown }) => {
      const sourceFilename =
        typeof payload?.sourceFilename === 'string' ? payload.sourceFilename : 'recording'
      const actions = typeof payload?.actions === 'string' ? payload.actions : ''
      if (!actions) return { ok: false, error: 'empty actions' }
      return transcribeFileService.saveActions(sourceFilename, actions)
    }
  )

  ipcMain.handle('transcribe-file:open-folder', () => {
    const folder = transcribeFileService.getOutputFolder()
    void shell.openPath(folder)
    return { ok: true, folder }
  })

  ipcMain.handle('transcribe-file:show-file', (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') return { ok: false }
    shell.showItemInFolder(filePath)
    return { ok: true }
  })
}
