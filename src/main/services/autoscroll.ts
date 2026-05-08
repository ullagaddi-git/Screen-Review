import sharp from 'sharp'
import { keyboard, Key } from '@nut-tree-fork/nut-js'
import { capturePrimaryScreen } from './screen'
import { getCurrentBounds, type WindowSnapshot } from './active-window'
import { scrollWindowByTitle } from './win32-scroll'
import { pixelDiffPercent } from './frame-diff'

keyboard.config.autoDelayMs = 0

const SETTLE_AFTER_FOCUS_MS = 200
const SETTLE_AFTER_SCROLL_TOP_MS = 700
const SETTLE_AFTER_SCROLL_DOWN_MS = 400
const MAX_FRAMES = 50
const SCROLL_TICKS_TO_TOP = 100 // ~100 wheel ticks usually reaches the top of typical scrollback
const SCROLL_TICKS_PER_PAGE = 15 // one wheel "page" — ~15 ticks ≈ one viewport for most apps

/**
 * Minimum pixel-diff between consecutive frames for us to count the scroll
 * as "did something". Below this we treat scroll as ineffective and bail
 * with reason=stagnant rather than producing a deceptively-tall image
 * stitched from frames that don't actually advance the content.
 */
const MIN_DIFF_PERCENT = 0.5

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function captureWindowFrame(snapshot: WindowSnapshot): Promise<Buffer> {
  const bounds = (await getCurrentBounds(snapshot)) ?? snapshot.initialBounds
  const cap = await capturePrimaryScreen()

  console.log(
    `[autoscroll] capture: cap=${cap.width}x${cap.height} sf=${cap.scaleFactor}, bounds=(${bounds.x}, ${bounds.y}, ${bounds.width}x${bounds.height})`
  )

  // nut.js returns DIPs; desktopCapturer returns native pixels. Convert.
  const sf = cap.scaleFactor
  const left = Math.max(0, Math.round(bounds.x * sf))
  const top = Math.max(0, Math.round(bounds.y * sf))
  const width = Math.max(1, Math.min(cap.width - left, Math.round(bounds.width * sf)))
  const height = Math.max(1, Math.min(cap.height - top, Math.round(bounds.height * sf)))

  console.log(`[autoscroll] extract: left=${left}, top=${top}, ${width}x${height}`)

  if (width < 50 || height < 50) {
    throw new Error(
      `Window bounds too small (${width}x${height}) — likely a stale or invalid window reference. Click in the target window first, then press the capture hotkey.`
    )
  }

  return sharp(cap.pngBuffer).extract({ left, top, width, height }).png().toBuffer()
}

export interface AutoScrollResult {
  frames: Buffer[]
  reachedBottom: boolean
  reason:
    | 'bottom-detected'
    | 'max-frames'
    | 'single-frame'
    | 'aborted'
    /**
     * The first scroll didn't move pixels — the target app likely doesn't
     * respond to WM_MOUSEWHEEL (e.g. Chromium-based chat panels like Claude
     * desktop, ChatGPT desktop). Caller should surface a clear notification
     * rather than silently returning a single frame.
     */
    | 'scroll-ineffective'
}

