// Tests for the ModePicker keyboard navigation reducer. The component
// (ModePicker.tsx) renders 4 capture-mode buttons and lets the user cycle
// through them with arrow keys, Tab, and Shift+Tab — but the actual key →
// action mapping is a pure function so we can verify it without React.
//
// L2 acceptance criteria for TASK-041:
//  - First mode button focused on open (not tested here — that's component init)
//  - ArrowRight / Tab → next, with wrap-around
//  - ArrowLeft / Shift+Tab → previous, with wrap-around
//  - Enter → select the current focus
//  - Escape → cancel the picker
//  - Any other key → noop (so the component doesn't preventDefault)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  keyToAction,
  nextIdx
} from '../src/renderer/windows/picker/mode-picker-keyboard.ts'

const TOTAL = 4 // region, window, desktop, autoscroll

// ─────────────────── nextIdx ───────────────────

test('nextIdx: moves forward by 1', () => {
  assert.equal(nextIdx(0, TOTAL, 1), 1)
  assert.equal(nextIdx(1, TOTAL, 1), 2)
  assert.equal(nextIdx(2, TOTAL, 1), 3)
})

test('nextIdx: wraps forward off the right edge', () => {
  assert.equal(nextIdx(3, TOTAL, 1), 0)
})

test('nextIdx: moves backward by 1', () => {
  assert.equal(nextIdx(2, TOTAL, -1), 1)
  assert.equal(nextIdx(1, TOTAL, -1), 0)
})

test('nextIdx: wraps backward off the left edge', () => {
  assert.equal(nextIdx(0, TOTAL, -1), 3)
})

test('nextIdx: handles total=1 (degenerate single mode) without dividing by zero', () => {
  assert.equal(nextIdx(0, 1, 1), 0)
  assert.equal(nextIdx(0, 1, -1), 0)
})

test('nextIdx: total=0 returns 0 (defensive — shouldn\'t happen in practice)', () => {
  assert.equal(nextIdx(0, 0, 1), 0)
  assert.equal(nextIdx(0, 0, -1), 0)
})

// ─────────────────── keyToAction ───────────────────

test('ArrowRight: move forward', () => {
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'ArrowRight' }), {
    kind: 'move',
    idx: 1
  })
})

test('ArrowRight from last index: wraps to first', () => {
  assert.deepEqual(keyToAction(3, TOTAL, { key: 'ArrowRight' }), {
    kind: 'move',
    idx: 0
  })
})

test('ArrowLeft: move backward', () => {
  assert.deepEqual(keyToAction(2, TOTAL, { key: 'ArrowLeft' }), {
    kind: 'move',
    idx: 1
  })
})

test('ArrowLeft from first index: wraps to last', () => {
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'ArrowLeft' }), {
    kind: 'move',
    idx: 3
  })
})

test('Tab: same as ArrowRight (forward)', () => {
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'Tab', shiftKey: false }), {
    kind: 'move',
    idx: 1
  })
})

test('Tab without shiftKey omitted: still forward (defensive default)', () => {
  // Some KeyboardEvent shims might not pass shiftKey at all.
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'Tab' }), {
    kind: 'move',
    idx: 1
  })
})

test('Shift+Tab: backward (lock-in regression — was missing before TASK-041)', () => {
  assert.deepEqual(keyToAction(2, TOTAL, { key: 'Tab', shiftKey: true }), {
    kind: 'move',
    idx: 1
  })
})

test('Shift+Tab from first index: wraps to last', () => {
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'Tab', shiftKey: true }), {
    kind: 'move',
    idx: 3
  })
})

test('Tab from last index: wraps to first', () => {
  assert.deepEqual(keyToAction(3, TOTAL, { key: 'Tab', shiftKey: false }), {
    kind: 'move',
    idx: 0
  })
})

test('Enter: select (regardless of focusIdx — the component reads idx separately)', () => {
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'Enter' }), { kind: 'select' })
  assert.deepEqual(keyToAction(3, TOTAL, { key: 'Enter' }), { kind: 'select' })
})

test('Escape: cancel', () => {
  assert.deepEqual(keyToAction(2, TOTAL, { key: 'Escape' }), { kind: 'cancel' })
})

test('Unknown keys (letters, F-keys, modifiers alone): noop — component should NOT preventDefault', () => {
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'a' }), { kind: 'noop' })
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'F5' }), { kind: 'noop' })
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'Shift' }), { kind: 'noop' })
  assert.deepEqual(keyToAction(0, TOTAL, { key: ' ' }), { kind: 'noop' })
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'ArrowUp' }), { kind: 'noop' })
  assert.deepEqual(keyToAction(0, TOTAL, { key: 'ArrowDown' }), { kind: 'noop' })
})
