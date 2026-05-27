// Tests for the pure logger helpers. The file-based side of the logger
// (initLogger, log, rotation rename, uncaughtException hooks) is verified
// at runtime via L4 — but the formatter and rotation-threshold logic
// can and should be unit-tested.
//
// L2 acceptance criteria for TASK-048:
//  - Log lines always start with an ISO 8601 timestamp + uppercased level
//  - Lines always end with a newline (so appendFileSync produces real lines)
//  - rotateIfNeeded returns true at-or-above the cap, false below
//  - rotateIfNeeded handles bad config (maxBytes <= 0) without churning

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatLogLine,
  rotateIfNeeded
} from '../src/main/services/logger-helpers.ts'

// ─────────────────── formatLogLine ───────────────────

test('formatLogLine: starts with ISO 8601 timestamp', () => {
  const line = formatLogLine(new Date('2026-05-08T10:30:45.123Z'), 'info', 'hello')
  assert.match(line, /^2026-05-08T10:30:45\.123Z\s/)
})

test('formatLogLine: includes uppercased level in brackets', () => {
  const line = formatLogLine(new Date('2026-05-08T00:00:00Z'), 'warn', 'something')
  assert.match(line, /\[WARN\]/)
})

test('formatLogLine: includes the message verbatim', () => {
  const line = formatLogLine(new Date(), 'error', 'capture failed: ENOENT')
  assert.match(line, /capture failed: ENOENT/)
})

test('formatLogLine: always ends with a single newline', () => {
  const line = formatLogLine(new Date(), 'info', 'no newline here')
  assert.equal(line.endsWith('\n'), true)
  // And only one — appendFileSync expects to be in charge of separation.
  assert.equal(line.match(/\n/g)?.length, 1)
})

test('formatLogLine: handles multi-line messages without breaking the format', () => {
  // Stack traces are multi-line. We don't try to indent or escape — the
  // first line carries the timestamp/level, the rest are continuation lines
  // that grep handles fine.
  const line = formatLogLine(
    new Date(),
    'error',
    'Error: boom\n    at foo (file.ts:1:1)\n    at bar (file.ts:2:1)'
  )
  assert.match(line, /\[ERROR\] Error: boom/)
  assert.match(line, /at foo/)
  assert.match(line, /at bar/)
  assert.equal(line.endsWith('\n'), true)
})

// ─────────────────── rotateIfNeeded ───────────────────

test('rotateIfNeeded: false when current size is below cap', () => {
  assert.equal(rotateIfNeeded(0, 5_000_000), false)
  assert.equal(rotateIfNeeded(4_999_999, 5_000_000), false)
})

test('rotateIfNeeded: true when current size is exactly the cap', () => {
  assert.equal(rotateIfNeeded(5_000_000, 5_000_000), true)
})

test('rotateIfNeeded: true when current size is over the cap (rotation backlog)', () => {
  assert.equal(rotateIfNeeded(10_000_000, 5_000_000), true)
})

test('rotateIfNeeded: defensive — maxBytes=0 never triggers rotation', () => {
  // Misconfiguration shouldn't cause the logger to rotate on every write.
  assert.equal(rotateIfNeeded(0, 0), false)
  assert.equal(rotateIfNeeded(1_000_000, 0), false)
})

test('rotateIfNeeded: defensive — negative cap never triggers', () => {
  assert.equal(rotateIfNeeded(1_000, -1), false)
})
