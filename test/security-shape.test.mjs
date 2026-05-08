// Lock-in test: the security module must export `applyAppSecurity` and
// `hardenWindow` — the two entry points called from main bootstrap.
// Without these, the global protections (CSP header, will-navigate block,
// window-open deny, devtools-opened guard) silently disappear.
//
// We can't import security.ts directly (it imports `electron`, which
// blows up under plain Node). Instead we read the file as text and assert
// the export signatures are present. Cheap but meaningful — catches the
// most likely failure mode (someone deletes an export without realizing).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SECURITY_FILE = join(__dirname, '..', 'src', 'main', 'services', 'security.ts')
const text = readFileSync(SECURITY_FILE, 'utf8')

test('security.ts exports applyAppSecurity', () => {
  assert.match(text, /export function applyAppSecurity\b/)
})

test('security.ts exports hardenWindow', () => {
  assert.match(text, /export function hardenWindow\b/)
})

test('security.ts installs a CSP header (defense-in-depth vs HTML meta)', () => {
  assert.match(text, /onHeadersReceived/)
  assert.match(text, /Content-Security-Policy/i)
})

test('security.ts denies window.open via setWindowOpenHandler', () => {
  assert.match(text, /setWindowOpenHandler/)
  assert.match(text, /action:\s*['"]deny['"]/)
})

test('security.ts blocks unsanctioned navigation via will-navigate', () => {
  assert.match(text, /will-navigate/)
  assert.match(text, /preventDefault/)
})

test('security.ts handles devtools-opened in packaged builds', () => {
  assert.match(text, /devtools-opened/)
  assert.match(text, /app\.isPackaged/)
})
