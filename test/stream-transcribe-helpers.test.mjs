// Tests for the pure stream-transcribe helpers (whitespace stitching +
// chunk queue). The Electron-specific orchestration (whisper-cli spawn,
// keyboard paste) is verified at runtime via L4 — but the logic that
// decides "should I prepend a space?" and "is the worker busy?" can and
// should be unit-tested.
//
// L2 acceptance criteria for the stream-paste feature:
//  - stitchChunk: first chunk = raw trimmed text, no leading space
//  - stitchChunk: subsequent chunks get a leading space unless the
//    previous chunk ended with whitespace OR the new chunk starts
//    with hugging punctuation (",.!?;:)") OR starts with whitespace itself
//  - stitchChunk: empty/whitespace-only chunks paste nothing, don't
//    advance the trailing state (so the next real chunk still sees
//    the pre-silence trailing context)
//  - ChunkQueue: enqueue grows size; takeIfIdle returns one item & sets
//    busy; takeIfIdle returns null while busy; release clears busy;
//    clear empties everything

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ChunkQueue,
  stitchChunk
} from '../src/main/services/stream-transcribe-helpers.ts'

// ─────────────────── stitchChunk: first chunk ───────────────────

test('stitchChunk: first chunk of session — no leading space', () => {
  const out = stitchChunk({
    previousChunkTrailing: null,
    currentChunk: 'hello world'
  })
  assert.equal(out.textToPaste, 'hello world')
  assert.equal(out.newTrailing, 'd')
})

test('stitchChunk: first chunk treats empty-string trailing same as null', () => {
  const out = stitchChunk({
    previousChunkTrailing: '',
    currentChunk: 'first phrase'
  })
  assert.equal(out.textToPaste, 'first phrase')
})

test('stitchChunk: first chunk trims surrounding whitespace from whisper output', () => {
  // whisper-cli sometimes emits leading/trailing whitespace.
  const out = stitchChunk({
    previousChunkTrailing: null,
    currentChunk: '   hello   '
  })
  assert.equal(out.textToPaste, 'hello')
  assert.equal(out.newTrailing, 'o')
})

// ─────────────────── stitchChunk: subsequent chunks ───────────────────

test('stitchChunk: next chunk gets a leading space when previous ends mid-word', () => {
  const out = stitchChunk({
    previousChunkTrailing: 'd', // previous chunk ended "...world"
    currentChunk: 'how are you'
  })
  assert.equal(out.textToPaste, ' how are you')
  assert.equal(out.newTrailing, 'u')
})

test('stitchChunk: no double space when previous chunk already ended with whitespace', () => {
  const out = stitchChunk({
    previousChunkTrailing: ' ',
    currentChunk: 'continued speech'
  })
  assert.equal(out.textToPaste, 'continued speech')
})

test('stitchChunk: no leading space when chunk starts with comma', () => {
  // E.g. previous chunk was "I want to say", next starts with ", however".
  const out = stitchChunk({
    previousChunkTrailing: 'y',
    currentChunk: ', however'
  })
  assert.equal(out.textToPaste, ', however')
})

test('stitchChunk: no leading space when chunk starts with period', () => {
  const out = stitchChunk({
    previousChunkTrailing: 's',
    currentChunk: '. Next sentence'
  })
  assert.equal(out.textToPaste, '. Next sentence')
})

test('stitchChunk: no leading space when chunk starts with question mark', () => {
  const out = stitchChunk({
    previousChunkTrailing: 'y',
    currentChunk: '? Maybe'
  })
  assert.equal(out.textToPaste, '? Maybe')
})

test('stitchChunk: no leading space when chunk starts with closing bracket', () => {
  const out = stitchChunk({
    previousChunkTrailing: 'e',
    currentChunk: ') and then'
  })
  assert.equal(out.textToPaste, ') and then')
})

// ─────────────────── stitchChunk: silence/empty chunks ───────────────────

test('stitchChunk: empty current chunk paste nothing and preserves trailing', () => {
  const out = stitchChunk({
    previousChunkTrailing: 'd',
    currentChunk: ''
  })
  assert.equal(out.textToPaste, '')
  // Trailing must not advance — next real chunk should see "d" again,
  // not the empty string, so it correctly adds a separator.
  assert.equal(out.newTrailing, 'd')
})

test('stitchChunk: whitespace-only chunk paste nothing and preserves trailing', () => {
  const out = stitchChunk({
    previousChunkTrailing: 'd',
    currentChunk: '   \n\t  '
  })
  assert.equal(out.textToPaste, '')
  assert.equal(out.newTrailing, 'd')
})

test('stitchChunk: silence then real chunk — separator still added correctly', () => {
  // Simulate a 3-chunk sequence: "hello", "", "world".
  // The middle silence shouldn't break the spacing logic.
  let trailing = null
  let out = stitchChunk({ previousChunkTrailing: trailing, currentChunk: 'hello' })
  trailing = out.newTrailing
  assert.equal(out.textToPaste, 'hello')

  out = stitchChunk({ previousChunkTrailing: trailing, currentChunk: '' })
  trailing = out.newTrailing
  assert.equal(out.textToPaste, '')

  out = stitchChunk({ previousChunkTrailing: trailing, currentChunk: 'world' })
  assert.equal(out.textToPaste, ' world')
})

// ─────────────────── ChunkQueue ───────────────────

test('ChunkQueue: starts empty and idle', () => {
  const q = new ChunkQueue()
  assert.equal(q.size(), 0)
  assert.equal(q.isBusy(), false)
})

test('ChunkQueue: enqueue increases size', () => {
  const q = new ChunkQueue()
  q.enqueue('a')
  q.enqueue('b')
  assert.equal(q.size(), 2)
})

test('ChunkQueue: takeIfIdle returns first item, sets busy, decreases size', () => {
  const q = new ChunkQueue()
  q.enqueue('a')
  q.enqueue('b')
  const taken = q.takeIfIdle()
  assert.equal(taken, 'a')
  assert.equal(q.isBusy(), true)
  assert.equal(q.size(), 1)
})

test('ChunkQueue: takeIfIdle returns null when busy', () => {
  const q = new ChunkQueue()
  q.enqueue('a')
  q.enqueue('b')
  q.takeIfIdle() // becomes busy
  assert.equal(q.takeIfIdle(), null) // can't take while busy
})

test('ChunkQueue: takeIfIdle returns null when empty (and stays idle)', () => {
  const q = new ChunkQueue()
  assert.equal(q.takeIfIdle(), null)
  assert.equal(q.isBusy(), false)
})

test('ChunkQueue: release clears busy without changing queue contents', () => {
  const q = new ChunkQueue()
  q.enqueue('a')
  q.enqueue('b')
  q.takeIfIdle()
  q.release()
  assert.equal(q.isBusy(), false)
  assert.equal(q.size(), 1) // 'b' still queued
})

test('ChunkQueue: typical full cycle — enqueue, take, release, take next', () => {
  const q = new ChunkQueue()
  q.enqueue('a')
  q.enqueue('b')
  assert.equal(q.takeIfIdle(), 'a')
  q.release()
  assert.equal(q.takeIfIdle(), 'b')
  q.release()
  assert.equal(q.size(), 0)
})

test('ChunkQueue: clear empties everything (including busy state)', () => {
  const q = new ChunkQueue()
  q.enqueue('a')
  q.enqueue('b')
  q.takeIfIdle()
  q.clear()
  assert.equal(q.size(), 0)
  assert.equal(q.isBusy(), false)
})
