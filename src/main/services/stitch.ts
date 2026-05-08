import sharp from 'sharp'

const MAX_OUTPUT_HEIGHT = 20_000
const MAX_OVERLAP_CHECK_PX = 200
/**
 * Per-row tolerance for byte-level differences when matching overlap rows.
 * Anti-aliased text in editors / terminals can have 1-3% subpixel changes
 * between scrolled frames even when the same content is shown. A strict
 * byte-equality match misses these and produces stitched images with
 * visible duplicate-row gaps. 2% is generous enough for cleartype-rendered
 * text but tight enough that genuinely different rows don't match.
 */
const ROW_DIFF_TOLERANCE_PCT = 2.0

interface RawFrame {
  width: number
  height: number
  /** Raw RGBA pixel data. Used by the byte-level row comparison. */
  raw: Buffer
  channels: number
  /** Original PNG buffer, kept for the composite step. */
  pngBuffer: Buffer
}

async function loadFrame(png: Buffer): Promise<RawFrame> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  return {
    width: info.width,
    height: info.height,
    raw: data,
    channels: info.channels,
    pngBuffer: png
  }
}

/**
 * Returns true if the bottom `k` rows of `prev` match the top `k` rows of
 * `curr` within `ROW_DIFF_TOLERANCE_PCT` byte-level difference.
 */
function rowsMatchWithTolerance(prev: RawFrame, curr: RawFrame, k: number): boolean {
  const stride = prev.width * prev.channels
  const prevStart = (prev.height - k) * stride
  const totalBytes = k * stride
  const tolerance = Math.floor((totalBytes * ROW_DIFF_TOLERANCE_PCT) / 100)
  let diffBytes = 0
  for (let i = 0; i < totalBytes; i++) {
    if (prev.raw[prevStart + i] !== curr.raw[i]) {
      diffBytes++
      if (diffBytes > tolerance) return false
    }
  }
  return true
}

/**
 * Returns the largest k in [1, maxCheck] such that the last k rows of `prev`
 * approximately equal the first k rows of `curr` (within tolerance).
 * 0 if no overlap is detected.
 */
function findRowOverlap(prev: RawFrame, curr: RawFrame): number {
  if (prev.width !== curr.width || prev.channels !== curr.channels) return 0
  const maxCheck = Math.min(prev.height, curr.height, MAX_OVERLAP_CHECK_PX)
  for (let k = maxCheck; k >= 1; k--) {
    if (rowsMatchWithTolerance(prev, curr, k)) return k
  }
  return 0
}

export interface StitchResult {
  pngBuffer: Buffer
  width: number
  height: number
  /** True if any seam pair had no overlap detected — the join will be a hard cut. */
  hasGaps: boolean
  /** True if the result was scaled down to fit the max output height. */
  resized: boolean
}

export async function stitchFrames(framePngBuffers: Buffer[]): Promise<StitchResult> {
  if (framePngBuffers.length === 0) {
    throw new Error('No frames to stitch')
  }
  if (framePngBuffers.length === 1) {
    const meta = await sharp(framePngBuffers[0]).metadata()
    return {
      pngBuffer: framePngBuffers[0],
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      hasGaps: false,
      resized: false
    }
  }

  const frames = await Promise.all(framePngBuffers.map(loadFrame))
  const width = frames[0].width
  const overlaps: number[] = [0] // overlaps[i] = how many rows of frame[i] overlap with frame[i-1]
  let hasGaps = false

  for (let i = 1; i < frames.length; i++) {
    const k = findRowOverlap(frames[i - 1], frames[i])
    if (k === 0) hasGaps = true
    overlaps.push(k)
  }

  // Compute y offsets and total height
  const yOffsets: number[] = [0]
  for (let i = 1; i < frames.length; i++) {
    const prevOffset = yOffsets[i - 1]
    const prevHeight = frames[i - 1].height
    const overlap = overlaps[i]
    yOffsets.push(prevOffset + prevHeight - overlap)
  }
  const totalHeight = yOffsets[frames.length - 1] + frames[frames.length - 1].height

  // Composite. We crop each frame to remove its top overlap rows except the first frame.
  const composites = []
  for (let i = 0; i < frames.length; i++) {
    const overlap = overlaps[i]
    const f = frames[i]
    let input: Buffer
    if (overlap > 0) {
      input = await sharp(f.pngBuffer)
        .extract({ left: 0, top: overlap, width: f.width, height: f.height - overlap })
        .png()
        .toBuffer()
    } else {
      input = f.pngBuffer
    }
    composites.push({ input, top: yOffsets[i] + overlap, left: 0 })
  }

  let stitched = await sharp({
    create: {
      width,
      height: totalHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  })
    .composite(composites)
    .png()
    .toBuffer()

  let outWidth = width
  let outHeight = totalHeight
  let resized = false
  if (totalHeight > MAX_OUTPUT_HEIGHT) {
    const ratio = MAX_OUTPUT_HEIGHT / totalHeight
    outHeight = MAX_OUTPUT_HEIGHT
    outWidth = Math.round(width * ratio)
    stitched = await sharp(stitched).resize(outWidth, outHeight).png().toBuffer()
    resized = true
  }

  return {
    pngBuffer: stitched,
    width: outWidth,
    height: outHeight,
    hasGaps,
    resized
  }
}
