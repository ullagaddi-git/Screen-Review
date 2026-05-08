import sharp from 'sharp'

/**
 * Returns the percentage of bytes that differ between two PNG buffers.
 * Used by autoscroll to verify that simulated scroll actually moved
 * pixels — if two consecutive frames have ~0% diff, the scroll silently
 * failed and we should bail or try a different scroll method.
 *
 * Returns a value in [0, 100]. Returns 100 if the two frames have
 * different dimensions (treat as fully different).
 */
export async function pixelDiffPercent(prev: Buffer, curr: Buffer): Promise<number> {
  const [prevRaw, currRaw] = await Promise.all([
    sharp(prev).raw().toBuffer({ resolveWithObject: true }),
    sharp(curr).raw().toBuffer({ resolveWithObject: true })
  ])

  if (
    prevRaw.info.width !== currRaw.info.width ||
    prevRaw.info.height !== currRaw.info.height ||
    prevRaw.data.length !== currRaw.data.length
  ) {
    return 100
  }

  let diffBytes = 0
  const len = prevRaw.data.length
  for (let i = 0; i < len; i++) {
    if (prevRaw.data[i] !== currRaw.data[i]) diffBytes++
  }
  return (diffBytes / len) * 100
}
