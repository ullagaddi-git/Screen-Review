import { useEffect, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { useIPC } from '../../../hooks/useIPC'
import { Button, StatusDot } from '../../../components/ui'

const MODELS = [
  {
    id: 'tiny' as const,
    label: 'Tiny',
    blurb: 'Fastest. ~75 MB. Good for short, clear speech on low-end hardware.'
  },
  {
    id: 'base' as const,
    label: 'Base',
    blurb: 'Balanced. ~142 MB. Default — solid speed and accuracy on most laptops.'
  },
  {
    id: 'small' as const,
    label: 'Small',
    blurb: 'Most accurate. ~466 MB. Slower; better for noisy environments.'
  }
]

const MAX_DURATION_OPTIONS = [
  { seconds: 60, label: '1 minute' },
  { seconds: 300, label: '5 minutes' },
  { seconds: 900, label: '15 minutes' },
  { seconds: 1800, label: '30 minutes' },
  { seconds: 3600, label: '60 minutes (longest)' }
]

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'auto', label: 'Auto-detect' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'hi', label: 'Hindi' }
]

const TRIGGER_MODES: Array<{ id: 'hold' | 'toggle'; label: string; blurb: string }> = [
  {
    id: 'hold',
    label: 'Hold to record',
    blurb:
      'Hold the hotkey while speaking, release to transcribe. Best for short dictation.'
  },
  {
    id: 'toggle',
    label: 'Press once to start / again to stop',
    blurb:
      'Tap the hotkey to start recording, tap again to stop. Better for longer recordings.'
  }
]

type Model = (typeof MODELS)[number]['id']
type TriggerMode = (typeof TRIGGER_MODES)[number]['id']
type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error'

export function VoiceTab(): JSX.Element {
  const ipc = useIPC()
  const [whisperModel, setWhisperModel] = useState<Model>('base')
  const [voiceLanguage, setVoiceLanguage] = useState<string>('en')
  const [voiceMaxSeconds, setVoiceMaxSeconds] = useState<number>(300)
  const [voiceTriggerMode, setVoiceTriggerMode] = useState<TriggerMode>('hold')
  const [hotkey, setHotkey] = useState<string>('Ctrl+Shift+Space')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [stateMessage, setStateMessage] = useState<string | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    ipc.settings.get().then((cfg) => {
      if (!mounted) return
      setWhisperModel(cfg.whisperModel)
      setVoiceLanguage(cfg.voiceLanguage)
      setVoiceMaxSeconds(cfg.voiceMaxSeconds ?? 300)
      setVoiceTriggerMode(cfg.voiceTriggerMode ?? 'hold')
      setHotkey(cfg.voiceHotkey)
    })
    return () => {
      mounted = false
    }
  }, [ipc])

  useEffect(() => {
    const off = ipc.voice.onStateChange((payload) => {
      setVoiceState(payload.state)
      setStateMessage(payload.message)
    })
    return off
  }, [ipc])

  const handleModelChange = async (id: Model): Promise<void> => {
    setWhisperModel(id)
    await ipc.settings.set({ whisperModel: id })
  }

  const handleLanguageChange = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ): Promise<void> => {
    const code = e.target.value
    setVoiceLanguage(code)
    await ipc.settings.set({ voiceLanguage: code })
  }

  const handleMaxSecondsChange = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ): Promise<void> => {
    const seconds = Number(e.target.value)
    setVoiceMaxSeconds(seconds)
    await ipc.settings.set({ voiceMaxSeconds: seconds })
  }

  const handleTriggerModeChange = async (mode: TriggerMode): Promise<void> => {
    setVoiceTriggerMode(mode)
    await ipc.settings.set({ voiceTriggerMode: mode })
  }

  const handleStartStop = async (): Promise<void> => {
    if (voiceState === 'recording') {
      await ipc.voice.requestStop()
    } else if (voiceState === 'idle') {
      await ipc.voice.requestStart()
    }
    // 'transcribing' / 'error' — no manual action; the IPC events drive state back to idle.
  }

  const statusDotKind =
    voiceState === 'recording'
      ? 'success'
      : voiceState === 'transcribing'
        ? 'warning'
        : voiceState === 'error'
          ? 'error'
          : 'info'

  const statusLabel =
    voiceState === 'recording'
      ? 'Recording'
      : voiceState === 'transcribing'
        ? 'Transcribing'
        : voiceState === 'error'
          ? `Error: ${stateMessage ?? 'unknown'}`
          : `Idle — hold ${hotkey} to dictate`

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Voice status</h2>
        </header>
        <div className="flex items-center gap-3">
          <StatusDot status={statusDotKind} label={statusLabel} />
        </div>
        <div className="flex items-center gap-2">
          {voiceState === 'recording' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartStop}
              className="flex items-center gap-1.5"
            >
              <Square size={12} />
              Stop &amp; transcribe
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartStop}
              disabled={voiceState === 'transcribing'}
              className="flex items-center gap-1.5"
            >
              <Mic size={12} />
              {voiceState === 'transcribing' ? 'Transcribing…' : 'Start recording'}
            </Button>
          )}
          <span className="text-xs text-text-muted">
            Or use the hotkey: <span className="font-mono">{hotkey}</span>
          </span>
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Hotkey trigger mode</h2>
          <p className="text-xs text-text-muted mt-1">
            How the voice hotkey behaves. Affects only keyboard triggering — the
            Start/Stop button above always works regardless.
          </p>
        </header>
        <div className="space-y-2">
          {TRIGGER_MODES.map((m) => {
            const isActive = voiceTriggerMode === m.id
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
                  name="voiceTriggerMode"
                  value={m.id}
                  checked={isActive}
                  onChange={() => handleTriggerModeChange(m.id)}
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

      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Whisper model</h2>
          <p className="text-xs text-text-muted mt-1">
            Local speech-to-text model. Larger models are more accurate but slower.
          </p>
        </header>
        <div className="space-y-2">
          {MODELS.map((m) => {
            const isActive = whisperModel === m.id
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
                  name="whisperModel"
                  value={m.id}
                  checked={isActive}
                  onChange={() => handleModelChange(m.id)}
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

      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Spoken language</h2>
          <p className="text-xs text-text-muted mt-1">
            The language you'll be dictating in.
          </p>
        </header>
        <select
          value={voiceLanguage}
          onChange={handleLanguageChange}
          className="bg-surface-1 text-text-primary border border-border rounded-sm px-3 py-2 text-sm font-body focus:border-primary focus:outline-none w-56"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Max recording length</h2>
          <p className="text-xs text-text-muted mt-1">
            Safety cap so a stuck hotkey doesn't record forever. Whisper transcription
            time scales with audio length — longer recordings take proportionally longer
            to transcribe.
          </p>
        </header>
        <select
          value={voiceMaxSeconds}
          onChange={handleMaxSecondsChange}
          className="bg-surface-1 text-text-primary border border-border rounded-sm px-3 py-2 text-sm font-body focus:border-primary focus:outline-none w-56"
        >
          {MAX_DURATION_OPTIONS.map((opt) => (
            <option key={opt.seconds} value={opt.seconds}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>
    </div>
  )
}
