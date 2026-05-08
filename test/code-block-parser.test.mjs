// Tests for the result-panel's code-block parser. AI responses regularly
// contain ```fenced code``` and we want to render those in monospace
// inside a styled <pre> while plain text stays in the body font.
//
// L2 acceptance criteria for TASK-033 (rendering):
//  - Plain text passes through with no fences → single text segment
//  - One code block → text + code + text (3 segments, possibly empty bookends)
//  - Language tag on first line of code block is stripped (so user doesn't
//    see literal "python" text above their code)
//  - Defensive against non-string input
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCodeBlocks } from '../src/renderer/windows/result/code-block-parser.ts'

test('parseCodeBlocks: plain text → single text segment', () => {
  const out = parseCodeBlocks('Hello, world.')
  assert.equal(out.length, 1)
  assert.deepEqual(out[0], { kind: 'text', content: 'Hello, world.' })
})

test('parseCodeBlocks: one code block produces text-code-text triple', () => {
  const out = parseCodeBlocks('Before\n```\ncode here\n```\nAfter')
  assert.equal(out.length, 3)
  assert.equal(out[0].kind, 'text')
  assert.equal(out[1].kind, 'code')
  assert.match(out[1].content, /code here/)
  assert.equal(out[2].kind, 'text')
  assert.match(out[2].content, /After/)
})

test('parseCodeBlocks: strips language tag on first line of code block', () => {
  const out = parseCodeBlocks('Try this:\n```python\nx = 5\nprint(x)\n```\nDone.')
  const codeSeg = out.find((s) => s.kind === 'code')
  assert.ok(codeSeg)
  // The "python" tag should NOT appear in the rendered code content
  assert.doesNotMatch(codeSeg.content, /^python/)
  assert.match(codeSeg.content, /x = 5/)
})

test('parseCodeBlocks: keeps content if first line has spaces (not a language tag)', () => {
  const out = parseCodeBlocks('```\nthis is just code\nnot a tag\n```')
  const codeSeg = out.find((s) => s.kind === 'code')
  assert.ok(codeSeg)
  // The first line has spaces, so it's not a language tag — keep it intact
  assert.match(codeSeg.content, /this is just code/)
})

test('parseCodeBlocks: handles multiple code blocks', () => {
  const text = 'a\n```js\nx=1\n```\nb\n```py\ny=2\n```\nc'
  const out = parseCodeBlocks(text)
  assert.equal(out.length, 5) // text, code, text, code, text
  assert.equal(out[0].kind, 'text')
  assert.equal(out[1].kind, 'code')
  assert.equal(out[2].kind, 'text')
  assert.equal(out[3].kind, 'code')
  assert.equal(out[4].kind, 'text')
})

test('parseCodeBlocks: defensive against non-string input', () => {
  assert.deepEqual(parseCodeBlocks(undefined), [])
  assert.deepEqual(parseCodeBlocks(null), [])
  assert.deepEqual(parseCodeBlocks(42), [])
})

test('parseCodeBlocks: empty string → single empty text segment', () => {
  const out = parseCodeBlocks('')
  assert.equal(out.length, 1)
  assert.equal(out[0].content, '')
})

test('parseCodeBlocks: language tag with hyphens/underscores accepted', () => {
  // e.g. ```c++``` or ```my_lang``` — our regex `/^[a-zA-Z0-9_+-]*$/`
  // intentionally accepts these.
  const out = parseCodeBlocks('```c++\nprintf("hi");\n```')
  const codeSeg = out.find((s) => s.kind === 'code')
  assert.ok(codeSeg)
  assert.doesNotMatch(codeSeg.content, /^c\+\+/)
  assert.match(codeSeg.content, /printf/)
})
