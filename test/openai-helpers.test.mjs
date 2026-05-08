// Tests for pure OpenAI helpers: request shape, response parsing, error
// classification. These run without an API key or network access.
//
// L2 acceptance criteria for TASK-030:
//  - Vision request body matches PRD's API spec (data:image/png;base64 URL,
//    text+image_url content array, max_tokens cap)
//  - Response parsing is defensive against malformed shapes
//  - Errors classified into known kinds the UI can switch on
//  - Plausible-key check works for the standard sk- prefix
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAnalyzeMessages,
  parseAnalyzeResponse,
  classifyOpenAIError,
  isPlausibleApiKey
} from '../src/main/services/openai-helpers.ts'

test('buildAnalyzeMessages: produces single user message with text + image parts', () => {
  const messages = buildAnalyzeMessages('What do you see?', 'iVBORw0KGgo...')
  assert.equal(messages.length, 1)
  const m = messages[0]
  assert.equal(m.role, 'user')
  assert.equal(m.content.length, 2)
  assert.equal(m.content[0].type, 'text')
  assert.equal(m.content[0].text, 'What do you see?')
  assert.equal(m.content[1].type, 'image_url')
})

test('buildAnalyzeMessages: image_url is a data URL with image/png MIME (matches PRD)', () => {
  const messages = buildAnalyzeMessages('hi', 'BASE64_BYTES')
  const imagePart = messages[0].content[1]
  assert.equal(imagePart.type, 'image_url')
  // PRD spec: data:image/png;base64,{base64}
  assert.match(imagePart.image_url.url, /^data:image\/png;base64,/)
  assert.match(imagePart.image_url.url, /BASE64_BYTES$/)
})

test('buildAnalyzeMessages: trims surrounding whitespace from prompt', () => {
  const messages = buildAnalyzeMessages('  hello  ', 'x')
  assert.equal(messages[0].content[0].text, 'hello')
})

test('buildAnalyzeMessages: throws on missing prompt or image', () => {
  assert.throws(() => buildAnalyzeMessages('', 'x'))
  assert.throws(() => buildAnalyzeMessages('  ', 'x'))
  assert.throws(() => buildAnalyzeMessages('hello', ''))
})

test('parseAnalyzeResponse: extracts text from choices[0].message.content', () => {
  const response = {
    choices: [
      { message: { content: 'The image shows a terminal with a Python error.' } }
    ]
  }
  assert.equal(
    parseAnalyzeResponse(response),
    'The image shows a terminal with a Python error.'
  )
})

test('parseAnalyzeResponse: trims whitespace', () => {
  const response = { choices: [{ message: { content: '\n\n  hello  \n' } }] }
  assert.equal(parseAnalyzeResponse(response), 'hello')
})

test('parseAnalyzeResponse: empty for malformed response shapes', () => {
  assert.equal(parseAnalyzeResponse(null), '')
  assert.equal(parseAnalyzeResponse({}), '')
  assert.equal(parseAnalyzeResponse({ choices: [] }), '')
  assert.equal(parseAnalyzeResponse({ choices: [{}] }), '')
  assert.equal(parseAnalyzeResponse({ choices: [{ message: {} }] }), '')
  assert.equal(parseAnalyzeResponse({ choices: [{ message: { content: 42 } }] }), '')
  assert.equal(parseAnalyzeResponse({ choices: [{ message: { content: null } }] }), '')
})

test('classifyOpenAIError: 401 → auth', () => {
  const r = classifyOpenAIError({ status: 401, message: 'Unauthorized' })
  assert.equal(r.kind, 'auth')
})

test('classifyOpenAIError: 429 with insufficient_quota → quota', () => {
  const r = classifyOpenAIError({
    status: 429,
    error: { type: 'insufficient_quota', message: 'You exceeded your current quota' }
  })
  assert.equal(r.kind, 'quota')
})

test('classifyOpenAIError: plain 429 → rate-limit', () => {
  const r = classifyOpenAIError({ status: 429, message: 'Rate limit hit' })
  assert.equal(r.kind, 'rate-limit')
})

test('classifyOpenAIError: ETIMEDOUT → timeout', () => {
  const r = classifyOpenAIError({ code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' })
  assert.equal(r.kind, 'timeout')
})

test('classifyOpenAIError: ECONNREFUSED → network', () => {
  const r = classifyOpenAIError({ code: 'ECONNREFUSED', message: 'fetch failed' })
  assert.equal(r.kind, 'network')
})

test('classifyOpenAIError: unknown shape → unknown', () => {
  assert.equal(classifyOpenAIError({}).kind, 'unknown')
  assert.equal(classifyOpenAIError('a string').kind, 'unknown')
  assert.equal(classifyOpenAIError(null).kind, 'unknown')
})

test('isPlausibleApiKey: accepts standard sk- prefix', () => {
  assert.equal(isPlausibleApiKey('sk-1234567890abcdefghij'), true)
  assert.equal(isPlausibleApiKey('sk-proj-aBc_dEf-GhIjKl12345_67890'), true)
})

test('isPlausibleApiKey: rejects empty / short / wrong-prefix strings', () => {
  assert.equal(isPlausibleApiKey(''), false)
  assert.equal(isPlausibleApiKey('sk-short'), false) // too short
  assert.equal(isPlausibleApiKey('not-a-key-at-all-with-length'), false)
  assert.equal(isPlausibleApiKey('Bearer sk-1234567890abc'), false)
})

test('isPlausibleApiKey: rejects non-string input', () => {
  assert.equal(isPlausibleApiKey(undefined), false)
  assert.equal(isPlausibleApiKey(null), false)
  assert.equal(isPlausibleApiKey(12345), false)
})
