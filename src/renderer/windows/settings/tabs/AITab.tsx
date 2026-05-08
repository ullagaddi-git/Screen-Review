import { useEffect, useState } from 'react'
import { Check, ExternalLink, X } from 'lucide-react'
import { useIPC } from '../../../hooks/useIPC'
import { Button, Input, StatusDot } from '../../../components/ui'

type AIMode = 'local' | 'cloud' | 'ask'

const MODES: Array<{ id: AIMode; label: string; blurb: string }> = [
  {
    id: 'local',
    label: 'Local (Ollama)',
    blurb: 'Free. Private. Slower on CPU. Requires Ollama installed.'
  },
  {
    id: 'cloud',
    label: 'Cloud (OpenAI)',
    blurb: 'Fast. Accurate. Costs per call. Requires your OpenAI API key.'
  },
  {
    id: 'ask',
    label: 'Ask each time',
    blurb: 'Defaults to Local in this version; per-capture chooser arrives in a later release.'
  }
]

const OLLAMA_REFRESH_MS = 10_000

interface OllamaStatus {
  running: boolean
  models: string[]
}

export function AITab(): JSX.Element {
  const ipc = useIPC()
  const [aiMode, setAiMode] = useState<AIMode>('local')
  const [ollamaModel, setOllamaModel] = useState<string>('llava:7b')
  const [hasOpenAIKey, setHasOpenAIKey] = useState<boolean>(false)

  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyEditing, setKeyEditing] = useState(false)
  const [testState, setTestState] = useState<
    | { kind: 'idle' }
    | { kind: 'testing' }
    | { kind: 'valid' }
    | { kind: 'invalid'; error: string }
  >({ kind: 'idle' })

  // Load initial config
  useEffect(() => {
    let mounted = true
    ipc.settings.get().then((cfg) => {
      if (!mounted) return
      setAiMode(cfg.aiMode as AIMode)
      setOllamaModel(cfg.ollamaModel)
      setHasOpenAIKey(cfg.hasOpenAIKey)
    })
    return () => {
      mounted = false
    }
  }, [ipc])

  // Live Ollama status — refresh every 10 s while AI tab is mounted.
  useEffect(() => {
    let cancelled = false
    const fetchStatus = (): void => {
      ipc.ollama.check().then((res) => {
        if (cancelled) return
        setOllama({ running: res.running, models: res.models })
      })
    }
    fetchStatus()
    const id = setInterval(fetchStatus, OLLAMA_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [ipc])

  // ──────────────── handlers ────────────────

  const handleModeChange = async (mode: AIMode): Promise<void> => {
    setAiMode(mode)
    await ipc.settings.set({ aiMode: mode })
  }

  const handleOllamaModelChange = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ): Promise<void> => {
    const next = e.target.value
    setOllamaModel(next)
    await ipc.settings.set({ ollamaModel: next })
  }

  const handleTestKey = async (): Promise<void> => {
    if (!keyDraft.trim()) return
    setTestState({ kind: 'testing' })
    const result = await ipc.openai.testKey(keyDraft.trim())
    if (result.valid) {
      setTestState({ kind: 'valid' })
    } else {
      setTestState({ kind: 'invalid', error: result.error ?? 'Unknown error' })
    }
  }

  const handleSaveKey = async (): Promise<void> => {
    // Only save if key has been validated, OR if user explicitly clicks Save
    // even without testing. We test first to give the best UX.
    const trimmed = keyDraft.trim()
    if (!trimmed) return
    await ipc.settings.set({ openaiApiKey: trimmed })
    setHasOpenAIKey(true)
    setKeyDraft('')
    setKeyEditing(false)
    setTestState({ kind: 'idle' })
  }

  const handleClearKey = async (): Promise<void> => {
    await ipc.settings.set({ openaiApiKey: null })
    setHasOpenAIKey(false)
    setKeyDraft('')
    setTestState({ kind: 'idle' })
  }

  // ──────────────── derived ────────────────

  const ollamaStatusDot =
    ollama === null
      ? { kind: 'info' as const, label: 'Checking Ollama…' }
      : ollama.running
        ? {
            kind: 'success' as const,
            label: `Ollama running · ${ollama.models.length} model${ollama.models.length === 1 ? '' : 's'} installed`
          }
        : {
            kind: 'warning' as const,
            label: 'Ollama not running'
          }

  return (
    <div className="space-y-6">
      {/* AI Mode */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">AI Mode</h2>
          <p className="text-xs text-text-muted mt-1">
            Where screenshot analysis runs.
          </p>
        </header>
        <div className="space-y-2">
          {MODES.map((m) => {
            const isActive = aiMode === m.id
            return (
              <label
                key={m.id}
                className={[
                  'flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors duration-fast',
                  isActive
                    ? 'border-primary bg-surface-1'
                    : 'border-border bg-surface-2 hover:bg-surface-3'
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="aiMode"
                  value={m.id}
                  checked={isActive}
                  onChange={() => handleModeChange(m.id)}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1">
                  <div className="text-sm text-text-primary font-medium">{m.label}</div>
                  <div className="text-xs text-text-muted mt-0.5">{m.blurb}</div>
                </div>
              </label>
            )
          })}
        </div>
      </section>

      {/* Ollama (Local AI) */}
      <section className="space-y-3 border-t border-border pt-5">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Local AI (Ollama)</h2>
          <StatusDot status={ollamaStatusDot.kind} label={ollamaStatusDot.label} />
        </header>

        {ollama && !ollama.running ? (
          <p className="text-xs text-text-muted">
            Start Ollama, or{' '}
            <a
              href="https://ollama.com"
              onClick={(e) => {
                e.preventDefault()
                ipc.openExternal?.('https://ollama.com')
              }}
              className="text-primary underline cursor-pointer"
            >
              download it
            </a>{' '}
            (free). It runs alongside ScreenSpeak in the background.
          </p>
        ) : null}

        {ollama && ollama.running && ollama.models.length === 0 ? (
          <p className="text-xs text-warning">
            No vision models installed. In a terminal, run:{' '}
            <code className="font-mono bg-surface-2 border border-border rounded-sm px-1.5 py-0.5">
              ollama pull llava:7b
            </code>
          </p>
        ) : null}

        {ollama && ollama.running && ollama.models.length > 0 ? (
          <div className="space-y-2">
            <label className="text-xs text-text-muted">Active model</label>
            <select
              value={ollamaModel}
              onChange={handleOllamaModelChange}
              className="bg-surface-1 text-text-primary border border-border rounded-sm px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none w-full"
            >
              {/* Always include the configured model, even if not in the live list (so the user can see what's set). */}
              {!ollama.models.includes(ollamaModel) ? (
                <option value={ollamaModel}>{ollamaModel} (not installed)</option>
              ) : null}
              {ollama.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </section>

      {/* OpenAI (Cloud AI) */}
      <section className="space-y-3 border-t border-border pt-5">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Cloud AI (OpenAI)</h2>
          <StatusDot
            status={hasOpenAIKey ? 'success' : 'info'}
            label={hasOpenAIKey ? 'Key saved' : 'No key set'}
          />
        </header>
        <p className="text-xs text-text-muted">
          Optional. If set, choose <span className="font-medium">Cloud</span> mode above to use
          GPT-4o for analysis. Get a key from{' '}
          <a
            href="https://platform.openai.com/api-keys"
            onClick={(e) => {
              e.preventDefault()
              ipc.openExternal?.('https://platform.openai.com/api-keys')
            }}
            className="text-primary underline cursor-pointer inline-flex items-center gap-0.5"
          >
            platform.openai.com
            <ExternalLink size={11} />
          </a>
          . The key is stored encrypted on your machine; never sent to ScreenSpeak servers.
        </p>

        {hasOpenAIKey && !keyEditing ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs text-text-muted">sk-•••••••••••••••</code>
            <Button variant="ghost" size="sm" onClick={() => setKeyEditing(true)}>
              Replace key
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearKey}>
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              password
              placeholder="sk-..."
              value={keyDraft}
              onChange={(e) => {
                setKeyDraft(e.target.value)
                setTestState({ kind: 'idle' })
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTestKey}
                disabled={!keyDraft.trim() || testState.kind === 'testing'}
              >
                {testState.kind === 'testing' ? 'Testing…' : 'Test key'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveKey}
                disabled={!keyDraft.trim()}
              >
                Save
              </Button>
              {keyEditing && hasOpenAIKey ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setKeyEditing(false)
                    setKeyDraft('')
                    setTestState({ kind: 'idle' })
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>

            {testState.kind === 'valid' ? (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <Check size={12} />
                Valid — click Save to store the key.
              </div>
            ) : null}
            {testState.kind === 'invalid' ? (
              <div className="flex items-start gap-1.5 text-xs text-error">
                <X size={12} className="mt-0.5 flex-shrink-0" />
                <span>{testState.error}</span>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
