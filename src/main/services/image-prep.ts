import sharp from 'sharp'

/**
 * Vision models are trained on images much smaller than typical 1920×1080
 * desktop captures. Sending the full-resolution image wastes inference time
 * for no accuracy gain — most vision encoders downsample to 336–1344 px
 * internally anyway.
 *
 * 768 px on the longest side: still legible for terminal-text screenshots
 * but ~6× fewer pixels than 1920×1080, which roughly halves CPU-side
 * vision-encoder time vs the previous 1024 default. On modest CPUs this
 * is the difference between "30 s wait" and "90 s wait" for first inference.
 */
export const MAX_AI_IMAGE_LONG_SIDE = 768

/**
 * Returns a base64 PNG sized to AT MOST `MAX_AI_IMAGE_LONG_SIDE` on its
 * longest side. Aspect ratio is preserved. If the input is already small
 * enough, returns the original buffer unchanged (no needless re-encoding).
 */
export async function prepareImageForAI(pngBuffer: Buffer): Promise<{
  base64: string
  width: number
  height: number
  resized: boolean
}> {
  const meta = await sharp(pngBuffer).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  const longSide = Math.max(w, h)

  if (longSide <= MAX_AI_IMAGE_LONG_SIDE) {
    return {
      base64: pngBuffer.toString('base64'),
      width: w,
      height: h,
      resized: false
    }
  }

  const scale = MAX_AI_IMAGE_LONG_SIDE / longSide
  const targetW = Math.round(w * scale)
  const targetH = Math.round(h * scale)

  const resized = await sharp(pngBuffer)
    .resize(targetW, targetH, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()

  return {
    base64: resized.toString('base64'),
    width: targetW,
    height: targetH,
    resized: true
  }
}
