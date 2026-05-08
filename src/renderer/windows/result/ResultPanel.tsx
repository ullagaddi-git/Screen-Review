import { useEffect, useState } from 'react'
import { Copy, ExternalLink, Image as ImageIcon, Settings as SettingsIcon, X } from 'lucide-react'
import { Button } from '../../components/ui'
import type { ResultPanelData } from '../../../preload/result'
import { parseCodeBlocks } from './code-block-parser'

/**
 * Renders action CTAs for an error state. The set of buttons depends on the
 * specific errorKind so users get the most direct path to recovery:
 *   - ollama-unavailable: install Ollama OR switch to cloud
 *   - ollama-model-missing: copy the `ollama pull <model>` command
 *   - openai-key-missing: open Settings to add a key
 *   - openai-auth: open Settings to fix the key
 *   - everything else: just the generic setup link if any
 */
function ErrorActions({
  data
}: {
  data: ResultPanelData & { kind: 'error' }
}): JSX.Element | null {
  const [copied, setCopied] = useState(false)

  const openSetupLink = (): void => {
    if (data.setupHint) window.resultBridge?.openExternal(data.setupHint)
  }
  const openSettingsAITab = (): void => {
    void window.resultBridge?.openSettings('AI')
  }
  const copyPullCommand = async (cmd: string): Promise<void> => {
    await window.resultBridge?.copyText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Extract the model name from the error message — the OllamaError carries
  // it like: `Ollama model "qwen2-vl" is not installed.`
  const modelMatch = data.message.match(/"([^"]+)"/)
  const pullCmd = modelMatch ? `ollama pull ${modelMatch[1]}` : 'ollama pull qwen2-vl'

  switch (data.errorKind) {
    case 'ollama-unavailable':
      return (
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="primary" size="sm" onClick={openSetupLink} className="flex items-center gap-1.5">
            <ExternalLink size={12} />
            Install Ollama
          </Button>
          <Button variant="ghost" size="sm" onClick={openSettingsAITab} className="flex items-center gap-1.5">
            <SettingsIcon size={12} />
            Use OpenAI instead
          </Button>
        </div>
      )
    case 'ollama-model-missing':
      return (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-sm px-2 py-1.5">
            <code className="text-xs font-mono text-text-primary flex-1 truncate">
              {pullCmd}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyPullCommand(pullCmd)}
              className="flex items-center gap-1"
            >
              <Copy size={12} />
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            Run this in PowerShell to install the model, then try again.
          </p>
        </div>
      )
    case 'openai-key-missing':
    case 'openai-auth':
      return (
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="primary" size="sm" onClick={openSettingsAITab} className="flex items-center gap-1.5">
            <SettingsIcon size={12} />
            {data.errorKind === 'openai-auth' ? 'Fix key in Settings' : 'Add OpenAI key'}
          </Button>
        </div>
      )
    default:
      if (!data.setupHint) return null
      return (
        <button
          onClick={openSetupLink}
          className="text-primary text-xs underline mt-2 cursor-pointer hover:text-primary-hover"
        >
          Open setup link →
        </button>
      )
  }
}

function LoadingBody({ label }: { label?: string }): JSX.Element {
  // Track elapsed time so the user knows the analysis is still alive during
  // long cold-start waits (first vision inference on CPU is 30–90 s).
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])
  const hint =
    seconds < 10
      ? null
      : seconds < 30
        ? 'Local AI is loading the model…'
        : seconds < 60
          ? 'Still working — vision models can take ~30–60 s on first run.'
          : 'Almost there — first inference on CPU is slow but subsequent captures will be fast.'
  return (
    <div className="text-sm font-body p-4 space-y-2">
      <div className="text-text-muted loading-pulse">{label ?? 'Analyzing…'}</div>
      <div className="text-xs text-text-muted font-mono">{seconds}s elapsed</div>
      {hint ? <div className="text-xs text-text-muted">{hint}</div> : null}
    </div>
  )
}

function ResponseBody({ data }: { data: ResultPanelData }): JSX.Element {
  if (data.kind === 'loading') {
    return <LoadingBody label={data.label} />
  }
  if (data.kind === 'error') {
    return (
      <div className="p-4 text-sm font-body">
        <div className="text-error font-medium mb-1">{data.errorKind}</div>
        <div className="text-text-primary whitespace-pre-wrap">{data.message}</div>
        <ErrorActions data={data} />
      </div>
    )
  }
  // success
  const segments = parseCodeBlocks(data.text)
  return (
    <div className="p-4 text-sm font-body text-text-primary space-y-2">
      {segments.map((seg, i) => {
        if (!seg.content.trim()) return null
        if (seg.kind === 'code') {
          return (
            <pre
              key={i}
              className="bg-surface-2 border border-border rounded-sm p-2 text-xs font-mono overflow-x-auto"
            >
              {seg.content}
            </pre>
          )
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {seg.content.trim()}
          </p>
        )
      })}
    </div>
  )
}

export function ResultPanel(): JSX.Element | null {
  const [data, setData] = useState<ResultPanelData | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'text-copied' | 'image-copied'>(
    'idle'
  )

  useEffect(() => {
    window.resultBridge?.getInitialData().then((d) => {
      if (d) setData(d)
    })
    const off = window.resultBridge?.onUpdate((next) => setData(next))
    return () => off?.()
  }, [])

  // Wire keyboard dismiss (Esc) — TASK-033 will add the button handlers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        window.resultBridge?.dismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!data) return null

  const handleCopyText = async (): Promise<void> => {
    if (data.kind !== 'success') return
    await window.resultBridge?.copyText(data.text)
    setCopyState('text-copied')
    setTimeout(() => setCopyState('idle'), 1500)
  }

  const handleCopyImage = async (): Promise<void> => {
    await window.resultBridge?.copyImage()
    setCopyState('image-copied')
    setTimeout(() => setCopyState('idle'), 1500)
  }

  const handleDismiss = (): void => {
    window.resultBridge?.dismiss()
  }

  return (
    <div className="panel-enter h-full bg-surface-1 border border-border rounded shadow-panel flex flex-col overflow-hidden">
      {/* Header — provider tag + close */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-mono text-text-muted uppercase tracking-wide">
          {data.kind === 'loading'
            ? 'ScreenSpeak'
            : data.kind === 'error'
              ? `${data.errorKind.split('-')[0]} · error`
              : `${data.provider} · result`}
        </span>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors duration-fast cursor-pointer"
        >
          <X size={14} />
        </button>
      </header>

      {/* Screenshot thumbnail — max 200px tall, full width */}
      <div className="flex-shrink-0 bg-surface-2 border-b border-border">
        <img
          src={`data:image/png;base64,${data.imageBase64}`}
          alt="Screenshot"
          className="w-full max-h-[200px] object-contain"
        />
      </div>

      {/* AI response (scrollable) */}
      <div className="flex-1 overflow-y-auto max-h-[400px] min-h-[60px]">
        <ResponseBody data={data} />
      </div>

      {/* Action buttons */}
      <footer className="flex items-center gap-2 px-3 py-2 border-t border-border bg-surface-1">
        <Button
          variant="primary"
          size="sm"
          onClick={handleCopyText}
          disabled={data.kind !== 'success'}
          className="flex items-center gap-1.5"
        >
          <Copy size={12} />
          {copyState === 'text-copied' ? 'Copied!' : 'Copy text'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyImage}
          className="flex items-center gap-1.5"
        >
          <ImageIcon size={12} />
          {copyState === 'image-copied' ? 'Copied!' : 'Copy image'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="ml-auto"
        >
          Dismiss
        </Button>
      </footer>
    </div>
  )
}
