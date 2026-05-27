// Unit tests for the path-resolution helpers.
//
// Why these matter: a chunked main-process module had a __dirname-based
// preload path that silently resolved to a non-existent file (out/main/chunks/
// instead of out/main/). The renderer's `window.regionBridge` was therefore
// undefined and every region IPC call disappeared. These tests lock in the
// invariant that paths derive from a stable app-root, never `__dirname`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, sep } from 'node:path'
import {
  buildPreloadPath,
  buildRendererPath
} from '../src/main/utils/path-helpers.ts'

test('buildPreloadPath: appends out/preload/<name>.js to app root', () => {
  const out = buildPreloadPath('/app/root', 'region')
  assert.equal(out, join('/app/root', 'out', 'preload', 'region.js'))
})

test('buildPreloadPath: does not double-append .js if name ends with .js', () => {
  const out = buildPreloadPath('/app/root', 'region.js')
  assert.equal(out, join('/app/root', 'out', 'preload', 'region.js'))
})

test('buildPreloadPath: works with all preload names we ship', () => {
  for (const name of [
    'index',
    'recorder',
    'indicator',
    'picker',
    'region',
    'result',
    'transcript'
  ]) {
    const out = buildPreloadPath('/x', name)
    assert.equal(out, join('/x', 'out', 'preload', `${name}.js`))
  }
})

test('buildRendererPath: appends out/renderer/<path> to app root', () => {
  const out = buildRendererPath('/app/root', 'windows/picker/region-overlay.html')
  assert.equal(out, join('/app/root', 'out', 'renderer', 'windows', 'picker', 'region-overlay.html'))
})

test('paths are absolute and contain no parent-directory traversals', () => {
  // Regression: the broken version produced paths with `..` in the middle,
  // which were valid syntactically but pointed nowhere on disk.
  const p = buildPreloadPath('/app/root', 'region')
  assert.ok(!p.split(sep).includes('..'), `path should not contain '..' segment: ${p}`)
})
