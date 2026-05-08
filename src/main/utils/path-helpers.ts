// Pure path-building helpers. No `electron` import so this module is
// trivially unit-testable from plain Node.
import { join } from 'node:path'

/** Builds the absolute path to a built preload file from a stable app root. */
export function buildPreloadPath(appRoot: string, name: string): string {
  const ext = name.endsWith('.js') ? '' : '.js'
  return join(appRoot, 'out', 'preload', name + ext)
}

/** Builds the absolute path to a built renderer file from a stable app root. */
export function buildRendererPath(appRoot: string, relativePath: string): string {
  return join(appRoot, 'out', 'renderer', relativePath)
}
