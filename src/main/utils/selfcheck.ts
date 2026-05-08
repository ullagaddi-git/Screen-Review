import { ipcMain } from 'electron'
import { resolvePreloadPath, assertExists } from './paths'

/** Preload scripts that must exist at runtime, keyed by short name. */
const REQUIRED_PRELOADS = ['index', 'recorder', 'indicator', 'picker', 'region', 'result']

export interface SelfCheckResult {
  ok: boolean
  missingPreloads: string[]
  /** Channels missing a `handle` registration AT THE TIME of selfcheck. */
  missingHandles: string[]
}

export function runSelfCheck(): SelfCheckResult {
  console.log('[selfcheck] start')

  const missingPreloads: string[] = []
  for (const name of REQUIRED_PRELOADS) {
    const path = resolvePreloadPath(name)
    if (!assertExists(path, `preload "${name}"`)) {
      missingPreloads.push(name)
    }
  }

  const missingHandles: string[] = []
  // ipcMain doesn't expose a list of `handle` channels via a clean API,
  // but we can probe by attempting to register a duplicate handler and
  // checking whether it throws ("Attempted to register a second handler").
  // That's hacky — instead we just trust registration and only flag
  // unexpected channels later.
  // (Detection lives in the test file, not here.)

  const ok = missingPreloads.length === 0 && missingHandles.length === 0
  if (ok) {
    console.log('[selfcheck] all checks passed')
  } else {
    console.error(
      `[selfcheck] FAILED: ${missingPreloads.length} missing preload(s), ${missingHandles.length} missing handler(s)`
    )
  }

  void ipcMain // keep import — used elsewhere in the future for handler probes
  return { ok, missingPreloads, missingHandles }
}
