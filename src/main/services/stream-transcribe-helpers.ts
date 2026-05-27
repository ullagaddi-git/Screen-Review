// Pure helpers for stream-transcribe.ts. Lives in its own file (no
// electron / fs / child_process imports) so the test runner can verify
// the stitching logic without a Whisper binary or a real keyboard.
//
// The interesting question this code answers: as we paste a stream of
// chunked transcriptions ("hello there", "how are you doing", "today")
// into the user's editor, where do we put whitespace?
//
//   - First chunk of the session: no leading space
//   - Subsequent chunks: prepend a space IF the previous chunk didn't
//     already end with whitespace AND the next chunk doesn't start
//     with whitespace or sentence-terminating punctuation
//   - Empty chunks (silence): skip entirely, don't paste anything
//
// This is the only "smart" part of stream paste — the rest is plumbing.

export interface StitchInput {
  /** Previous chunk's text (after stitching), or null if this is the first chunk. */
  previousChunkTrailing: string | null
  /** Raw transcription text from the current chunk, exactly as whisper-cli returned it. */
  currentChunk: string
}

export interface StitchOutput {
  /** The text to actually paste. May be empty if the chunk was silence. */
  textToPaste: string
  /**
   * Updated value to pass as `previousChunkTrailing` for the NEXT chunk.
   * Tracks only the last character or two of what was pasted so the
   * caller doesn't have to remember the full history.
   */
  newTrailing: string
}

/**
 * Decides what text (if any) to paste for the next chunk, including the
 * leading separator if needed. Pure and deterministic.
 */
export function stitchChunk(input: StitchInput): StitchOutput {
  const trimmed = input.currentChunk.trim()
  if (trimmed === '') {
    // Silence or noise — Whisper returned nothing meaningful. Don't paste,
    // but also don't update the trailing state — the next real chunk
    // should behave as if this never happened.
    return { textToPaste: '', newTrailing: input.previousChunkTrailing ?? '' }
  }

  // First chunk of the session — no separator.
  if (input.previousChunkTrailing === null || input.previousChunkTrailing === '') {
    return { textToPaste: trimmed, newTrailing: lastCharOf(trimmed) }
  }

  const prevEnd = input.previousChunkTrailing
  const nextStart = trimmed[0] ?? ''

  // Don't double up whitespace if either side already provides it.
  const prevEndsInSpace = /\s/.test(prevEnd)
  const nextStartsInSpace = /\s/.test(nextStart)
  // Don't insert space before sentence punctuation that should hug the
  // previous word (",.!?;:)").
  const nextIsHuggingPunctuation = /[,.!?;:)\]}]/.test(nextStart)

  let separator = ' '
  if (prevEndsInSpace || nextStartsInSpace || nextIsHuggingPunctuation) {
    separator = ''
  }

  const text = separator + trimmed
  return { textToPaste: text, newTrailing: lastCharOf(trimmed) }
}

function lastCharOf(s: string): string {
  return s.length > 0 ? s[s.length - 1] : ''
}

/**
 * Simple FIFO queue for in-flight transcription chunks. Pure (no I/O) —
 * the orchestrator owns the actual whisper-cli spawning.
 *
 * The reason this exists as a separate testable type: if chunks arrive
 * faster than whisper-cli can finish (slow CPU, big chunk), we need to
 * queue them up rather than spawn parallel processes that would peg the
 * CPU and produce out-of-order pastes.
 */
export class ChunkQueue<T> {
  private items: T[] = []
  /** True while the orchestrator is processing an item. Manual gate, not derived from length. */
  private busy = false

  /** Number of items waiting (not including any currently being processed). */
  size(): number {
    return this.items.length
  }

  isBusy(): boolean {
    return this.busy
  }

  enqueue(item: T): void {
    this.items.push(item)
  }

  /**
   * Take the next item if the queue is idle. Returns null if the queue
   * is busy or empty. Sets the busy flag when an item is returned —
   * caller MUST call `release()` when done with it.
   */
  takeIfIdle(): T | null {
    if (this.busy) return null
    const item = this.items.shift()
    if (item === undefined) return null
    this.busy = true
    return item
  }

  /** Mark the queue as no longer processing. Pair with takeIfIdle. */
  release(): void {
    this.busy = false
  }

  /** Discard everything waiting (used when the user stops dictating). */
  clear(): void {
    this.items = []
    this.busy = false
  }
}
