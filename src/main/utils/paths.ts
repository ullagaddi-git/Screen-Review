import { app } from 'electron'
import { existsSync } from 'node:fs'
import { buildPreloadPath, buildRendererPath } from './path-helpers'

export { buildPreloadPath, buildRendererPath } from './path-helpers'

/**
 * Resolves the absolute path to a built preload script.
 *
 * This intentionally does NOT use `__dirname`. Why: when a main-process module
 * is loaded via dynamic `await import(...)`, esbuild emits it as a separate
 * chunk under `out/main/chunks/`, so `__dirname` resolves to that subfolder
 * instead of `out/main/`. A `__dirname`-relative preload path silently breaks
 * (the preload file can't be found, the renderer's `window.<bridge>` becomes
 * undefined, and IPC calls vanish into the void).
 *
 * `app.getAppPath()` returns a stable root regardless of caller location:
 *   - Dev: the project directory containing package.json
 *   - Packaged: the asar archive root
 */
export function resolvePreloadPath(name: string): string {
  return buildPreloadPath(app.getAppPath(), name)
}

/**
 * Resolves the absolute path to a built renderer HTML entry, used by
 * `loadFile` in production. In dev, the renderer is served via Vite at
 * `process.env.ELECTRON_RENDERER_URL` instead.
 */
export function resolveRendererPath(relativePath: string): string {
  return buildRendererPath(app.getAppPath(), relativePath)
}

/**
 * Asserts a file exists at the given path. Used by the startup self-check
 * to fail fast (and visibly) when build outputs are missing or paths drift.
 */
export function assertExists(path: string, label: string): boolean {
  if (existsSync(path)) {
    console.log(`[selfcheck] OK: ${label} → ${path}`)
    return true
  }
  console.error(`[selfcheck] MISSING: ${label} → ${path}`)
  return false
}
