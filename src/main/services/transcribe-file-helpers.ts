// Pure helpers for the upload-and-transcribe feature (TASK-060).
// Lives in its own file (no electron / fs / child_process imports) so
// the test runner can verify the prompt + filename math without
// touching Whisper or the disk.

const ACTION_ITEMS_PROMPT_HEADER = `You are a meeting assistant. From the following transcript, extract a clean bulleted list of action items.

For each item, include (when mentioned):
- Who is responsible
- What they need to do
- Any deadline or due date

Format the output as Markdown checkboxes ("- [ ]") so the list is paste-ready into Notion, GitHub Issues, or any Markdown-aware tool.

If the transcript contains no actionable items, return exactly:
"No action items identified."

Transcript follows:
---
`

/**
 * Builds the prompt sent to whichever AI backend the user has configured
 * (Ollama or OpenAI). Pure — given the same transcript, returns the same
 * prompt. The transcript is appended verbatim so the model sees the exact
 * text Whisper produced; no preprocessing is done here.
 */
export function buildActionItemsPrompt(transcript: string): string {
  return ACTION_ITEMS_PROMPT_HEADER + transcript.trim()
}

export interface UploadFilenameParts {
  /** Base name without extension, sanitized for filesystem use. */
  baseName: string
  /** baseName + ".txt" for the plain transcript. */
  txtName: string
  /** baseName + "-actions.md" for the action-items Markdown. */
  actionsName: string
}

/**
 * Derives output filenames from the user-uploaded source. Strategy:
 *  1. Strip directory components (Windows or POSIX path separators).
 *  2. Drop the file extension — we always emit .txt and .md regardless.
 *  3. Replace every character that isn't alphanumeric with an underscore.
 *     This is intentionally aggressive: it handles every Windows-illegal
 *     character (`< > : " / \ | ? *`), control characters, spaces, dots
 *     within the name (so `rec.v2.final` doesn't produce `rec.v2.final.txt`
 *     which looks weird), and anything else exotic users might paste in.
 *  4. Collapse consecutive underscores and trim trailing ones so we don't
 *     end up with `foo___` or `_foo_bar_`.
 *  5. If after sanitization the name contains no alphanumerics at all
 *     (e.g. input was `"***.mp3"`), fall back to `"transcript"`.
 */
export function deriveUploadFilenames(sourceFilename: string): UploadFilenameParts {
  const justName = sourceFilename.split(/[\\/]/).pop() ?? sourceFilename

  const dotIdx = justName.lastIndexOf('.')
  const stem = dotIdx > 0 ? justName.slice(0, dotIdx) : justName

  // Replace anything not [A-Za-z0-9] with an underscore, then collapse
  // runs and trim leading/trailing underscores.
  const safe = stem
    .replace(/[^A-Za-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  // Fall back if nothing meaningful survived.
  const hasMeaningfulChar = /[A-Za-z0-9]/.test(safe)
  const baseName = hasMeaningfulChar ? safe : 'transcript'

  return {
    baseName,
    txtName: `${baseName}.txt`,
    actionsName: `${baseName}-actions.md`
  }
}

/**
 * Builds the .txt body for a saved transcript. Includes a small header
 * with the source filename + datestamp + duration so the file is
 * self-describing when the user finds it weeks later.
 */
export function formatTranscriptFile(opts: {
  sourceFilename: string
  durationSeconds: number
  savedAt: Date
  transcript: string
}): string {
  const minutes = Math.floor(opts.durationSeconds / 60)
  const seconds = Math.round(opts.durationSeconds % 60)
  const duration = `${minutes}m ${seconds}s`
  const header =
    `# Transcript: ${opts.sourceFilename}\n` +
    `# Generated: ${opts.savedAt.toISOString()}\n` +
    `# Source duration: ${duration}\n` +
    `\n`
  return header + opts.transcript.trim() + '\n'
}
