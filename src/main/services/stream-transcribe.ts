// Orchestrates the "stream paste" voice mode (TASK-059b spec, Phase 6
// preview): receives audio chunks during an active recording, transcribes
// each one through Whisper, and pastes the result at the cursor as the
// user is still speaking.
//
// Design constraints (set in the user-facing spec):
//   - Append-only. We don't undo a previous chunk's paste even if the
//     next chunk's larger context suggests the previous transcription was
//     wrong. Trying to delete-and-retype across arbitrary apps (Notepad,
//     Word, Chrome) is a UX nightmare.
//   - One whisper-cli at a time. If chunks arrive faster than we can
//     transcribe, they queue. We never spawn parallel whisper processes.
//   - Skip pasting into our own windows (Settings) — same guard the batch
//     paste flow already enforces.
//   - This service is *additive*. The existing batch transcription flow
//     remains untouched. If `voiceStreamPaste` is false, none of this
//     code runs.

import { whisperService } from './whisper'
import { pasteAtCursor } from './paste'
import { ChunkQueue, stitchChunk } from './stream-transcribe-helpers'
import { log } from './logger'

/**
 * Where transcribed chunks go:
 *   - 'paste': type each chunk into the active app via Ctrl+V (dictation)
 *   - 'meeting': append each chunk to an internal text buffer that the
 *     meeting service drains via `endSession()` and writes to .txt
 */
type Sink = 'paste' | 'meeting'

type MeetingChunkListener = (text: string, allChunks: string[]) => void

class StreamTranscribeService {
  private queue = new ChunkQueue<Buffer>()
  private active = false
  private sink: Sink = 'paste'
  private trailing: string | null = null
  /** Meeting-mode buffer of raw transcribed chunks (in arrival order). */
  private meetingChunks: string[] = []
  /**
   * Observers notified each time a meeting chunk lands. Used by the
   * live-transcript-panel to update the floating UI in real time.
   * Paste-sink chunks are NOT broadcast — they go straight to Ctrl+V.
   */
  private meetingChunkListeners: MeetingChunkListener[] = []
  /** Drain promise tracker — resolved when the queue has been emptied. */
  private drainResolvers: Array<() => void> = []

  /**
   * Marks the start of a new stream session. Clears any state from a
   * previous session. `sink` decides where chunks go — paste-at-cursor
   * (dictation) or meeting buffer (transcribe-to-file). Defaults to
   * 'paste' so the existing live-dictation callers keep working.
   */
  beginSession(sink: Sink = 'paste'): void {
    this.active = true
    this.sink = sink
    this.trailing = null
    this.meetingChunks = []
    this.queue.clear()
    this.drainResolvers = []
    log('info', `[stream] session begin (sink=${sink})`)
  }

  /**
   * Push an audio chunk into the queue. Pumps the queue if idle. The
   * returned promise resolves when this specific chunk has been processed
   * (or null-returned silently for very small chunks), so callers can
   * await for backpressure if desired.
   */
  pushChunk(audioWav: Buffer): void {
    if (!this.active) return
    if (audioWav.length < 2048) {
      // Too small to contain useful audio — skip without spending
      // whisper-cli's ~500 ms model-load cost on it.
      log('info', `[stream] chunk skipped (too small: ${audioWav.length} bytes)`)
      return
    }
    log('info', `[stream] chunk enqueued (${audioWav.length} bytes, queue size now ${this.queue.size() + 1})`)
    this.queue.enqueue(audioWav)
    void this.pump()
  }

  /**
   * Marks the end of a session — flushes any remaining chunks and
   * resolves all pending drain promises once the queue is empty.
   * After calling this, `pushChunk` is a no-op until `beginSession()`
   * is called again.
   *
   * Returns the accumulated transcript chunks (in arrival order) — only
   * meaningful for the 'meeting' sink. The 'paste' sink returns an
   * empty array (each chunk was already pasted).
   */
  async endSession(): Promise<string[]> {
    if (!this.active) return []
    this.active = false
    // Drain any chunks that are still queued.
    await new Promise<void>((resolve) => {
      if (this.queue.size() === 0 && !this.queue.isBusy()) {
        resolve()
        return
      }
      this.drainResolvers.push(resolve)
    })
    log('info', `[stream] session end (drained, ${this.meetingChunks.length} meeting chunks)`)
    return [...this.meetingChunks]
  }

