// Tests for the recording lifecycle state machine.
// Regression: voice-to-text returned 0-byte buffers because stopRecording
// could fire before startRecording's async setup finished — at which point
// `this.recording` was still false and stopRecording bailed out empty.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RecordingState } from '../src/main/utils/recording-state.ts'

test('initial state: not recording, no start in flight', () => {
  const s = new RecordingState()
  assert.equal(s.isRecording(), false)
  assert.equal(s.isStartInFlight(), false)
})

test('markStart: synchronously sets recording=true (so stop sees the right state)', () => {
  const s = new RecordingState()
  const result = s.markStart()
  assert.equal(result, true)
  assert.equal(s.isRecording(), true) // ← key invariant
  assert.equal(s.isStartInFlight(), true)
})

test('markStart twice while in flight: second call is a no-op', () => {
  const s = new RecordingState()
  assert.equal(s.markStart(), true)
  assert.equal(s.markStart(), false)
  assert.equal(s.isRecording(), true)
})

test('markStop after markStart returns true (work to do)', () => {
  const s = new RecordingState()
  s.markStart()
  s.markStartComplete()
  assert.equal(s.markStop(), true)
  assert.equal(s.isRecording(), false)
})

test('markStop without preceding markStart returns false', () => {
  const s = new RecordingState()
  assert.equal(s.markStop(), false)
})

test('double markStop returns false the second time', () => {
  const s = new RecordingState()
  s.markStart()
  s.markStartComplete()
  assert.equal(s.markStop(), true)
  assert.equal(s.markStop(), false)
})

test('rapid press-release: stop comes BEFORE startComplete — recording is still true', () => {
  // Simulates the race that returned 0 bytes:
  //   T=0:  user presses → markStart() → recording=true, startInFlight=true
  //   T=5:  user releases → caller checks isRecording() → TRUE (correct!)
  //   T=50: ensureWindow finally resolves → markStartComplete()
  //   T=55: caller sends 'recorder:stop'
  // Without the synchronous flag, isRecording() at T=5 would be false and
  // the stop would silently return 0 bytes.
  const s = new RecordingState()
  s.markStart()
  // User releases hotkey immediately:
  assert.equal(s.isRecording(), true)
  // ensureWindow eventually resolves:
  s.markStartComplete()
  assert.equal(s.isStartInFlight(), false)
  assert.equal(s.isRecording(), true)
  // Now stop can fire:
  assert.equal(s.markStop(), true)
})
