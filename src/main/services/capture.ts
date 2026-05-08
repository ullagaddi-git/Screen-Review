import type { WindowSnapshot } from './active-window'

export type CaptureMode = 'region' | 'window' | 'desktop' | 'autoscroll'

export interface CaptureResult {
  mode: CaptureMode
  pngBuffer: Buffer
  width: number
  height: number
  /** True when the capture is the single un-stitched frame because content fit in one viewport. */
  singleFrame?: boolean
  /** Human-readable warning to surface in the result panel (e.g. blank image, partial capture). */
  warning?: string
}

export class CaptureNotImplementedError extends Error {
  constructor(public mode: CaptureMode) {
    super(`Capture mode "${mode}" is not implemented yet`)
    this.name = 'CaptureNotImplementedError'
  }
}

export class WindowSnapshotMissingError extends Error {
  constructor() {
    super('Could not identify the active window to capture.')
    this.name = 'WindowSnapshotMissingError'
  }
}

class CaptureService {
  async captureRegion(): Promise<CaptureResult> {
    const { selectAndCaptureRegion } = await import('../windows/region-overlay')
    const sharp = (await import('sharp')).default
    const buffer = await selectAndCaptureRegion()
    const meta = await sharp(buffer).metadata()
    return {
      mode: 'region',
      pngBuffer: buffer,
      width: meta.width ?? 0,
      height: meta.height ?? 0
    }
  }

  async captureWindow(snapshot?: WindowSnapshot | null): Promise<CaptureResult> {
    if (!snapshot) throw new WindowSnapshotMissingError()

    const { capturePrimaryScreen } = await import('./screen')
    const { getCurrentBounds } = await import('./active-window')
    const sharp = (await import('sharp')).default

    const bounds = (await getCurrentBounds(snapshot)) ?? snapshot.initialBounds
    const cap = await capturePrimaryScreen()

    // nut.js returns DIPs; desktopCapturer returns native pixels. Convert via scaleFactor.
    const sf = cap.scaleFactor
    const left = Math.max(0, Math.round(bounds.x * sf))
    const top = Math.max(0, Math.round(bounds.y * sf))
    const width = Math.max(1, Math.min(cap.width - left, Math.round(bounds.width * sf)))
    const height = Math.max(1, Math.min(cap.height - top, Math.round(bounds.height * sf)))

    if (width < 50 || height < 50) {
      throw new Error(
        `Window bounds too small (${width}×${height}) — likely a stale or invalid window reference. Click in the target window first, then press the capture hotkey.`
      )
    }

    const cropped = await sharp(cap.pngBuffer)
      .extract({ left, top, width, height })
      .png()
      .toBuffer()

    return { mode: 'window', pngBuffer: cropped, width, height }
  }

  async captureDesktop(): Promise<CaptureResult> {
    const { capturePrimaryScreen } = await import('./screen')
    const cap = await capturePrimaryScreen()
    return {
      mode: 'desktop',
      pngBuffer: cap.pngBuffer,
      width: cap.width,
      height: cap.height
    }
  }

  async captureAutoScroll(snapshot?: WindowSnapshot | null): Promise<CaptureResult> {
    if (!snapshot) throw new WindowSnapshotMissingError()

    const { autoScrollCapture } = await import('./autoscroll')
    const { stitchFrames } = await import('./stitch')

    const scrollResult = await autoScrollCapture(snapshot)

    if (scrollResult.frames.length === 0) {
      throw new Error('Auto-scroll captured no frames')
    }

    const stitched = await stitchFrames(scrollResult.frames)

    let warning: string | undefined
    if (scrollResult.reason === 'single-frame') {
      // Content fits in one viewport — no scrolling needed.
      warning = undefined
    } else if (scrollResult.reason === 'scroll-ineffective') {
      warning =
        'Scroll did not move this app — auto-scroll only works for apps with native scrollbars (terminals, browsers, IDE editors). Captured the visible viewport only.'
    } else if (scrollResult.reason === 'aborted') {
      warning = 'Window moved or was minimized — captured visible area only.'
    } else if (stitched.hasGaps) {
      warning = 'Some frames had no detectable overlap — the stitched image may have visible seams.'
    } else if (stitched.resized) {
      warning = 'Captured content exceeded 20,000px height and was scaled down for analysis.'
    }

    return {
      mode: 'autoscroll',
      pngBuffer: stitched.pngBuffer,
      width: stitched.width,
      height: stitched.height,
      singleFrame: scrollResult.reason === 'single-frame',
      warning
    }
  }

