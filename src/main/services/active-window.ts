import { getActiveWindow, type Window as NutWindow } from '@nut-tree-fork/nut-js'

export interface WindowSnapshot {
  ref: NutWindow
  title: string
  initialBounds: { x: number; y: number; width: number; height: number }
}

/**
 * Snapshot the active window's reference and current bounds.
 * The reference is reusable: bounds can be re-queried later (in case the window moved).
 */
export async function snapshotActiveWindow(): Promise<WindowSnapshot | null> {
  try {
    const ref = await getActiveWindow()
    const title = await ref.title
    const region = await ref.region
    console.log(
      `[active-window] snapshot: title="${title}", bounds=(${region.left}, ${region.top}, ${region.width}x${region.height})`
    )
    return {
      ref,
      title,
      initialBounds: {
        x: region.left,
        y: region.top,
        width: region.width,
        height: region.height
      }
    }
  } catch (err) {
    console.warn('[active-window] snapshot failed:', (err as Error).message)
    return null
  }
}

export async function getCurrentBounds(
  snap: WindowSnapshot
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    const region = await snap.ref.region
    console.log(
      `[active-window] currentBounds: (${region.left}, ${region.top}, ${region.width}x${region.height})`
    )
    return {
      x: region.left,
      y: region.top,
      width: region.width,
      height: region.height
    }
  } catch (err) {
    console.warn('[active-window] getCurrentBounds failed:', (err as Error).message)
    return null
  }
}
