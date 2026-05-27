// Tests for the upload-and-transcribe pure helpers (TASK-060). The
// whisper-cli spawning + Web Audio decoding are verified at runtime via
// L4 — but the prompt builder, filename sanitizer, and transcript
// header formatter must produce stable, predictable output.
//
// L2 acceptance criteria:
//  - buildActionItemsPrompt: same input → same output, transcript appended
//    verbatim, prompt structure is paste-ready Markdown
//  - deriveUploadFilenames: strips paths, drops extension, sanitizes
//    Windows-illegal characters, never returns empty
//  - formatTranscriptFile: header includes source + duration + ISO date,
//    body trimmed

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildActionItemsPrompt,
  deriveUploadFilenames,
  formatTranscriptFile
} from '../src/main/services/transcribe-file-helpers.ts'

// ─────────────────── buildActionItemsPrompt ───────────────────

test('buildActionItemsPrompt: appends transcript verbatim after the prompt', () => {
  const out = buildActionItemsPrompt('Alice will send the slides by Friday.')
  // Verbatim presence is the most important invariant.
  assert.match(out, /Alice will send the slides by Friday\./)
})

test('buildActionItemsPrompt: trims surrounding whitespace from transcript', () => {
  const out = buildActionItemsPrompt('   \n\n  Hello.  \n\n  ')
  assert.ok(out.endsWith('Hello.'), 'should end with the trimmed transcript')
})

test('buildActionItemsPrompt: instructs Markdown checkboxes for paste-ready output', () => {
  const out = buildActionItemsPrompt('x')
  assert.match(out, /- \[ \]/) // literal "- [ ]" must appear in the instructions
  assert.match(out, /Markdown/i)
})

test('buildActionItemsPrompt: empty fallback line is present', () => {
  const out = buildActionItemsPrompt('x')
  assert.match(out, /No action items identified\./)
})

test('buildActionItemsPrompt: deterministic across calls with same input', () => {
  const a = buildActionItemsPrompt('Same content.')
  const b = buildActionItemsPrompt('Same content.')
  assert.equal(a, b)
})

// ─────────────────── deriveUploadFilenames ───────────────────

test('deriveUploadFilenames: strips extension and produces matching .txt + -actions.md', () => {
  const out = deriveUploadFilenames('meeting.mp3')
  assert.equal(out.baseName, 'meeting')
  assert.equal(out.txtName, 'meeting.txt')
  assert.equal(out.actionsName, 'meeting-actions.md')
})

test('deriveUploadFilenames: strips directory path (POSIX)', () => {
  const out = deriveUploadFilenames('/home/foo/Downloads/recording.m4a')
  assert.equal(out.baseName, 'recording')
})

test('deriveUploadFilenames: strips directory path (Windows)', () => {
  const out = deriveUploadFilenames('C:\\Users\\foo\\Downloads\\standup.wav')
  assert.equal(out.baseName, 'standup')
})

test('deriveUploadFilenames: sanitizes Windows-illegal chars to underscore', () => {
  // Realistic mix: a name with the illegal chars Windows refuses but no
  // path separators (which would be parsed as directory components).
  const out = deriveUploadFilenames('q1<>:"|?*review.mp3')
  // All the illegal chars become underscores; consecutive underscores collapse.
  assert.equal(out.baseName, 'q1_review')
})

test('deriveUploadFilenames: collapses runs of underscores after substitution', () => {
  const out = deriveUploadFilenames('a:::b.mp3')
  assert.equal(out.baseName, 'a_b')
})

test('deriveUploadFilenames: trims trailing dots and spaces (Windows refuses those)', () => {
  const out = deriveUploadFilenames('  weird name...  .mp3')
  // Note: '.mp3' is stripped as the extension; trailing dots/spaces in the stem are trimmed.
  assert.ok(!out.baseName.endsWith('.'), `base should not end with '.': ${out.baseName}`)
  assert.ok(!out.baseName.endsWith(' '), `base should not end with ' ': ${out.baseName}`)
})

test('deriveUploadFilenames: hidden-style name (.foo) is treated as having no extension', () => {
  // lastIndexOf('.') === 0 means we treat the whole thing as the stem,
  // then sanitize: the leading dot becomes "_" which is then trimmed,
  // leaving "foo".
  const out = deriveUploadFilenames('.foo')
  assert.equal(out.baseName, 'foo')
})

test('deriveUploadFilenames: empty/garbage input falls back to "transcript"', () => {
  // All-illegal characters get scrubbed → empty stem → fallback.
  const out = deriveUploadFilenames('***.mp3')
  assert.equal(out.baseName, 'transcript')
})

test('deriveUploadFilenames: txt and actions names always share the base', () => {
  const out = deriveUploadFilenames('Customer Call - 2026-05-17.m4a')
  assert.equal(out.txtName, `${out.baseName}.txt`)
  assert.equal(out.actionsName, `${out.baseName}-actions.md`)
})

// ─────────────────── formatTranscriptFile ───────────────────

test('formatTranscriptFile: includes source filename, ISO date, and duration in header', () => {
  const out = formatTranscriptFile({
    sourceFilename: 'meeting.mp3',
    durationSeconds: 1842, // 30m 42s
    savedAt: new Date('2026-05-17T10:30:00Z'),
    transcript: 'Hello.'
  })
  assert.match(out, /# Transcript: meeting\.mp3/)
  assert.match(out, /# Generated: 2026-05-17T10:30:00\.000Z/)
  assert.match(out, /# Source duration: 30m 42s/)
})

test('formatTranscriptFile: trims and terminates the transcript body with one newline', () => {
  const out = formatTranscriptFile({
    sourceFilename: 'x.mp3',
    durationSeconds: 60,
    savedAt: new Date(),
    transcript: '   leading and trailing   '
  })
  assert.ok(out.endsWith('leading and trailing\n'))
})

test('formatTranscriptFile: short duration < 60s formats as "0m Ns"', () => {
  const out = formatTranscriptFile({
    sourceFilename: 'snippet.wav',
    durationSeconds: 7,
    savedAt: new Date(),
    transcript: 'x'
  })
  assert.match(out, /# Source duration: 0m 7s/)
})

test('formatTranscriptFile: minute-aligned duration formats as "Nm 0s"', () => {
  const out = formatTranscriptFile({
    sourceFilename: 'snippet.wav',
    durationSeconds: 180,
    savedAt: new Date(),
    transcript: 'x'
  })
  assert.match(out, /# Source duration: 3m 0s/)
})
