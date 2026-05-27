// File-based logger that writes to %APPDATA%\screenshpeak\logs\app.log,
// rotating when the file hits 5 MB. Used as a tee on top of `console.log`
// so that production users (whose terminal we'll never see) leave a
// breadcrumb trail when something breaks.
//
// Why not winston/pino/etc?
//   - This is the entire surface we need: append a timestamped line, rotate
//     on size, swallow disk errors. ~80 LOC of standard fs is simpler than
//     pulling a dep with its own bundling concerns.
//   - It runs in the main process only — renderers don't write logs.
//
// Threading model:
//   Synchronous writes via appendFileSync. Logger calls happen at human-
//   noticeable events (hotkey press, capture start, AI call) — order of a
//   few per second tops. The blocking cost is ~1 ms per line on SSD; not
//   worth the complexity of an async queue.
//
// Privacy:
//   Logs are local-only and contain only main-process diagnostic data. No
//   audio, no screenshots, no user-entered text. The OpenAI API key is
//   NEVER logged (the openai service is careful to log only the test call's
//   `valid` boolean).

import { app } from 'electron'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { join } from 'node:path'
import { rotateIfNeeded, formatLogLine, type LogLevel } from './logger-helpers'

export type { LogLevel } from './logger-helpers'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

let initialized = false
let logFilePath: string | null = null
let rotatedFilePath: string | null = null
let installedConsoleHooks = false

/**
 * Initializes the logger and installs uncaughtException + unhandledRejection
 * hooks. Idempotent — safe to call more than once.
 */
export function initLogger(): void {
  if (initialized) return
  initialized = true

  try {
    const userData = app.getPath('userData')
    const logDir = join(userData, 'logs')
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
    logFilePath = join(logDir, 'app.log')
    rotatedFilePath = join(logDir, 'app.1.log')
    log('info', `[logger] initialized — logs at ${logFilePath}`)
  } catch (err) {
    // If we can't even create the log directory there's nothing useful we
    // can do — keep going so the app still launches.
    console.warn('[logger] init failed:', (err as Error).message)
    return
  }

  if (!installedConsoleHooks) {
    installedConsoleHooks = true
    process.on('uncaughtException', (err) => {
      log('error', `[uncaughtException] ${err.stack ?? err.message}`)
    })
    process.on('unhandledRejection', (reason) => {
      log(
        'error',
        `[unhandledRejection] ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`
      )
    })
  }
}

/**
 * Append a line to the log file. Rotates on size. Errors are swallowed —
 * a broken disk shouldn't stop the app.
 */
export function log(level: LogLevel, message: string): void {
  if (!logFilePath) return
  const line = formatLogLine(new Date(), level, message)
  try {
    if (rotateIfNeeded(getCurrentSize(logFilePath), MAX_BYTES)) {
      // Move the current log to .1, deleting any prior .1
      try {
        if (rotatedFilePath && existsSync(rotatedFilePath)) {
          unlinkSync(rotatedFilePath)
        }
        if (rotatedFilePath) renameSync(logFilePath, rotatedFilePath)
      } catch {
        // If the rotation rename fails (file locked, etc.) keep appending —
        // the file will grow but data won't be lost.
      }
    }
    appendFileSync(logFilePath, line)
  } catch {
    // Disk full / permission denied / etc. — give up silently.
  }
}

/** Convenience: error-level log. */
export function logError(message: string, err?: unknown): void {
  if (err instanceof Error) {
    log('error', `${message}: ${err.stack ?? err.message}`)
  } else if (err !== undefined) {
    log('error', `${message}: ${String(err)}`)
  } else {
    log('error', message)
  }
}

function getCurrentSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0 // file doesn't exist yet
  }
}