export async function autoScrollCapture(snapshot: WindowSnapshot): Promise<AutoScrollResult> {
  console.log(`[autoscroll] start: target="${snapshot.title}"`)

  // Focus the target window so it receives messages reliably.
  try {
    await snapshot.ref.focus()
    console.log('[autoscroll] target focused')
  } catch (err) {
    console.warn('[autoscroll] focus failed:', (err as Error).message)
  }
  await sleep(SETTLE_AFTER_FOCUS_MS)

  // Scroll to top via Win32 SendMessage WM_MOUSEWHEEL — sent directly to the
  // target HWND so cursor position doesn't matter and the scroll lands.
  console.log(`[autoscroll] scrolling to top via Win32 (${SCROLL_TICKS_TO_TOP} ticks)`)
  const upResult = await scrollWindowByTitle(snapshot.title, 'up', SCROLL_TICKS_TO_TOP)
  console.log(`[autoscroll] scroll-up result: ok=${upResult.ok}, hwnd=${upResult.hwnd}, reason=${upResult.reason ?? 'n/a'}`)

  if (!upResult.ok && upResult.reason === 'window-not-found') {
    console.warn('[autoscroll] could not find target window — aborting')
    return { frames: [], reachedBottom: false, reason: 'aborted' }
  }
  await sleep(SETTLE_AFTER_SCROLL_TOP_MS)

  const frames: Buffer[] = []
  let reason: AutoScrollResult['reason'] = 'max-frames'

  /**
   * Scroll method state machine. We start with Win32 SendMessage WM_MOUSEWHEEL
   * which works for native Win32 windows (terminals, browsers, native apps).
   * If the first scroll-down produces 0% pixel diff, we infer the target is a
   * Chromium-based app (VS Code, Claude desktop) that doesn't respond to
   * WM_MOUSEWHEEL — then we fall back to nut.js keyboard PageDown which
   * Chromium DOES handle through its standard input pipeline.
   */
  let scrollMethod: 'win32' | 'keyboard' = 'win32'
  let switchedToKeyboard = false

  const scrollOnePage = async (): Promise<boolean> => {
    if (scrollMethod === 'win32') {
      const r = await scrollWindowByTitle(snapshot.title, 'down', SCROLL_TICKS_PER_PAGE)
      return r.ok
    }
    try {
      await keyboard.pressKey(Key.PageDown)
      await keyboard.releaseKey(Key.PageDown)
      return true
    } catch (err) {
      console.warn('[autoscroll] keyboard PageDown failed:', (err as Error).message)
      return false
    }
  }

  for (let i = 0; i < MAX_FRAMES; i++) {
    let frame: Buffer
    try {
      frame = await captureWindowFrame(snapshot)
    } catch (err) {
      console.warn(`[autoscroll] capture failed at i=${i}:`, (err as Error).message)
      reason = 'aborted'
      break
    }

    // Pixel-diff against the previous frame is our SINGLE termination signal.
    // It supersedes the old bottom-strip equality check, which produced false
    // positives in apps like VS Code that have a fixed status bar at the
    // bottom of the editor window — the strip looked identical even when
    // content was scrolling.
    //
    // Two outcomes when diff drops below MIN_DIFF_PERCENT:
    //  - First iteration (frames.length===1): scroll didn't move pixels at
    //    all. The target app likely doesn't respond to WM_MOUSEWHEEL
    //    (Chromium-based chat panels). Surface as 'scroll-ineffective' so
    //    the caller can give the user a clear message.
    //  - Later iterations: we've reached the bottom of the scrollback.
    if (frames.length > 0) {
      const diff = await pixelDiffPercent(frames[frames.length - 1], frame)
      console.log(
        `[autoscroll] i=${i} pixel diff vs prev: ${diff.toFixed(2)}% (method=${scrollMethod})`
      )
      if (diff < MIN_DIFF_PERCENT) {
        if (frames.length === 1 && !switchedToKeyboard) {
          // First-ever scroll didn't move pixels. The target is likely a
          // Chromium-based app that ignores WM_MOUSEWHEEL. Switch to keyboard
          // and re-try this iteration. We push the current frame as the
          // baseline so the next pixel-diff is compared against it.
          console.log(
            '[autoscroll] win32 scroll produced 0% diff — switching to keyboard PageDown fallback'
          )
          scrollMethod = 'keyboard'
          switchedToKeyboard = true
          // Don't push duplicate frame; just retry the scroll-and-capture.
          if (!(await scrollOnePage())) {
            reason = 'aborted'
            break
          }
          await sleep(SETTLE_AFTER_SCROLL_DOWN_MS)
          continue
        }
        if (frames.length === 1) {
          reason = 'scroll-ineffective'
        } else {
          reason = 'bottom-detected'
        }
        break
      }
    }

    frames.push(frame)

    if (!(await scrollOnePage())) {
      console.warn(`[autoscroll] scroll-down failed (method=${scrollMethod})`)
      reason = 'aborted'
      break
    }
    await sleep(SETTLE_AFTER_SCROLL_DOWN_MS)
  }

  if (frames.length === 1 && reason === 'max-frames') reason = 'single-frame'

  console.log(`[autoscroll] done: ${frames.length} frames, reason=${reason}`)
  return {
    frames,
    reachedBottom: reason === 'bottom-detected' || reason === 'single-frame',
    reason
  }
}
