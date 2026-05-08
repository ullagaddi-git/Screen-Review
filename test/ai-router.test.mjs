// Tests for the pure AI strategy picker.
//
// L2 acceptance criteria for TASK-031 (router):
//  - 'local' mode → ollama
//  - 'cloud' mode → openai (regardless of whether a key is set; the key
//    check happens at execution time so the user gets a clear "key missing"
//    error rather than silently falling back to local)
//  - 'ask' mode → ollama (v1 default per roadmap; will become a runtime
//    chooser in a later phase, but the lock-in test here documents v1's
//    behavior so a future change is intentional)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickStrategy } from '../src/main/services/ai-router.ts'

test("pickStrategy: 'local' mode → ollama", () => {
  assert.equal(pickStrategy({ aiMode: 'local', hasOpenAIKey: false }), 'ollama')
  assert.equal(pickStrategy({ aiMode: 'local', hasOpenAIKey: true }), 'ollama')
})

test("pickStrategy: 'cloud' mode → openai", () => {
  // 'cloud' goes to openai REGARDLESS of whether the key is currently set.
  // We deliberately don't auto-fallback to ollama here — the user's choice
  // of cloud is intentional, and the key-missing error is more useful than
  // a silent demotion to local AI.
  assert.equal(pickStrategy({ aiMode: 'cloud', hasOpenAIKey: false }), 'openai')
  assert.equal(pickStrategy({ aiMode: 'cloud', hasOpenAIKey: true }), 'openai')
})

test("pickStrategy: 'ask' mode → ollama (v1 default)", () => {
  // Roadmap says 'ask' should eventually prompt the user per-capture; for
  // v1 it just uses local. This test documents that decision so a future
  // change to add the chooser breaks the test deliberately.
  assert.equal(pickStrategy({ aiMode: 'ask', hasOpenAIKey: false }), 'ollama')
  assert.equal(pickStrategy({ aiMode: 'ask', hasOpenAIKey: true }), 'ollama')
})
