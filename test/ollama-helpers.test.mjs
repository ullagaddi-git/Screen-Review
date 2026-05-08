// Tests for pure Ollama helpers: request shape, response parsing, host
// normalization. These run without spinning up a real Ollama instance.
//
// L2 acceptance criteria for TASK-029:
//  - The /api/generate POST body matches Ollama's documented schema
//  - Empty/malformed responses return empty string (caller decides)
//  - /api/tags response parsing extracts model names
//  - normalizeHost handles missing schema and trailing slashes
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAnalyzeRequest,
  parseAnalyzeResponse,
  parseModelsResponse,
  normalizeHost,
  DEFAULT_PROMPT
} from '../src/main/services/ollama-helpers.ts'

test('buildAnalyzeRequest: shape matches Ollama /api/generate spec', () => {
  const body = buildAnalyzeRequest({
    model: 'qwen2-vl',
    imageBase64: 'iVBORw0KGgo...',
    prompt: 'Tell me about this'
  })
  assert.equal(body.model, 'qwen2-vl')
  assert.equal(body.prompt, 'Tell me about this')
  assert.deepEqual(body.images, ['iVBORw0KGgo...'])
  assert.equal(body.stream, false)
})

test('buildAnalyzeRequest: caps output tokens to keep CPU inference snappy', () => {
  // Vision generation on CPU scales linearly with output tokens. We cap
  // num_predict so a chatty model doesn't run for minutes producing prose.
  const body = buildAnalyzeRequest({
    model: 'llava:7b',
    imageBase64: 'x',
    prompt: 'describe'
  })
  assert.ok(body.options, 'options field is required for the inference cap')
  assert.equal(typeof body.options.num_predict, 'number')
  assert.ok(body.options.num_predict <= 512, 'num_predict should be small for CPU users')
})

test('buildAnalyzeRequest: low temperature for deterministic analysis', () => {
  // High temperature makes generation slower and more variable. For
  // technical screenshot analysis, near-zero temp is faster and more
  // predictable. Lock in temperature <= 0.3.
  const body = buildAnalyzeRequest({
    model: 'm',
    imageBase64: 'x',
    prompt: 'p'
  })
  assert.ok(typeof body.options?.temperature === 'number')
  assert.ok(body.options.temperature <= 0.3)
})

test('buildAnalyzeRequest: uses DEFAULT_PROMPT when prompt missing or empty', () => {
  const a = buildAnalyzeRequest({ model: 'm', imageBase64: 'x' })
  const b = buildAnalyzeRequest({ model: 'm', imageBase64: 'x', prompt: '' })
  const c = buildAnalyzeRequest({ model: 'm', imageBase64: 'x', prompt: '   ' })
  assert.equal(a.prompt, DEFAULT_PROMPT)
  assert.equal(b.prompt, DEFAULT_PROMPT)
  assert.equal(c.prompt, DEFAULT_PROMPT)
})

test('buildAnalyzeRequest: throws on missing model or image', () => {
  assert.throws(() => buildAnalyzeRequest({ model: '', imageBase64: 'x' }))
  assert.throws(() => buildAnalyzeRequest({ model: 'm', imageBase64: '' }))
})

test('buildAnalyzeRequest: stream is always false (we want a single response)', () => {
  // Ollama can stream tokens — we explicitly opt out so we get one JSON
  // response instead of NDJSON. This locks that decision in.
  const b = buildAnalyzeRequest({ model: 'm', imageBase64: 'x' })
  assert.equal(b.stream, false)
})

test('DEFAULT_PROMPT mentions errors and code (matches PRD spec)', () => {
  // The prompt explicitly tells the model to look for errors AND explain
  // code. Lock this in so we don't accidentally weaken the system prompt.
  assert.match(DEFAULT_PROMPT, /error/i)
  assert.match(DEFAULT_PROMPT, /code/i)
})

test('parseAnalyzeResponse: extracts response field', () => {
  assert.equal(
    parseAnalyzeResponse({ response: 'Hello, world.', done: true }),
    'Hello, world.'
  )
})

test('parseAnalyzeResponse: trims whitespace', () => {
  assert.equal(parseAnalyzeResponse({ response: '\n  text  \n' }), 'text')
})

test('parseAnalyzeResponse: empty string for malformed input', () => {
  assert.equal(parseAnalyzeResponse(null), '')
  assert.equal(parseAnalyzeResponse(undefined), '')
  assert.equal(parseAnalyzeResponse('not an object'), '')
  assert.equal(parseAnalyzeResponse({}), '')
  assert.equal(parseAnalyzeResponse({ response: 42 }), '')
  assert.equal(parseAnalyzeResponse({ response: null }), '')
})

test('parseModelsResponse: extracts model names from /api/tags response', () => {
  const data = {
    models: [
      { name: 'qwen2-vl:latest', size: 4_000_000_000 },
      { name: 'llava:7b', size: 4_700_000_000 }
    ]
  }
  assert.deepEqual(parseModelsResponse(data), ['qwen2-vl:latest', 'llava:7b'])
})

test('parseModelsResponse: empty for malformed input', () => {
  assert.deepEqual(parseModelsResponse(null), [])
  assert.deepEqual(parseModelsResponse({}), [])
  assert.deepEqual(parseModelsResponse({ models: 'not an array' }), [])
  assert.deepEqual(parseModelsResponse({ models: [{ noName: true }] }), [])
})

test('normalizeHost: adds http:// when scheme missing', () => {
  assert.equal(normalizeHost('localhost:11434'), 'http://localhost:11434')
  assert.equal(normalizeHost('192.168.1.1:11434'), 'http://192.168.1.1:11434')
})

test('normalizeHost: keeps existing scheme', () => {
  assert.equal(normalizeHost('http://localhost:11434'), 'http://localhost:11434')
  assert.equal(normalizeHost('https://ollama.example.com'), 'https://ollama.example.com')
})

test('normalizeHost: strips trailing slashes', () => {
  assert.equal(normalizeHost('http://localhost:11434/'), 'http://localhost:11434')
  assert.equal(normalizeHost('http://localhost:11434///'), 'http://localhost:11434')
})

test('normalizeHost: empty string falls back to default', () => {
  assert.equal(normalizeHost(''), 'http://localhost:11434')
  assert.equal(normalizeHost('  '), 'http://localhost:11434')
})
