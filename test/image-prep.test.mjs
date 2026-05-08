// Tests for prepareImageForAI — the resize step that keeps vision-model
// inference time predictable on CPU. Without this, a 1920×1080 capture
// can take 60–180 s; resized to 1024 px it takes 5–20 s.
//
// L2 acceptance criteria for TASK-035 (perf optimization):
//  - Images larger than MAX on the longest side get resized
//  - Aspect ratio is preserved
//  - Already-small images pass through unchanged (no needless re-encoding)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {
  prepareImageForAI,
  MAX_AI_IMAGE_LONG_SIDE
} from '../src/main/services/image-prep.ts'

async function makePng(width, height, color = { r: 50, g: 50, b: 70 }) {
  return sharp({
    create: { width, height, channels: 3, background: color }
  })
    .png()
    .toBuffer()
}

test('prepareImageForAI: resizes a 1920×1080 image to fit within max long-side', async () => {
  const buf = await makePng(1920, 1080)
  const out = await prepareImageForAI(buf)
  assert.equal(out.resized, true)
  assert.ok(Math.max(out.width, out.height) <= MAX_AI_IMAGE_LONG_SIDE)
  assert.equal(out.width, MAX_AI_IMAGE_LONG_SIDE) // longer dim → max
})

test('prepareImageForAI: preserves aspect ratio (no squashing)', async () => {
  const buf = await makePng(1920, 1080)
  const inputAspect = 1920 / 1080
  const out = await prepareImageForAI(buf)
  const outAspect = out.width / out.height
  // Allow ~1% tolerance for integer rounding
  assert.ok(Math.abs(inputAspect - outAspect) < 0.01)
})

test('prepareImageForAI: passes through small images unchanged', async () => {
  // Use a size guaranteed to be smaller than the max long side regardless
  // of how we tune that constant.
  const w = Math.min(MAX_AI_IMAGE_LONG_SIDE - 100, 600)
  const h = Math.round(w * 0.75)
  const buf = await makePng(w, h)
  const out = await prepareImageForAI(buf)
  assert.equal(out.resized, false)
  assert.equal(out.width, w)
  assert.equal(out.height, h)
})

test('prepareImageForAI: handles tall images (longest side is height)', async () => {
  const buf = await makePng(800, 3000)
  const out = await prepareImageForAI(buf)
  assert.equal(out.resized, true)
  assert.equal(out.height, MAX_AI_IMAGE_LONG_SIDE)
  assert.ok(out.width < out.height) // still tall after resize
})

test('prepareImageForAI: returns valid base64 that decodes to a PNG', async () => {
  const buf = await makePng(2000, 1000)
  const out = await prepareImageForAI(buf)
  const decoded = Buffer.from(out.base64, 'base64')
  // Verify the result is actually a valid PNG by re-reading via sharp
  const meta = await sharp(decoded).metadata()
  assert.equal(meta.format, 'png')
  assert.equal(meta.width, out.width)
  assert.equal(meta.height, out.height)
})