  /**
   * Processes the next queued chunk if the worker is idle. Self-loops
   * via `pump()` after finishing one chunk, so the queue drains as fast
   * as whisper-cli + paste will allow.
   */
  private async pump(): Promise<void> {
    const buf = this.queue.takeIfIdle()
    if (!buf) return

    try {
      let text = ''
      try {
        const t0 = Date.now()
        text = await whisperService.transcribe(buf)
        log(
          'info',
          `[stream] chunk transcribed in ${Date.now() - t0}ms: "${text.slice(0, 80).replace(/\n/g, ' ')}"`
        )
      } catch (err) {
        log('warn', `[stream] chunk transcribe failed: ${(err as Error).message}`)
      }

      if (text) {
        if (this.sink === 'meeting') {
          // Meeting sink — accumulate the raw chunk text. No stitching
          // needed because each chunk becomes its own paragraph in the
          // saved .txt (see serializeTranscript).
          this.meetingChunks.push(text)
          log(
            'info',
            `[stream] meeting chunk appended (${this.meetingChunks.length} total): "${text.slice(0, 60).replace(/\n/g, ' ')}"`
          )
          // Fan out to any observers (live transcript panel). Pass a
          // copy of the chunk array so listeners can't mutate our state.
          const snapshot = [...this.meetingChunks]
          for (const l of this.meetingChunkListeners) {
            try {
              l(text, snapshot)
            } catch {
              /* swallow listener errors — they shouldn't break transcription */
            }
          }
        } else {
          // Paste sink — stitch whitespace and paste at cursor.
          const stitched = stitchChunk({
            previousChunkTrailing: this.trailing,
            currentChunk: text
          })
          this.trailing = stitched.newTrailing

          if (stitched.textToPaste) {
            const result = await pasteAtCursor(stitched.textToPaste)
            log(
              'info',
              `[stream] paste ${result.pasted ? 'OK' : 'SKIPPED'} into "${result.targetTitle ?? '?'}"` +
                ` (reason: ${result.reason ?? 'pasted'}) text="${stitched.textToPaste.slice(0, 60).replace(/\n/g, ' ')}"`
            )
            if (!result.pasted && result.reason === 'own-window') {
              // We're focused on Settings — don't paste this chunk. Stop
              // building up text we can't deliver.
              this.trailing = null
            }
          } else {
            log('info', `[stream] chunk text was empty after stitch — nothing to paste`)
          }
        }
      }
    } finally {
      this.queue.release()

      // If the queue is now empty AND the session has been ended,
      // resolve all the drain promises.
      if (!this.active && this.queue.size() === 0) {
        const resolvers = this.drainResolvers
        this.drainResolvers = []
        for (const r of resolvers) r()
      } else if (this.queue.size() > 0) {
        // More work to do — recurse.
        void this.pump()
      }
    }
  }

  /**
   * Subscribe to meeting-chunk events. Returns an unsubscribe function.
   * Listeners receive (newChunkText, allChunksSoFar) — the second arg
   * is a stable snapshot, useful for "copy whole transcript" UI.
   */
  onMeetingChunk(listener: MeetingChunkListener): () => void {
    this.meetingChunkListeners.push(listener)
    return () => {
      this.meetingChunkListeners = this.meetingChunkListeners.filter((l) => l !== listener)
    }
  }

  /**
   * Read-only snapshot of the current meeting chunks. Used by the
   * Copy buttons in the live transcript panel — copying via this is
   * cheaper than re-walking subscribers.
   */
  getMeetingChunks(): string[] {
    return [...this.meetingChunks]
  }

  /**
   * Hard-cancel — discards any unprocessed chunks. Used if the user
   * cancels mid-recording. Does NOT undo already-pasted text (impossible
   * to do safely across apps).
   */
  cancel(): void {
    this.active = false
    this.queue.clear()
    const resolvers = this.drainResolvers
    this.drainResolvers = []
    for (const r of resolvers) r()
    log('info', '[stream] session cancelled')
  }

  isActive(): boolean {
    return this.active
  }
}

export const streamTranscribeService = new StreamTranscribeService()
