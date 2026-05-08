// Pure URL-allowlist helper for the navigation guard. Lives in its own
// file (separate from security.ts) so the test runner can import it
// without pulling in electron.

// Schemes that get an opaque (null) origin in the URL spec — `file:`,
// `javascript:`, `data:`, `blob:` etc. all share `origin === null`, so a
// naive same-origin compare ("both null → match") would let `javascript:`
// piggyback on a file:// page. We deny these explicitly before the origin
// check to close that hole.
const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|chrome|chrome-extension):/i

/**
 * Returns true if the URL is one we trust the renderer to navigate to.
 * Allowed:
 *   - about:blank (Electron internal)
 *   - file:// (packaged renderer pages)
 *   - http(s)://localhost (any port — Vite dev server)
 *   - ws://localhost (Vite HMR)
 *   - same-origin http(s) navigations
 *
 * Everything else is rejected — especially `javascript:`, `data:`, and
 * cross-origin web URLs.
 */
export function isAllowedRendererUrl(currentUrl: string, targetUrl: string): boolean {
  // Reject dangerous schemes outright before any origin compare.
  if (DANGEROUS_SCHEMES.test(targetUrl)) return false

  if (targetUrl === 'about:blank') return true

  // file:// — packaged renderer pages live here
  if (targetUrl.startsWith('file://')) return true

  // Dev: Vite's HMR endpoint. Tolerate any localhost port in case it changes.
  if (/^https?:\/\/localhost(:\d+)?(\/|$)/.test(targetUrl)) return true
  if (/^ws:\/\/localhost(:\d+)?(\/|$)/.test(targetUrl)) return true

  // Same-origin navigations on whatever the page already loaded — keeps
  // future multi-page renderer flows from triggering the block. Skip the
  // compare entirely if either side has an opaque origin (file://, etc.) —
  // we already accepted file:// above; everything else is suspect.
  try {
    const cur = new URL(currentUrl)
    const tgt = new URL(targetUrl)
    if (cur.origin === 'null' || tgt.origin === 'null') return false
    if (cur.origin === tgt.origin) return true
  } catch {
    // Malformed URL — treat as untrusted.
  }
  return false
}
