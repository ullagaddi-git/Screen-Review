// Pure runtime input validators for IPC handlers. Extracted as standalone
// helpers so they can be unit-tested without spinning up Electron.
//
// Why bother validating? With contextIsolation+sandbox enabled the renderer
// can't *directly* exploit the main process, but a renderer XSS that gains
// access to the contextBridge could send malformed payloads through legit
// IPC channels. These validators are the last-line check before payloads
// hit native APIs (sharp, fs, clipboard, shell.openExternal).

import type { CaptureMode } from './capture'

const VALID_MODES = new Set(['region', 'window', 'desktop', 'autoscroll'])

/**
 * Type guard for the 4 valid capture modes.
 * Used by `capture:execute` and `capture:mode-selected`.
 */
export function isValidCaptureMode(value: unknown): value is CaptureMode {
  return typeof value === 'string' && VALID_MODES.has(value)
}

export interface RegionRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Validates a region rectangle from the renderer. All four fields must
 * be finite, non-negative numbers; width and height must be at least 1px
 * (an empty crop would crash sharp downstream). Used by `region:complete`.
 *
 * Returns the validated rect (with all values rounded to integers and
 * negatives clamped to 0), or null if the input is malformed.
 */
export function validateRegionRect(value: unknown): RegionRect | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  const { x, y, w, h } = obj
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof w !== 'number' ||
    typeof h !== 'number'
  ) {
    return null
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null
  }
  if (w < 1 || h < 1) return null
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    w: Math.round(w),
    h: Math.round(h)
  }
}

/**
 * Validates an http(s) URL string. Mirrors the pattern used in
 * `app:open-external` and `result-panel:open-external`. Used to prevent
 * arbitrary protocol launches (file://, javascript://, etc.).
 */
export function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

/**
 * Validates that a value is a non-empty string. Used by handlers that
 * accept user-entered text (clipboard text, error messages, etc.).
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
