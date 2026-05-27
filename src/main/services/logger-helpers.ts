// Pure helpers for logger.ts. Lives in its own file (no electron / fs
// imports) so the test runner can verify the formatting and rotation
// math without spinning up Electron.

export type LogLevel = 'info' | 'warn' | 'error'

/**
 * Format a single log line. Always ends with a newline. Timestamp is in
 * ISO 8601 (UTC) so log files from different machines can be compared
 * without timezone confusion. Level is uppercased to align grep results.
 */
export function formatLogLine(timestamp: Date, level: LogLevel, message: string): string {
  return `${timestamp.toISOString()} [${level.toUpperCase()}] ${message}\n`
}

/**
 * Returns true if the log file should be rotated before the next write.
 * Rotation happens when the current file is at or above the cap.
 *
 * Pure / synchronous — caller is responsible for actually performing the
 * rename. Defined as a helper so the threshold logic is testable.
 */
export function rotateIfNeeded(currentSizeBytes: number, maxBytes: number): boolean {
  if (maxBytes <= 0) return false // defensive — bad config shouldn't churn rotations
  return currentSizeBytes >= maxBytes
}
