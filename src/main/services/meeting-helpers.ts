// Pure helpers for the meeting service. Lives in its own file (no
// electron / fs imports) so the test runner can verify the filename
// formatting + transcript serialization without spinning up Electron.
//
// Why these are pure:
//  - `formatMeetingFilename`: a single source of truth for the timestamp
//    format so the .wav and .txt files always match. If we ever change
//    the format, we change it here and every meeting after that is
//    consistent. (Existing meetings keep their original names.)
//  - `serializeTranscript`: tiny but worth its own helper because the
//    "blank-line-between-chunks" decision is what makes meeting transcripts
//    readable instead of one wall of text.

export interface MeetingFilenameParts {
  /** Path-friendly base name without extension (e.g. "meeting-20260517-1042"). */
  baseName: string
  /** Same base + ".wav" for the audio file. */
  wavName: string
  /** Same base + ".txt" for the transcript file. */
  txtName: string
}

/**
 * Generates the base filename for a meeting saved at `date`. The format
 * is `meeting-YYYYMMDD-HHMM` (no seconds — minute granularity is enough
 * and makes filenames easier to skim in Explorer).
 */
export function formatMeetingFilename(date: Date): MeetingFilenameParts {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  const yyyymmdd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const hhmm = `${pad(date.getHours())}${pad(date.getMinutes())}`
  const baseName = `meeting-${yyyymmdd}-${hhmm}`
  return {
    baseName,
    wavName: `${baseName}.wav`,
    txtName: `${baseName}.txt`
  }
}

/**
 * Joins meeting transcript chunks into a single text blob suitable for
 * writing to .txt. Each chunk becomes its own paragraph (separated by
 * a blank line) so the transcript stays readable instead of running
 * together as one wall of text.
 *
 * Empty/whitespace-only chunks are filtered out (silence).
 */
export function serializeTranscript(chunks: string[]): string {
  return chunks
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .join('\n\n')
}
