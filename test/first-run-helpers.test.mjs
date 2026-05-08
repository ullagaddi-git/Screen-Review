// Tests for the first-run decision logic. The actual notification flow
// lives in first-run.ts (which has Electron + Ollama side effects we
// can't easily test), but the decision functions here are pure.
//
// L2 acceptance criteria for TASK-039:
//  - Welcome shows only on first run AND only if notifications are enabled
//  - Ollama prompt shows only on first run AND only if Ollama isn't running
//    AND only if notifications are enabled (respects user opt-out)
//  - Welcome body interpolates the user's actual hotkeys (no stale defaults
//    if they've rebound them)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldShowWelcome,
  shouldPromptOllama,
  welcomeBody
} from '../src/main/services/first-run-helpers.ts'

test('shouldShowWelcome: only on first run + notifications enabled', () => {
  assert.equal(
    shouldShowWelcome({
      isFirstRun: true,
      notificationsEnabled: true,
      voiceHotkey: 'Ctrl+Shift+Space',
      captureHotkey: 'Ctrl+Shift+S'
    }),
    true
  )
})

test('shouldShowWelcome: false if not first run', () => {
  assert.equal(
    shouldShowWelcome({
      isFirstRun: false,
      notificationsEnabled: true,
      voiceHotkey: 'x',
      captureHotkey: 'y'
    }),
    false
  )
})

test('shouldShowWelcome: false if notifications globally disabled', () => {
  // Respect the user's opt-out — don't badger them on first run if they
  // explicitly turned off notifications in Settings.
  assert.equal(
    shouldShowWelcome({
      isFirstRun: true,
      notificationsEnabled: false,
      voiceHotkey: 'x',
      captureHotkey: 'y'
    }),
    false
  )
})

test('shouldPromptOllama: only when first run, notifs on, AND ollama down', () => {
  assert.equal(
    shouldPromptOllama({
      isFirstRun: true,
      notificationsEnabled: true,
      ollamaRunning: false
    }),
    true
  )
})

test('shouldPromptOllama: false if Ollama is already running (no nudge needed)', () => {
  assert.equal(
    shouldPromptOllama({
      isFirstRun: true,
      notificationsEnabled: true,
      ollamaRunning: true
    }),
    false
  )
})

test('shouldPromptOllama: false on subsequent launches', () => {
  assert.equal(
    shouldPromptOllama({
      isFirstRun: false,
      notificationsEnabled: true,
      ollamaRunning: false
    }),
    false
  )
})

test('shouldPromptOllama: false when notifications disabled', () => {
  assert.equal(
    shouldPromptOllama({
      isFirstRun: true,
      notificationsEnabled: false,
      ollamaRunning: false
    }),
    false
  )
})

test('welcomeBody: interpolates the user\'s actual hotkeys', () => {
  assert.equal(
    welcomeBody('Ctrl+Shift+Space', 'Ctrl+Shift+S'),
    'Hold Ctrl+Shift+Space to dictate, press Ctrl+Shift+S to capture & analyze a screenshot.'
  )
})

test('welcomeBody: reflects rebound hotkeys, not defaults', () => {
  // Regression: if a user rebinds to Ctrl+Shift+J, the welcome notification
  // should show their NEW hotkey, not Ctrl+Shift+Space. Lock in.
  const body = welcomeBody('Ctrl+Shift+J', 'Alt+F12')
  assert.match(body, /Ctrl\+Shift\+J/)
  assert.match(body, /Alt\+F12/)
  assert.doesNotMatch(body, /Ctrl\+Shift\+Space/)
  assert.doesNotMatch(body, /Ctrl\+Shift\+S(?!h)/) // "Shift" is OK; bare "Ctrl+Shift+S" is not
})
