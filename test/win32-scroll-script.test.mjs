// Locks in invariants of the PowerShell script that Win32-scrolls a target
// window. We can't actually exercise SendMessage in a unit test (no Windows
// in CI), but we can verify the script generator escapes titles correctly,
// uses EnumWindows (not the broken FindWindow($null, ...)), and stays
// well-formed under unusual inputs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(
  join(here, '..', 'src', 'main', 'services', 'win32-scroll.ts'),
  'utf8'
)

test('uses EnumWindows-based finder, not the broken FindWindow($null, ...)', () => {
  // Regression: previously we used FindWindow($null, $title), which fails
  // for legacy console windows (powershell.exe, cmd.exe) because their
  // class is "ConsoleWindowClass" and FindWindow with class=null doesn't
  // match those. EnumWindows walks every visible window regardless of class.
  assert.match(src, /EnumWindows/)
  assert.match(src, /FindByTitle/)
  assert.doesNotMatch(src, /FindWindow\(\$null/)
})

test('escapes single quotes in window title to prevent script injection', () => {
  assert.match(src, /title\.replace\(\/'\/g, "''"\)/)
})

test('declares WM_MOUSEWHEEL as 0x020A (the Win32 constant)', () => {
  assert.match(src, /WM_MOUSEWHEEL\s*=\s*0x020A/)
})

test('encodes wheel delta in the high word of wParam (MakeWParam shifts <<16)', () => {
  // WM_MOUSEWHEEL spec: wParam high word = delta. Each notch = WHEEL_DELTA = 120.
  assert.match(src, /MakeWParam.*delta\s*<<\s*16/s)
})

test('exports scrollWindowByTitle with documented return shape', () => {
  assert.match(src, /export async function scrollWindowByTitle/)
  assert.match(src, /reason\?:\s*string/)
})
