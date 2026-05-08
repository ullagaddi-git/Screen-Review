// Memory diagnostics for performance monitoring (TASK-043).
//
// The spec target is <150MB RSS at idle (30s after launch, no activity).
// Our memory budget breaks down roughly:
//
//   Main process + tray:          ~80–100 MB  (Electron runtime overhead)
//   Mic indicator (pre-warmed):   ~20–30  MB  (1×1 hidden BrowserWindow)
//   Settings (when open):         ~30–40  MB  (destroyed on close)
//   Result panel (when open):     ~30–40  MB  (destroyed on dismiss)
//   Mode picker (when open):      ~25–35  MB  (destroyed on select/cancel)
//   Region overlay (when open):   ~25–35  MB  (destroyed on capture)
//   Recorder (when active):       ~30–45  MB  (lazy; destroyed after idle)
//   Whisper model:                ~0           (model lives in spawned child only)
//   Ollama:                       ~0           (separate external server)
//
// At true idle (no UI windows visible, no recording), we should be at the
// 100–130 MB range. The functions below let us measure to verify.

import { app, BrowserWindow } from 'electron'
import { summarizeMemory, type MemorySummary } from './memory-helpers'

export type { MemorySummary } from './memory-helpers'

/**
 * Sums memory across the main process and every live BrowserWindow.
 * Returns RSS-like figures in MB so we can compare directly against the
 * 150 MB target. Best-effort — if a particular API is unavailable on a
 * given Electron version, we just skip that contribution.
 */
export async function getMemorySummary(): Promise<MemorySummary> {
  // Main process — synchronous on all supported Electron versions.
  let mainRssBytes = 0
  try {
    const info = process.memoryUsage()
    mainRssBytes = info.rss
  } catch {
    // Fall back to 0 — better to under-report than crash.
  }

  // Per-renderer — query each BrowserWindow's webContents.getProcessId() and
  // sum via app.getAppMetrics(). This walks every Chromium process the
  // app spawned (one per BrowserWindow + GPU + utility helpers).
  const metrics = app.getAppMetrics()
  const windows = BrowserWindow.getAllWindows()
  const liveWindowPids = new Set(
    windows.filter((w) => !w.isDestroyed()).map((w) => w.webContents.getOSProcessId())
  )

  return summarizeMemory({
    mainRssBytes,
    metrics: metrics.map((m) => ({
      pid: m.pid,
      type: m.type,
      memoryWorkingSetSizeKB: m.memory?.workingSetSize ?? 0,
      isLiveWindow: liveWindowPids.has(m.pid)
    }))
  })
}
