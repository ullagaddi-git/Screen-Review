// Tests for the hotkey formatter — converts a browser KeyboardEvent into
// our config-format hotkey string ("Ctrl+Shift+V"), with validation that
// catches modifier-only presses, unsupported keys, and missing modifiers.
//
// L2 acceptance criteria for TASK-037:
//  - Letters, digits, F-keys, and the named special keys all produce valid combos
//  - Modifier-only presses return reason='modifier-only' (caller keeps listening)
//  - No-modifier presses return reason='no-modifier' (we require Ctrl/Shift/Alt
//    so hotkeys can't collide with normal typing)
//  - Unsupported key codes return reason='unsupported-key'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatHotkeyFromEvent,
  eventCodeToToken
} from '../src/renderer/windows/settings/tabs/hotkey-format.ts'

const mods = (extras = {}) => ({
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...extras
})

test('formatHotkeyFromEvent: Ctrl+Shift+V → "Ctrl+Shift+V"', () => {
  const r = formatHotkeyFromEvent({ code: 'KeyV', ...mods({ ctrlKey: true, shiftKey: true }) })
  assert.deepEqual(r, { ok: true, combo: 'Ctrl+Shift+V' })
})

test('formatHotkeyFromEvent: Ctrl+Shift+Space (the default voice hotkey)', () => {
  const r = formatHotkeyFromEvent({ code: 'Space', ...mods({ ctrlKey: true, shiftKey: true }) })
  assert.deepEqual(r, { ok: true, combo: 'Ctrl+Shift+Space' })
})

test('formatHotkeyFromEvent: Alt+F4 → "Alt+F4"', () => {
  const r = formatHotkeyFromEvent({ code: 'F4', ...mods({ altKey: true }) })
  assert.deepEqual(r, { ok: true, combo: 'Alt+F4' })
})

test('formatHotkeyFromEvent: digits work (Ctrl+1)', () => {
  const r = formatHotkeyFromEvent({ code: 'Digit1', ...mods({ ctrlKey: true }) })
  assert.deepEqual(r, { ok: true, combo: 'Ctrl+1' })
})

test('formatHotkeyFromEvent: arrow keys are normalized (ArrowDown → Down)', () => {
  const r = formatHotkeyFromEvent({ code: 'ArrowDown', ...mods({ ctrlKey: true, altKey: true }) })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.combo, 'Ctrl+Alt+Down')
})

test('formatHotkeyFromEvent: modifier order is canonical (Ctrl, Shift, Alt, Meta)', () => {
  // Even if the user holds them in a different order, the output is consistent.
  const r = formatHotkeyFromEvent({
    code: 'KeyA',
    ...mods({ metaKey: true, altKey: true, ctrlKey: true, shiftKey: true })
  })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.combo, 'Ctrl+Shift+Alt+Meta+A')
})

test('formatHotkeyFromEvent: modifier-only press returns modifier-only', () => {
  for (const code of [
    'ControlLeft',
    'ControlRight',
    'ShiftLeft',
    'ShiftRight',
    'AltLeft',
    'AltRight',
    'MetaLeft',
    'MetaRight'
  ]) {
    const r = formatHotkeyFromEvent({ code, ...mods({ ctrlKey: true }) })
    assert.deepEqual(r, { ok: false, reason: 'modifier-only' }, `for code=${code}`)
  }
})

test('formatHotkeyFromEvent: plain key without modifier is rejected', () => {
  const r = formatHotkeyFromEvent({ code: 'KeyA', ...mods() })
  assert.deepEqual(r, { ok: false, reason: 'no-modifier' })
})

test('formatHotkeyFromEvent: F-key without modifier is also rejected', () => {
  // F12 alone is a common dev shortcut and would clash with browsers/IDEs.
  // We require a modifier even for F-keys to keep things consistent.
  const r = formatHotkeyFromEvent({ code: 'F12', ...mods() })
  assert.deepEqual(r, { ok: false, reason: 'no-modifier' })
})

test('formatHotkeyFromEvent: unsupported codes are rejected', () => {
  // Random unmapped codes — e.g. media keys we haven't whitelisted, dead keys.
  const r = formatHotkeyFromEvent({ code: 'AudioVolumeUp', ...mods({ ctrlKey: true }) })
  assert.deepEqual(r, { ok: false, reason: 'unsupported-key' })
})

test('eventCodeToToken: punctuation keys map to their printable forms', () => {
  assert.equal(eventCodeToToken('Minus'), '-')
  assert.equal(eventCodeToToken('Equal'), '=')
  assert.equal(eventCodeToToken('BracketLeft'), '[')
  assert.equal(eventCodeToToken('Slash'), '/')
})

test('eventCodeToToken: NumpadEnter aliases to Enter (matches Electron Accelerator format)', () => {
  assert.equal(eventCodeToToken('NumpadEnter'), 'Enter')
  assert.equal(eventCodeToToken('Enter'), 'Enter')
})
