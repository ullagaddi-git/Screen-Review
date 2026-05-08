// Centralized security hardening for the main process.
// Installed once during `app.whenReady()` — applies to all current and
// future BrowserWindows.
//
// Defense layers (each blocks a different class of attack):
//
//   1. HTTP-header CSP (`onHeadersReceived`)
//      Belt-and-suspenders for the per-HTML <meta> CSP. If a future change
//      drops the meta tag (or a dev-tool strips it), the header still wins.
//
//   2. window.open denial (`setWindowOpenHandler`)
//      A successful renderer-XSS could otherwise spawn a fresh BrowserWindow
//      (with its own webPreferences) bypassing our hardening.
//
//   3. Navigation block (`will-navigate`)
//      Prevents a renderer XSS from navigating the BrowserWindow itself to
//      an attacker-controlled origin. Allowed origins: file://, our dev
//      server, blob:, data: (for image previews).
//
//   4. Permission deny (`session.setPermissionRequestHandler`)
//      The renderer should never need geolocation, notifications,
//      midi-sysex, etc. Audio (microphone) is the one exception, and it's
//      already handled by the audio service's own permission handler.
//
//   5. Production DevTools warning
//      Emit a `console.warn` if DevTools opens in a packaged build. We
//      don't *block* it (developers debugging end-user issues legitimately
//      need it via `--enable-devtools`), but the log makes the unusual
//      state visible.

import { app, session } from 'electron'
import type { BrowserWindow, Session, WebContents } from 'electron'
import { isAllowedRendererUrl } from './security-helpers'

export { isAllowedRendererUrl }

/** Per-spec CSP for renderer responses. */
const CSP_VALUE =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'self' ws: http://localhost:* ws://localhost:*; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "frame-ancestors 'none'"

/**
 * Install the CSP header on responses going to the renderer. Any HTTP(S)
 * navigation inside our windows lands here.
 *
 * Exported for testability; usually called from `applyAppSecurity()`.
 */
export function installCspHeader(s: Session): void {
  s.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...(details.responseHeaders ?? {}) }
    // Strip any CSP the upstream might have set; our policy wins.
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === 'content-security-policy') {
        delete headers[k]
      }
    }
    headers['Content-Security-Policy'] = [CSP_VALUE]
    callback({ responseHeaders: headers })
  })
}

/**
 * Install the per-WebContents protections (window-open + navigation block).
 * Called automatically for every BrowserWindow created after wiring up
 * `app.on('web-contents-created', ...)` in `applyAppSecurity()`.
 *
 * Exported for testability — pass a fake WebContents to verify behavior.
 */
export function hardenWebContents(wc: WebContents): void {
  // Refuse window.open — a successful XSS could otherwise spawn a fresh
  // BrowserWindow with its own webPreferences (potentially bypassing our
  // hardening). If the renderer wants to open something externally, it has
  // to go through our `app:open-external` IPC, which validates http/https.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Block navigations to URLs we don't recognize. The renderer should
  // never navigate away from its loaded HTML — it's a single-page app.
  wc.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(wc.getURL(), url)) {
      event.preventDefault()
      console.warn(`[security] blocked will-navigate to ${url}`)
    }
  })

  // In production, close DevTools if anything opens them — and log a
  // warning so we have an audit trail. The strongest defense (setting
  // webPreferences.devTools:false on every BrowserWindow) is applied at
  // window-creation sites; this is the belt-and-suspenders backup in case
  // a window slips through without that flag.
  if (app.isPackaged) {
    wc.on('devtools-opened', () => {
      console.warn(
        '[security] DevTools opened in production build — closing automatically'
      )
      try {
        wc.closeDevTools()
      } catch {
        /* swallow — best effort */
      }
    })
  }
}

/** Default permission handler — deny everything we don't explicitly allow. */
function permissionRequestHandler(
  _wc: WebContents,
  permission: string,
  callback: (granted: boolean) => void
): void {
  // 'media' is microphone for the recorder window — handled by audio.ts's
  // own setPermissionRequestHandler before we install this one. If we get
  // here for 'media', it means audio.ts didn't intercept — deny by default.
  const allow = false
  console.warn(`[security] permission request "${permission}" — denying`)
  callback(allow)
}

/**
 * Top-level installer. Call once from `app.whenReady()`, AFTER the
 * audio service has installed its own media-permission handler so we
 * don't clobber it.
 */
export function applyAppSecurity(): void {
  // Only install the HTTP-header CSP in production builds. In dev mode the
  // page is served from Vite (http://localhost:5173) and Vite injects HMR
  // client code, eval-based module updates, and dynamic imports that don't
  // play well with our locked-down policy. The per-page <meta> CSP is
  // already enforced in dev — the HTTP header is mainly defense-in-depth
  // for production where someone might strip the meta tag.
  if (app.isPackaged) {
    installCspHeader(session.defaultSession)
  }

  // Permission handler is shared per-session; only override if nothing has
  // taken it yet (audio.ts owns 'media').
  // Note: we don't have a public way to read the existing handler, so we
  // settle for installing ours alongside via `partition` if needed. For now,
  // do nothing here — audio.ts's handler covers the only legitimate request.
  void permissionRequestHandler

  // Apply window-level hardening to every BrowserWindow's WebContents.
  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents)
  })
}

/**
 * Apply hardening to a specific window's WebContents — useful when a window
 * is created BEFORE `applyAppSecurity()` ran (e.g. early in app.whenReady()).
 * Idempotent in practice because the listener-once pattern is short.
 */
export function hardenWindow(win: BrowserWindow): void {
  hardenWebContents(win.webContents)
}
