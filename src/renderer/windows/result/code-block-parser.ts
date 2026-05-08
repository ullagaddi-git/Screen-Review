// Splits an AI response on triple-backtick fences for the result panel.
// Extracted as a pure function so we can unit-test the rendering logic
// without spinning up Electron.
//
// Even-indexed segments are plain text; odd-indexed are code blocks.
// We strip an optional leading language tag (```python, ```js) from the
// first line of each code block — we don't syntax-highlight, just render
// in monospace, but the language tag would render as literal text otherwise.

export type CodeSegment = { kind: 'text' | 'code'; content: string }

export function parseCodeBlocks(text: string): CodeSegment[] {
  if (typeof text !== 'string') return []
  const parts = text.split('```')
  return parts.map((segment, idx) => {
    if (idx % 2 === 0) return { kind: 'text', content: segment }
    const newlineIdx = segment.indexOf('\n')
    const content =
      newlineIdx > -1 && /^[a-zA-Z0-9_+-]*$/.test(segment.slice(0, newlineIdx))
        ? segment.slice(newlineIdx + 1)
        : segment
    return { kind: 'code', content }
  })
}
