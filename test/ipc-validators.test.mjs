// Tests for IPC input validators. These run against ANY untrusted payload
// the renderer might send through contextBridge — the goal is to never let
// a malformed value reach a native API (sharp, fs, clipboard, shell.openExternal).
//
// L2 acceptance criteria for TASK-042:
//  - validateRegionRect rejects non-objects, non-numeric fields, NaN, Infinity,
//    negative w/h, and zero-sized rects
//  - isValidCaptureMode accepts only the 4 known modes
//  - isHttpUrl accepts http/https only (no file://, javascript://, data:, etc.)
//  - isNonEmptyString rejects '', non-strings, but accepts whitespace strings
//    (the calling handler decides whether to trim further)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidCaptureMode,
  validateRegionRect,
  isHttpUrl,
  isNonEmptyString
} from '../src/main/services/ipc-validators.ts'

// ─────────────────── isValidCaptureMode ───────────────────

test('isValidCaptureMode: accepts the 4 known modes', () => {
  assert.equal(isValidCaptureMode('region'), true)
  assert.equal(isValidCaptureMode('window'), true)
  assert.equal(isValidCaptureMode('desktop'), true)
  assert.equal(isValidCaptureMode('autoscroll'), true)
})

test('isValidCaptureMode: rejects unknown strings', () => {
  assert.equal(isValidCaptureMode('all'), false)
  assert.equal(isValidCaptureMode('REGION'), false) // case-sensitive
  assert.equal(isValidCaptureMode(''), false)
  assert.equal(isValidCaptureMode('region; rm -rf /'), false)
})

test('isValidCaptureMode: rejects non-strings', () => {
  assert.equal(isValidCaptureMode(null), false)
  assert.equal(isValidCaptureMode(undefined), false)
  assert.equal(isValidCaptureMode(0), false)
  assert.equal(isValidCaptureMode({}), false)
  assert.equal(isValidCaptureMode([]), false)
  assert.equal(isValidCaptureMode(true), false)
})

// ─────────────────── validateRegionRect ───────────────────

test('validateRegionRect: accepts valid rects and rounds them', () => {
  assert.deepEqual(validateRegionRect({ x: 10, y: 20, w: 100, h: 50 }), {
    x: 10,
    y: 20,
    w: 100,
    h: 50
  })
})

test('validateRegionRect: rounds fractional pixel values (DPI scaling artefacts)', () => {
  assert.deepEqual(validateRegionRect({ x: 10.7, y: 20.4, w: 99.6, h: 50.1 }), {
    x: 11,
    y: 20,
    w: 100,
    h: 50
  })
})

test('validateRegionRect: clamps negative x/y to 0 (renderer might send neg from edge cases)', () => {
  assert.deepEqual(validateRegionRect({ x: -5, y: -10, w: 100, h: 50 }), {
    x: 0,
    y: 0,
    w: 100,
    h: 50
  })
})

test('validateRegionRect: rejects non-objects', () => {
  assert.equal(validateRegionRect(null), null)
  assert.equal(validateRegionRect(undefined), null)
  assert.equal(validateRegionRect('rect'), null)
  assert.equal(validateRegionRect(42), null)
})

test('validateRegionRect: rejects missing fields', () => {
  assert.equal(validateRegionRect({ x: 0, y: 0, w: 100 }), null) // no h
  assert.equal(validateRegionRect({ x: 0, y: 0 }), null)
  assert.equal(validateRegionRect({}), null)
})

test('validateRegionRect: rejects non-numeric fields', () => {
  assert.equal(validateRegionRect({ x: '0', y: 0, w: 100, h: 50 }), null)
  assert.equal(validateRegionRect({ x: 0, y: 0, w: '100', h: 50 }), null)
  assert.equal(validateRegionRect({ x: null, y: 0, w: 100, h: 50 }), null)
})

test('validateRegionRect: rejects NaN and Infinity (could crash sharp)', () => {
  assert.equal(validateRegionRect({ x: NaN, y: 0, w: 100, h: 50 }), null)
  assert.equal(validateRegionRect({ x: 0, y: 0, w: Infinity, h: 50 }), null)
  assert.equal(validateRegionRect({ x: 0, y: 0, w: 100, h: -Infinity }), null)
})

test('validateRegionRect: rejects zero or sub-pixel width/height', () => {
  assert.equal(validateRegionRect({ x: 0, y: 0, w: 0, h: 50 }), null)
  assert.equal(validateRegionRect({ x: 0, y: 0, w: 100, h: 0 }), null)
  assert.equal(validateRegionRect({ x: 0, y: 0, w: 0.5, h: 50 }), null)
})

// ─────────────────── isHttpUrl ───────────────────

test('isHttpUrl: accepts http and https', () => {
  assert.equal(isHttpUrl('https://ollama.com'), true)
  assert.equal(isHttpUrl('http://localhost:5173/foo'), true)
  assert.equal(isHttpUrl('HTTPS://example.com'), true) // case-insensitive
})

test('isHttpUrl: rejects dangerous protocols', () => {
  assert.equal(isHttpUrl('file:///c:/windows/system32/cmd.exe'), false)
  assert.equal(isHttpUrl('javascript:alert(1)'), false)
  assert.equal(isHttpUrl('data:text/html,<script>alert(1)</script>'), false)
  assert.equal(isHttpUrl('ftp://example.com'), false)
  assert.equal(isHttpUrl('chrome://settings'), false)
})

test('isHttpUrl: rejects non-strings and empty strings', () => {
  assert.equal(isHttpUrl(null), false)
  assert.equal(isHttpUrl(undefined), false)
  assert.equal(isHttpUrl(''), false)
  assert.equal(isHttpUrl({ url: 'https://x' }), false)
})

// ─────────────────── isNonEmptyString ───────────────────

test('isNonEmptyString: accepts non-empty strings', () => {
  assert.equal(isNonEmptyString('hi'), true)
  assert.equal(isNonEmptyString(' '), true) // whitespace-only is still non-empty
  assert.equal(isNonEmptyString('error: x failed'), true)
})

test('isNonEmptyString: rejects empty string and non-strings', () => {
  assert.equal(isNonEmptyString(''), false)
  assert.equal(isNonEmptyString(null), false)
  assert.equal(isNonEmptyString(undefined), false)
  assert.equal(isNonEmptyString(0), false)
  assert.equal(isNonEmptyString({}), false)
})
