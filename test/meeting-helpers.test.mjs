// Tests for the pure meeting helpers. The file-IO parts (writing the
// .txt, opening Explorer) are verified at runtime via L4 — but the
// filename formatter and transcript serializer must produce stable,
// predictable output, so they get unit coverage.
//
// L2 acceptance criteria for TASK-059b:
//  - formatMeetingFilename produces "meeting-YYYYMMDD-HHMM" with zero-padded
//    components, matching wav + txt extensions
//  - serializeTranscript joins non-empty chunks with blank lines,
//    drops empty/whitespace-only chunks (silence in the recording)
//  - serializeTranscript handles trim() on each chunk (Whisper sometimes
//    emits leading/trailing whitespace)
//  - Both helpers are deterministic — same input → same output

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatMeetingFilename,
  serializeTranscript
} from '../src/main/services/meeting-helpers.ts'

// ─────────────────── formatMeetingFilename ───────────────────

test('formatMeetingFilename: standard noon date', () => {
  const out = formatMeetingFilename(new Date(2026, 4, 17, 12, 34)) // May 17 2026 12:34
  assert.equal(out.baseName, 'meeting-20260517-1234')
  assert.equal(out.wavName, 'meeting-20260517-1234.wav')
  assert.equal(out.txtName, 'meeting-20260517-1234.txt')
})

test('formatMeetingFilename: zero-pads single-digit month / day / hour / minute', () => {
  const out = formatMeetingFilename(new Date(2026, 0, 5, 9, 7)) // Jan 5 2026 09:07
  assert.equal(out.baseName, 'meeting-20260105-0907')
})

test('formatMeetingFilename: midnight gets 0000', () => {
  const out = formatMeetingFilename(new Date(2026, 11, 31, 0, 0)) // Dec 31 2026 00:00
  assert.equal(out.baseName, 'meeting-20261231-0000')
})

test('formatMeetingFilename: 23:59 gets 2359', () => {
  const out = formatMeetingFilename(new Date(2026, 11, 31, 23, 59))
  assert.equal(out.baseName, 'meeting-20261231-2359')
})

test('formatMeetingFilename: wav and txt names always share the base', () => {
  const out = formatMeetingFilename(new Date(2026, 6, 15, 14, 30))
  assert.equal(out.wavName, `${out.baseName}.wav`)
  assert.equal(out.txtName, `${out.baseName}.txt`)
})

test('formatMeetingFilename: deterministic — same input, same output', () => {
  const d = new Date(2026, 4, 17, 12, 34)
  const a = formatMeetingFilename(d)
  const b = formatMeetingFilename(d)
  assert.deepEqual(a, b)
})

// ─────────────────── serializeTranscript ───────────────────

test('serializeTranscript: joins non-empty chunks with blank lines', () => {
  const out = serializeTranscript(['Hello there.', 'How are you doing?', 'Great to see you.'])
  assert.equal(
    out,
    'Hello there.\n\nHow are you doing?\n\nGreat to see you.'
  )
})

test('serializeTranscript: single chunk has no trailing blank line', () => {
  const out = serializeTranscript(['Only one thought.'])
  assert.equal(out, 'Only one thought.')
})

test('serializeTranscript: drops empty chunks (silence)', () => {
  const out = serializeTranscript(['Hello.', '', 'Goodbye.'])
  assert.equal(out, 'Hello.\n\nGoodbye.')
})

test('serializeTranscript: drops whitespace-only chunks', () => {
  const out = serializeTranscript(['Hello.', '   \n\t  ', 'Goodbye.'])
  assert.equal(out, 'Hello.\n\nGoodbye.')
})

test('serializeTranscript: trims leading/trailing whitespace from each chunk', () => {
  // Whisper often emits "  hello there  \n" with extra padding.
  const out = serializeTranscript(['  hello there.  ', '\nhow are you?\n'])
  assert.equal(out, 'hello there.\n\nhow are you?')
})

test('serializeTranscript: empty array → empty string', () => {
  assert.equal(serializeTranscript([]), '')
})

test('serializeTranscript: all-silence array → empty string', () => {
  assert.equal(serializeTranscript(['', '   ', '\n\n']), '')
})
