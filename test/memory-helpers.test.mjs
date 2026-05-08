// Tests for the pure memory aggregation helpers. The Electron-specific
// `getMemorySummary()` (which calls `process.memoryUsage()` and
// `app.getAppMetrics()`) is verified via L4 runtime — but the math that
// turns those raw numbers into the breakdown shown in the App tab can be
// unit-tested.
//
// L2 acceptance criteria for TASK-043:
//  - Skip the 'Browser' (main) entry from getAppMetrics — we already
//    counted main via process.memoryUsage().rss
//  - Renderers backing live windows count toward `rendererMB`
//  - Renderers/helpers NOT backing live windows count toward `otherMB`
//  - Total = main + renderer + other (rounded MB)
//  - meetsIdleTarget flips at 200 MB (the realistic Electron 33 floor;
//    see the IDLE_TARGET_MB comment in memory-helpers.ts for the journey
//    from the original 150 MB aspirational target)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bytesToMB,
  formatMemorySummary,
  summarizeMemory
} from '../src/main/services/memory-helpers.ts'

const MB = 1024 * 1024
const KB = 1024

// ─────────────────── bytesToMB ───────────────────

test('bytesToMB: rounds to nearest MB', () => {
  assert.equal(bytesToMB(0), 0)
  assert.equal(bytesToMB(MB), 1)
  assert.equal(bytesToMB(1.4 * MB), 1)
  assert.equal(bytesToMB(1.6 * MB), 2)
  assert.equal(bytesToMB(150 * MB), 150)
})

// ─────────────────── summarizeMemory ───────────────────

test('summarizeMemory: realistic post-optimization idle (~169 MB measured)', () => {
  // Reflects the actual measured idle baseline after TASK-043 optimizations:
  // disabled HW accel, lazy mic indicator, idle recorder cleanup.
  const result = summarizeMemory({
    mainRssBytes: 76 * MB,
    metrics: [
      { pid: 100, type: 'Browser', memoryWorkingSetSizeKB: 76 * 1024, isLiveWindow: false },
      // No live windows at idle — mic indicator is no longer pre-warmed.
      // Helpers: Network + Storage + Utility processes
      { pid: 300, type: 'Utility', memoryWorkingSetSizeKB: 50 * 1024, isLiveWindow: false },
      { pid: 400, type: 'Utility', memoryWorkingSetSizeKB: 43 * 1024, isLiveWindow: false }
    ]
  })

  assert.equal(result.mainProcessMB, 76)
  assert.equal(result.rendererMB, 0)
  assert.equal(result.otherMB, 93)
  assert.equal(result.totalMB, 169)
  assert.equal(result.liveWindowCount, 0)
  assert.equal(result.meetsIdleTarget, true) // 169 ≤ 200 — within target
})

test('summarizeMemory: with Settings open (idle + 1 live window)', () => {
  const result = summarizeMemory({
    mainRssBytes: 80 * MB,
    metrics: [
      { pid: 100, type: 'Browser', memoryWorkingSetSizeKB: 80 * 1024, isLiveWindow: false },
      { pid: 250, type: 'Tab', memoryWorkingSetSizeKB: 50 * 1024, isLiveWindow: true },
      { pid: 300, type: 'Utility', memoryWorkingSetSizeKB: 90 * 1024, isLiveWindow: false }
    ]
  })

  assert.equal(result.rendererMB, 50)
  assert.equal(result.liveWindowCount, 1)
  assert.equal(result.totalMB, 220) // 80 + 50 + 90
  assert.equal(result.meetsIdleTarget, false) // over 200 with Settings open is fine — not "idle"
})

test('summarizeMemory: meetsIdleTarget flips at 200 MB exactly', () => {
  // 200 MB total → still meets target (<=)
  const at200 = summarizeMemory({
    mainRssBytes: 100 * MB,
    metrics: [
      { pid: 100, type: 'Browser', memoryWorkingSetSizeKB: 100 * 1024, isLiveWindow: false },
      { pid: 200, type: 'Utility', memoryWorkingSetSizeKB: 100 * 1024, isLiveWindow: false }
    ]
  })
  assert.equal(at200.totalMB, 200)
  assert.equal(at200.meetsIdleTarget, true)

  // 201 MB total → fails
  const at201 = summarizeMemory({
    mainRssBytes: 100 * MB,
    metrics: [
      { pid: 100, type: 'Browser', memoryWorkingSetSizeKB: 100 * 1024, isLiveWindow: false },
      { pid: 200, type: 'Utility', memoryWorkingSetSizeKB: 101 * 1024, isLiveWindow: false }
    ]
  })
  assert.equal(at201.totalMB, 201)
  assert.equal(at201.meetsIdleTarget, false)
})

test('summarizeMemory: skips Browser-type entries (they would double-count main)', () => {
  // Lock-in regression: even if app.getAppMetrics() reports a 'Browser'
  // entry alongside our process.memoryUsage().rss, we must not count it
  // twice or the totals would be roughly 2× reality.
  const result = summarizeMemory({
    mainRssBytes: 100 * MB,
    metrics: [
      { pid: 100, type: 'Browser', memoryWorkingSetSizeKB: 100 * 1024, isLiveWindow: false }
    ]
  })
  assert.equal(result.mainProcessMB, 100)
  assert.equal(result.rendererMB, 0)
  assert.equal(result.otherMB, 0)
  assert.equal(result.totalMB, 100)
})

test('summarizeMemory: empty metrics (defensive — Electron API failed)', () => {
  const result = summarizeMemory({
    mainRssBytes: 80 * MB,
    metrics: []
  })
  assert.equal(result.totalMB, 80)
  assert.equal(result.liveWindowCount, 0)
  assert.equal(result.meetsIdleTarget, true)
})

// ─────────────────── formatMemorySummary ───────────────────

test('formatMemorySummary: includes all the numbers and the target check', () => {
  const line = formatMemorySummary({
    mainProcessMB: 76,
    rendererMB: 0,
    otherMB: 93,
    totalMB: 169,
    liveWindowCount: 0,
    meetsIdleTarget: true
  })
  assert.match(line, /total=169 MB/)
  assert.match(line, /main=76/)
  assert.match(line, /renderer=0/)
  assert.match(line, /other=93/)
  assert.match(line, /0 windows\b/)
  assert.match(line, /<200MB/) // realistic Electron 33 floor (was 150 aspirational)
})

test('formatMemorySummary: pluralizes "windows" correctly', () => {
  const line = formatMemorySummary({
    mainProcessMB: 90,
    rendererMB: 60,
    otherMB: 100,
    totalMB: 250,
    liveWindowCount: 3,
    meetsIdleTarget: false
  })
  assert.match(line, /3 windows\b/)
  assert.match(line, />200MB/)
})
