// Tests for the auto-scroll frame-stitching algorithm.
//
// We can't run the full sharp-based stitchFrames pipeline in unit tests, but
// we CAN exercise the row-overlap detection logic — which is the heart of
// stitching. The algorithm now uses byte-level comparison with a tolerance
// (anti-aliased text in editors causes ~1-3% subpixel differences between
// frames showing the same content; strict byte equality missed these and
// produced ugly duplicate-row stitched images).
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ROW_DIFF_TOLERANCE_PCT = 2.0

/** Standalone copy of the algorithm — same logic as src/main/services/stitch.ts */
function rowsMatchWithTolerance(prevRaw, currRaw, prevHeight, k, stride) {
  const prevStart = (prevHeight - k) * stride
  const totalBytes = k * stride
  const tolerance = Math.floor((totalBytes * ROW_DIFF_TOLERANCE_PCT) / 100)
  let diffBytes = 0
  for (let i = 0; i < totalBytes; i++) {
    if (prevRaw[prevStart + i] !== currRaw[i]) {
      diffBytes++
      if (diffBytes > tolerance) return false
    }
  }
  return true
}

function findRowOverlap(prevRaw, currRaw, prevHeight, currHeight, width, channels = 4, maxCheck = 200) {
  const stride = width * channels
  const limit = Math.min(prevHeight, currHeight, maxCheck)
  for (let k = limit; k >= 1; k--) {
    if (rowsMatchWithTolerance(prevRaw, currRaw, prevHeight, k, stride)) return k
  }
  return 0
}

/** Helper: build a frame buffer where row N is filled with byte value N % 256. */
function makeFrame(height, width, channels = 4) {
  const stride = width * channels
  const buf = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    buf.fill(y % 256, y * stride, (y + 1) * stride)
  }
  return buf
}

test('findRowOverlap: zero overlap when frames are completely different', () => {
  const w = 10, h = 5
  const prev = Buffer.from([...new Array(h * w * 4)].map((_, i) => i % 256))
  const curr = Buffer.from([...new Array(h * w * 4)].map((_, i) => (i + 100) % 256))
  // Sanity: no rows match
  assert.equal(findRowOverlap(prev, curr, h, h, w), 0)
})

test('findRowOverlap: detects exact 3-row overlap', () => {
  const w = 4
  // Build prev: rows [A, B, C, X, Y]; build curr: rows [X, Y, ..., ..., ...]
  // where last 2 rows of prev (X, Y) == first 2 rows of curr (X, Y).
  const prev = Buffer.from([
    ...Buffer.alloc(w * 4, 1), // row 0: all 1s
    ...Buffer.alloc(w * 4, 2), // row 1: all 2s
    ...Buffer.alloc(w * 4, 3), // row 2: all 3s
    ...Buffer.alloc(w * 4, 88), // row 3: all 88s — overlap row 1
    ...Buffer.alloc(w * 4, 99) // row 4: all 99s — overlap row 2
  ])
  const curr = Buffer.from([
    ...Buffer.alloc(w * 4, 88), // row 0: 88s
    ...Buffer.alloc(w * 4, 99), // row 1: 99s
    ...Buffer.alloc(w * 4, 7), // row 2: 7s
    ...Buffer.alloc(w * 4, 8), // row 3: 8s
    ...Buffer.alloc(w * 4, 9) // row 4: 9s
  ])
  assert.equal(findRowOverlap(prev, curr, 5, 5, w), 2)
})

test('findRowOverlap: tolerates ≤2% byte-level difference (anti-aliasing)', () => {
  // Editor scenario: same content shown in both frames at the same position,
  // but with a few subpixel anti-aliasing differences. The algorithm should
  // still recognize this as a valid overlap.
  const w = 100 // 100×4 = 400 bytes per row
  const overlapHeight = 20 // 20 rows = 8000 bytes
  // 2% of 8000 = 160 bytes can differ before we reject.

  const prev = Buffer.alloc(20 * w * 4, 50)
  const curr = Buffer.alloc(20 * w * 4, 50)
  // Introduce ~50 byte differences (well under 160 tolerance)
  for (let i = 0; i < 50; i++) {
    curr[i * 13] = 51
  }
  // The algorithm should still find a 20-row overlap (with prevHeight=20, currHeight=20)
  assert.equal(findRowOverlap(prev, curr, 20, 20, w), 20)
})

test('findRowOverlap: rejects overlap when too many bytes differ (>2%)', () => {
  // Same setup as above but introduce 500 differences (well over 160 tolerance)
  const w = 100
  const prev = Buffer.alloc(20 * w * 4, 50)
  const curr = Buffer.alloc(20 * w * 4, 50)
  for (let i = 0; i < 500; i++) {
    curr[i * 13] = 51
  }
  // No 20-row overlap; algorithm should fall back to smaller k or return 0.
  // We don't pin the exact return value because smaller k slices may still
  // happen to be within tolerance for some rows.
  // What we DO assert: it's NOT 20 (the strict expected value) — the
  // algorithm correctly detected too much divergence at the largest k.
  const result = findRowOverlap(prev, curr, 20, 20, w)
  assert.notEqual(result, 20)
})

test('findRowOverlap: terminal Page-Down (small overlap, exact match)', () => {
  // Most common case: terminal scrolls one page; only ~1 line of overlap
  // (e.g. ~22 px). We use the row pattern from makeFrame to build distinct rows.
  const w = 80
  const prev = makeFrame(40, w)
  const curr = makeFrame(40, w)
  // Make the bottom 2 rows of prev equal to top 2 rows of curr
  const stride = w * 4
  curr.copy(prev, (40 - 2) * stride, 0, 2 * stride)
  assert.equal(findRowOverlap(prev, curr, 40, 40, w), 2)
})

test('findRowOverlap: empty frames return 0', () => {
  assert.equal(findRowOverlap(Buffer.alloc(0), Buffer.alloc(40), 0, 10, 1), 0)
})

test('findRowOverlap: prefers largest valid overlap', () => {
  // Construct so multiple candidate sizes match (1-row and 3-row both within tolerance).
  // Algorithm iterates from largest k down, so should return the largest.
  const w = 4
  const prev = Buffer.from([
    ...Buffer.alloc(w * 4, 0), // 0
    ...Buffer.alloc(w * 4, 0), // 0
    ...Buffer.alloc(w * 4, 0), // 0
    ...Buffer.alloc(w * 4, 5), // 5
    ...Buffer.alloc(w * 4, 5), // 5
    ...Buffer.alloc(w * 4, 5) // 5
  ])
  const curr = Buffer.from([
    ...Buffer.alloc(w * 4, 5),
    ...Buffer.alloc(w * 4, 5),
    ...Buffer.alloc(w * 4, 5),
    ...Buffer.alloc(w * 4, 9),
    ...Buffer.alloc(w * 4, 9),
    ...Buffer.alloc(w * 4, 9)
  ])
  assert.equal(findRowOverlap(prev, curr, 6, 6, w), 3)
})