  async openModePicker(): Promise<void> {
    const { showModePicker, isPickerOpen, setPickerTargetTitle } = await import(
      '../windows/mode-picker'
    )
    if (isPickerOpen()) return

    // Snapshot the active window BEFORE the picker steals focus —
    // 'window' and 'autoscroll' modes both target this snapshot.
    const { snapshotActiveWindow } = await import('./active-window')
    const activeWindow = await snapshotActiveWindow()
    setPickerTargetTitle(activeWindow?.title ?? null)

    showModePicker((mode) => {
      void this.executeAndAnalyze(mode, activeWindow)
    })
  }

  /** Monotonically incrementing session id used to discard stale AI results. */
  private analysisSessionCounter = 0

  /**
   * Full capture → AI → result panel flow:
   *   1. Run the chosen capture mode (region/window/desktop/autoscroll).
   *   2. Save the PNG to %TEMP%\screenshpeak-captures (debug history;
   *      Phase 6 will replace with a persistent capture store).
   *   3. Open the result panel in `loading` state with the captured thumbnail.
   *   4. Send the image to the AI router (Ollama or OpenAI per config).
   *   5. Update the panel with `success` or `error` data.
   *
   * Stale-result guard: each call increments a session counter. If the user
   * triggers another capture while AI is still running, only the latest
   * session updates the panel — old results are discarded silently.
   */
  async executeAndAnalyze(
    mode: CaptureMode,
    activeWindow?: WindowSnapshot | null
  ): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const { notify } = await import('./notify')
    const { aiService } = await import('./ai')
    const { showResultPanel } = await import('../windows/result-panel')

    const sessionId = ++this.analysisSessionCounter
    const isStale = (): boolean => sessionId !== this.analysisSessionCounter

    console.log(
      `[capture] executeAndAnalyze start (session ${sessionId}): mode=${mode}, activeWindow=${activeWindow?.title ?? 'null'}`
    )

    // Step 1 — capture
    let result: CaptureResult
    try {
      result = await this.executeMode(mode, activeWindow)
      console.log(
        `[capture] executeMode returned: ${result.width}x${result.height}, ${result.pngBuffer.length} bytes`
      )
    } catch (err) {
      const e = err as Error
      if (e.name === 'RegionCanceledError') {
        console.log('[capture] region canceled by user')
        return
      }
      console.error(`[capture] executeMode failed (${mode}):`, e)
      notify('Capture failed', e.message)
      return
    }

    if (isStale()) {
      console.log(`[capture] session ${sessionId} stale after capture — abandoning`)
      return
    }

    const imageBase64 = result.pngBuffer.toString('base64')

    // Step 2 — best-effort temp save (debug aid; non-fatal if it fails)
    try {
      const dir = join(tmpdir(), 'screenshpeak-captures')
      await mkdir(dir, { recursive: true })
      const filename = `${mode}-${Date.now()}.png`
      const fullPath = join(dir, filename)
      await writeFile(fullPath, result.pngBuffer)
      console.log(`[capture] saved: ${fullPath}`)
    } catch (err) {
      console.warn('[capture] temp-save failed (continuing):', (err as Error).message)
    }

    // Step 3 — show the panel in loading state immediately
    showResultPanel({
      kind: 'loading',
      imageBase64,
      label: result.warning ?? 'Analyzing…'
    })

    // Step 4 — AI analysis
    const ai = await aiService.analyze({ imageBase64 })
    console.log(
      `[capture] session ${sessionId} ai result: ok=${ai.ok}, ${ai.ok ? `provider=${ai.provider}` : `errorKind=${ai.errorKind}`}`
    )

    if (isStale()) {
      console.log(
        `[capture] session ${sessionId} stale after AI — discarding result`
      )
      return
    }

    // Step 5 — update the panel with the result
    if (ai.ok) {
      showResultPanel({
        kind: 'success',
        imageBase64,
        text: ai.text,
        provider: ai.provider
      })
    } else {
      showResultPanel({
        kind: 'error',
        imageBase64,
        errorKind: ai.errorKind,
        message: ai.message,
        setupHint: ai.setupHint
      })
    }
  }

  async executeMode(
    mode: CaptureMode,
    activeWindow?: WindowSnapshot | null
  ): Promise<CaptureResult> {
    switch (mode) {
      case 'region':
        return await this.captureRegion()
      case 'window':
        return await this.captureWindow(activeWindow)
      case 'desktop':
        return await this.captureDesktop()
      case 'autoscroll':
        return await this.captureAutoScroll(activeWindow)
      default:
        throw new Error(`Unknown capture mode: ${mode as string}`)
    }
  }
}

export const captureService = new CaptureService()
