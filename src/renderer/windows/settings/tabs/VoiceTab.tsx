import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  ListChecks,
  Mic,
  Radio,
  Square,
  Upload,
  Users
} from 'lucide-react'
import { useIPC } from '../../../hooks/useIPC'
import { Button, StatusDot } from '../../../components/ui'
import { decodeToMonoPcm, encodeWav } from '../../../utils/audio-decode'

type MeetingState = 'idle' | 'recording' | 'saving'
type UploadState =
  | { kind: 'idle' }
  | { kind: 'preparing'; fileName: string; durationSeconds: number }
  | { kind: 'transcribing'; fileName: string }
  | { kind: 'extracting'; fileName: string }
  | {
      kind: 'done'
      fileName: string
      durationSeconds: number
      transcript: string
      actions: string | null
      /** Non-null when the most recent extraction attempt failed — kept sticky
       *  in the UI (unlike the brief copy/save toast) so users actually see it. */
      actionsError: string | null
      transcriptSavedPath: string | null
      actionsSavedPath: string | null
    }
  | { kind: 'error'; message: string }

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
  const [voiceStreamPaste, setVoiceStreamPaste] = useState<boolean>(false)
  const [hotkey, setHotkey] = useState<string>('Ctrl+Shift+Space')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [stateMessage, setStateMessage] = useState<string | undefined>(undefined)
  /**
   * Countdown for the "Start live streaming dictation" button. When set,
   * the button shows "Recording starts in N…" and the user is expected
   * to Alt-Tab to their target app before it hits 0 — otherwise the
   * stream would paste into Settings (and the own-window guard would
   * silently drop every chunk).
   */
  const [streamCountdown, setStreamCountdown] = useState<number | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Meeting recording — separate from voice dictation. Has its own
  // hotkey (Ctrl+Shift+M default), captures mic + system audio mixed,
  // saves transcript to Documents/ScreenSpeak/meetings.
  const [meetingState, setMeetingState] = useState<MeetingState>('idle')
  const [showConsentDialog, setShowConsentDialog] = useState(false)
  const meetingPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Upload-and-transcribe (TASK-060). Lets the user pick any audio/video
  // file, transcribes it via whisper, optionally extracts action items
  // via the configured AI backend.
  const [uploadState, setUploadState] = useState<UploadState>({ kind: 'idle' })
  const [uploadToast, setUploadToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true
    ipc.settings.get().then((cfg) => {
      if (!mounted) return
      setWhisperModel(cfg.whisperModel)
      setVoiceLanguage(cfg.voiceLanguage)
      setVoiceMaxSeconds(cfg.voiceMaxSeconds ?? 300)
      setVoiceTriggerMode(cfg.voiceTriggerMode ?? 'hold')
      setVoiceStreamPaste(cfg.voiceStreamPaste ?? false)
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

  const handleStreamPasteToggle = async (checked: boolean): Promise<void> => {
    setVoiceStreamPaste(checked)
    await ipc.settings.set({ voiceStreamPaste: checked })
  }

  const handleStartStop = async (): Promise<void> => {
    if (voiceState === 'recording') {
      await ipc.voice.requestStop()
    } else if (voiceState === 'idle') {
      await ipc.voice.requestStart()
    }
    // 'transcribing' / 'error' — no manual action; the IPC events drive state back to idle.
  }

  /**
   * Kick off a 3-second countdown, then start a stream-mode dictation.
   * The countdown gives the user time to Alt-Tab to their target app
   * (Notepad, Word, Slack, etc.) — without it, the stream's pastes would
   * land in Settings and be silently dropped by the own-window guard.
   */
  const handleStartStream = (): void => {
    if (voiceState !== 'idle' || streamCountdown !== null) return
    let n = 3
    setStreamCountdown(n)
    const tick = (): void => {
      n -= 1
      if (n > 0) {
        setStreamCountdown(n)
        countdownTimerRef.current = setTimeout(tick, 1000)
      } else {
        // Countdown done — fire the actual stream request.
        setStreamCountdown(null)
        countdownTimerRef.current = null
        void ipc.voice.requestStartStream()
      }
    }
    countdownTimerRef.current = setTimeout(tick, 1000)
  }

  const handleCancelCountdown = (): void => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setStreamCountdown(null)
  }

  // Cleanup on unmount — don't fire a stream start after the user
  // navigates away from this tab.
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current)
    }
  }, [])

  // Poll meeting state every 2 s so the Start/Stop button label tracks
  // reality (e.g. user pressed the hotkey from another window). 2 s is
  // a sweet spot — fast enough to feel responsive, slow enough to not
  // wake the CPU for an idle Settings window.
  useEffect(() => {
    let mounted = true
    const fetchState = (): void => {
      ipc.meeting.getState().then((s) => {
        if (!mounted) return
        setMeetingState(s.state)
      })
    }
    fetchState()
    meetingPollRef.current = setInterval(fetchState, 2000)
    return () => {
      mounted = false
      if (meetingPollRef.current) clearInterval(meetingPollRef.current)
    }
  }, [ipc])

  const handleMeetingToggle = async (): Promise<void> => {
    if (meetingState === 'saving') return // wait for save to complete

    // First time? Show consent dialog. The dialog's "Continue" handler
    // acknowledges consent then immediately toggles.
    if (meetingState === 'idle') {
      const s = await ipc.meeting.getState()
      if (!s.consentAcknowledged) {
        setShowConsentDialog(true)
        return
      }
    }

    const result = await ipc.meeting.toggle()
    setMeetingState(result.state)
  }

  const handleConsentAccept = async (): Promise<void> => {
    await ipc.meeting.acknowledgeConsent()
    setShowConsentDialog(false)
    const result = await ipc.meeting.toggle()
    setMeetingState(result.state)
  }

  const handleConsentCancel = (): void => {
    setShowConsentDialog(false)
  }

  const handleOpenMeetingsFolder = (): void => {
    void ipc.meeting.openFolder()
  }

  // ─────────────── Upload-and-transcribe ───────────────

  const showUploadToast = (msg: string): void => {
    setUploadToast(msg)
    if (uploadToastTimer.current) clearTimeout(uploadToastTimer.current)
    uploadToastTimer.current = setTimeout(() => setUploadToast(null), 1800)
  }

  const handlePickFile = (): void => {
    if (uploadState.kind === 'preparing' || uploadState.kind === 'transcribing') return
    fileInputRef.current?.click()
  }

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    // Reset the input so picking the same file twice still re-fires onChange.
    e.target.value = ''
    if (!file) return
    await processUpload(file)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    if (uploadState.kind === 'preparing' || uploadState.kind === 'transcribing') return
    const file = e.dataTransfer.files?.[0]
    if (file) await processUpload(file)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
  }

  const processUpload = async (file: File): Promise<void> => {
    setUploadState({
      kind: 'preparing',
      fileName: file.name,
      durationSeconds: 0
    })
    let pcm: Float32Array
    let durationSeconds: number
    try {
      const decoded = await decodeToMonoPcm(file)
      pcm = decoded.pcm
      durationSeconds = decoded.durationSeconds
    } catch (err) {
      setUploadState({ kind: 'error', message: (err as Error).message })
      return
    }

    const wav = encodeWav(pcm)
    setUploadState({ kind: 'transcribing', fileName: file.name })

    const result = await ipc.transcribeFile.run({
      sourceFilename: file.name,
      durationSeconds,
      wav: wav.buffer as ArrayBuffer
    })

    if (!result.ok) {
      setUploadState({ kind: 'error', message: result.error })
      return
    }

    setUploadState({
      kind: 'done',
      fileName: file.name,
      durationSeconds,
      transcript: result.transcript,
      actions: null,
      actionsError: null,
      transcriptSavedPath: null,
      actionsSavedPath: null
    })
  }

  const handleExtractActions = async (): Promise<void> => {
    if (uploadState.kind !== 'done') return
    // Snapshot the current 'done' state so we can restore it after the
    // async call regardless of success or failure. Reading uploadState
    // after `await` would still be the same closure-captured value, but
    // capturing explicitly makes the intent obvious.
    const snapshot = uploadState
    setUploadState({ kind: 'extracting', fileName: snapshot.fileName })
    const result = await ipc.transcribeFile.extractActions(snapshot.transcript)
    if (!result.ok) {
      // Re-enter 'done' state but with a sticky error message that stays
      // visible until the user clicks Extract again. Preserves the
      // transcript so the user doesn't lose their work.
      setUploadState({
        ...snapshot,
        kind: 'done',
        actionsError: result.error ?? 'Unknown error',
        actions: null
      })
      return
    }
    setUploadState({
      ...snapshot,
      kind: 'done',
      actions: result.text ?? '',
      actionsError: null
    })
  }

  const handleCopy = async (text: string, label: string): Promise<void> => {
    if (!text) return
    await navigator.clipboard.writeText(text).catch(() => {
      /* clipboard can fail if window not focused — ignore */
    })
    showUploadToast(`Copied ${label}`)
  }

  const handleSaveTranscript = async (): Promise<void> => {
    if (uploadState.kind !== 'done') return
    const result = await ipc.transcribeFile.saveTranscript({
      sourceFilename: uploadState.fileName,
      durationSeconds: uploadState.durationSeconds,
      transcript: uploadState.transcript
    })
    if (result.ok && result.filePath) {
      setUploadState({ ...uploadState, transcriptSavedPath: result.filePath })
      showUploadToast('Transcript saved')
    } else {
      showUploadToast(`Save failed: ${result.error ?? 'unknown'}`)
    }
  }

  const handleSaveActions = async (): Promise<void> => {
    if (uploadState.kind !== 'done' || !uploadState.actions) return
    const result = await ipc.transcribeFile.saveActions({
      sourceFilename: uploadState.fileName,
      actions: uploadState.actions
    })
    if (result.ok && result.filePath) {
      setUploadState({ ...uploadState, actionsSavedPath: result.filePath })
      showUploadToast('Action items saved')
    } else {
      showUploadToast(`Save failed: ${result.error ?? 'unknown'}`)
    }
  }

  const handleOpenTranscriptsFolder = (): void => {
    void ipc.transcribeFile.openFolder()
  }

  const handleResetUpload = (): void => {
    setUploadState({ kind: 'idle' })
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
          <p className="text-xs text-text-muted mt-1">
            Two dictation modes, available as separate actions. Pick the one
            that fits the moment — the hotkey can be configured to use either
            mode below.
          </p>
        </header>

        <div className="flex items-center gap-3">
          <StatusDot status={statusDotKind} label={statusLabel} />
        </div>

        {/* Batch dictation — the original behavior. One transcription on release,
            pastes the full text at the cursor. Works whether or not Settings is
            focused (when focused on Settings, the text is copied to clipboard
            instead and a notification tells you where it is). */}
        <div className="space-y-2 border border-border rounded p-3 bg-surface-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary font-medium flex items-center gap-1.5">
                <Mic size={14} />
                Batch dictation
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                Record now, transcribe + paste the full text at the end.
                Higher accuracy. Pastes after you click Stop.
              </div>
            </div>
            {voiceState === 'recording' && !ipc /* placeholder for clarity */ ? null : null}
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
                disabled={voiceState === 'transcribing' || streamCountdown !== null}
                className="flex items-center gap-1.5"
              >
                <Mic size={12} />
                {voiceState === 'transcribing' ? 'Transcribing…' : 'Start batch'}
              </Button>
            )}
          </div>
        </div>

        {/* Live streaming dictation — text streams into the active app as you
            speak. Requires the active app to NOT be ScreenSpeak Settings, so
            we offer a 3-second countdown after clicking to let you Alt-Tab. */}
        <div className="space-y-2 border border-border rounded p-3 bg-surface-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary font-medium flex items-center gap-1.5">
                <Radio size={14} />
                Live streaming dictation{' '}
                <span className="text-xs font-normal text-warning ml-1">experimental</span>
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                Words stream into the active app every ~3 s while you speak
                (Windows Dictation style). After clicking, you have 3 seconds
                to Alt-Tab to your target app (Notepad, Word, etc.).
              </div>
            </div>
            {streamCountdown !== null ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelCountdown}
                className="flex items-center gap-1.5"
              >
                Cancel ({streamCountdown}s)
              </Button>
            ) : voiceState === 'recording' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartStop}
                className="flex items-center gap-1.5"
              >
                <Square size={12} />
                Stop streaming
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartStream}
                disabled={voiceState !== 'idle'}
                className="flex items-center gap-1.5"
              >
                <Radio size={12} />
                Start live streaming
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-text-muted">
          Or use the hotkey: <span className="font-mono">{hotkey}</span> — uses
          your default mode (configured below).
        </p>
      </section>

      {/* Meeting recording — captures mic + system audio mixed and saves
          a .txt transcript. Independent hotkey (default Ctrl+Shift+M).
          For Zoom / Teams / Meet / YouTube. */}
      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <Users size={14} />
            Meeting recording
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Captures your microphone <strong>and</strong> system audio (other
            meeting participants, YouTube, etc.) mixed together, transcribes
            both, and saves a <span className="font-mono">.txt</span> file to{' '}
            <span className="font-mono">Documents\ScreenSpeak\meetings\</span>.
            Press the hotkey or click the button to toggle.
          </p>
        </header>

        <div className="space-y-2 border border-border rounded p-3 bg-surface-2">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm text-text-primary font-medium">
                {meetingState === 'recording'
                  ? '● Recording meeting…'
                  : meetingState === 'saving'
                    ? 'Saving meeting transcript…'
                    : 'Ready to record a meeting'}
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                Default hotkey: <span className="font-mono">Ctrl+Shift+M</span>{' '}
                — single tap to start, single tap to stop. Works whether
                Settings is open or closed.
              </div>
            </div>
            {meetingState === 'recording' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleMeetingToggle}
                className="flex items-center gap-1.5"
              >
                <Square size={12} />
                Stop meeting
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleMeetingToggle}
                disabled={meetingState === 'saving'}
                className="flex items-center gap-1.5"
              >
                <Users size={12} />
                {meetingState === 'saving' ? 'Saving…' : 'Start meeting'}
              </Button>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenMeetingsFolder}
          className="flex items-center gap-1.5"
        >
          <ExternalLink size={12} />
          Open meetings folder
        </Button>
      </section>

      {/* Upload a recording → transcript + action items (TASK-060) */}
      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <Upload size={14} />
            Transcribe a recording
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Drop or pick an audio/video file (MP3, M4A, WAV, OGG, FLAC, WebM,
            MP4 video). ScreenSpeak transcribes it locally with Whisper and
            optionally extracts a to-do list of action items via your
            configured AI backend.
          </p>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          onChange={handleFileChosen}
        />

        {uploadState.kind === 'idle' || uploadState.kind === 'error' ? (
          <div
            onClick={handlePickFile}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-border rounded-md p-6 text-center bg-surface-2 hover:bg-surface-3 cursor-pointer transition-colors duration-fast"
          >
            <Upload size={20} className="mx-auto text-text-muted mb-2" />
            <div className="text-sm text-text-primary font-medium">
              Drop a recording here, or click to choose
            </div>
            <div className="text-xs text-text-muted mt-1">
              Audio or video file. Up to a few hours of content.
            </div>
            {uploadState.kind === 'error' ? (
              <div className="text-xs text-error mt-2">{uploadState.message}</div>
            ) : null}
          </div>
        ) : null}

        {uploadState.kind === 'preparing' || uploadState.kind === 'transcribing' ? (
          <div className="border border-border rounded p-3 bg-surface-2 space-y-2">
            <div className="text-sm text-text-primary font-medium truncate">
              {uploadState.fileName}
            </div>
            <div className="text-xs text-text-muted loading-pulse">
              {uploadState.kind === 'preparing'
                ? 'Decoding audio…'
                : 'Transcribing with Whisper… this can take a while for long recordings.'}
            </div>
          </div>
        ) : null}

        {uploadState.kind === 'extracting' ? (
          <div className="border border-border rounded p-3 bg-surface-2 space-y-2">
            <div className="text-sm text-text-primary font-medium truncate">
              {uploadState.fileName}
            </div>
            <div className="text-xs text-text-muted loading-pulse">
              Extracting action items with AI…
            </div>
          </div>
        ) : null}

        {uploadState.kind === 'done' ? (
          <div className="space-y-3">
            <div className="border border-border rounded p-3 bg-surface-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary font-medium truncate">
                    {uploadState.fileName}
                  </div>
                  <div className="text-xs text-text-muted">
                    {Math.floor(uploadState.durationSeconds / 60)}m{' '}
                    {Math.round(uploadState.durationSeconds % 60)}s ·{' '}
                    {uploadState.transcript.length.toLocaleString()} characters
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetUpload}
                  className="flex items-center gap-1.5"
                >
                  New recording
                </Button>
              </div>

              <div className="border-t border-border pt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-text-muted uppercase tracking-wide">
                    Transcript
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(uploadState.transcript, 'transcript')}
                      className="flex items-center gap-1.5"
                    >
                      <Copy size={12} />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSaveTranscript}
                      className="flex items-center gap-1.5"
                    >
                      <FileText size={12} />
                      Save as .txt
                    </Button>
                  </div>
                </div>
                <pre className="text-xs text-text-primary whitespace-pre-wrap font-body bg-surface-1 border border-border rounded p-2 max-h-48 overflow-y-auto">
                  {uploadState.transcript}
                </pre>
                {uploadState.transcriptSavedPath ? (
                  <div className="text-xs text-success">
                    ✓ Saved to{' '}
                    <span className="font-mono">{uploadState.transcriptSavedPath}</span>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-border pt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-text-muted uppercase tracking-wide">
                    Action items
                  </span>
                  <div className="flex items-center gap-2">
                    {uploadState.actions ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(uploadState.actions ?? '', 'action items')}
                          className="flex items-center gap-1.5"
                        >
                          <Copy size={12} />
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSaveActions}
                          className="flex items-center gap-1.5"
                        >
                          <FileText size={12} />
                          Save as .md
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleExtractActions}
                        className="flex items-center gap-1.5"
                      >
                        <ListChecks size={12} />
                        Extract action items
                      </Button>
                    )}
                  </div>
                </div>
                {uploadState.actions ? (
                  <pre className="text-xs text-text-primary whitespace-pre-wrap font-body bg-surface-1 border border-border rounded p-2 max-h-48 overflow-y-auto">
                    {uploadState.actions}
                  </pre>
                ) : uploadState.actionsError ? (
                  <div className="text-xs bg-surface-1 border border-error rounded p-2 space-y-1">
                    <div className="text-error font-medium">
                      Couldn't extract action items
                    </div>
                    <div className="text-text-muted whitespace-pre-wrap">
                      {uploadState.actionsError}
                    </div>
                    <div className="text-text-muted pt-1">
                      Common fixes: start Ollama, pull a model (e.g.{' '}
                      <span className="font-mono">ollama pull qwen2.5:7b</span>), or
                      add an OpenAI key in Settings → AI.
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">
                    Click "Extract action items" to generate a Markdown checklist
                    from the transcript using your configured AI backend.
                  </p>
                )}
                {uploadState.actionsSavedPath ? (
                  <div className="text-xs text-success">
                    ✓ Saved to{' '}
                    <span className="font-mono">{uploadState.actionsSavedPath}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenTranscriptsFolder}
            className="flex items-center gap-1.5"
          >
            <FolderOpen size={12} />
            Open transcripts folder
          </Button>
          {uploadToast ? (
            <span className="text-xs text-success font-medium">{uploadToast}</span>
          ) : null}
        </div>
      </section>

      {/* Consent dialog — shown the first time the user tries to start
          a meeting recording. Acknowledgement is persisted in config so
          we never re-prompt. */}
      {showConsentDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="max-w-md mx-4 bg-surface-1 border border-border rounded-md shadow-panel p-5 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">
              Confirm you have permission to record
            </h3>
            <p className="text-xs text-text-muted">
              Meeting recording captures all audio playing on your system —
              including the voice of other participants on a call. In some
              jurisdictions (e.g. "two-party-consent" US states like California,
              EU under GDPR, parts of Canada and Australia), recording another
              person's voice without their consent is illegal.
            </p>
            <p className="text-xs text-text-muted">
              By clicking Continue, you confirm that you have the right to
              record this audio and accept responsibility for compliance with
              your local laws. We'll only ask this once.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={handleConsentCancel}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConsentAccept}>
                I have permission — continue
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
          <h2 className="text-sm font-semibold text-text-primary">Default mode for hotkey</h2>
          <p className="text-xs text-text-muted mt-1">
            When you trigger dictation via the global hotkey (instead of the
            buttons above), this picks which mode runs.
          </p>
        </header>
        <div className="space-y-2">
          <label
            className={[
              'flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors duration-fast',
              !voiceStreamPaste
                ? 'border-primary bg-surface-1'
                : 'border-border bg-surface-2 hover:bg-surface-3'
            ].join(' ')}
          >
            <input
              type="radio"
              name="hotkeyDefaultMode"
              checked={!voiceStreamPaste}
              onChange={() => handleStreamPasteToggle(false)}
              className="mt-0.5 accent-primary"
            />
            <div className="flex-1">
              <div className="text-sm text-text-primary font-medium">Batch (default)</div>
              <div className="text-xs text-text-muted mt-0.5">
                Records while held, transcribes + pastes on release. Higher
                accuracy. Pastes the entire text in one Ctrl+V at the end.
              </div>
            </div>
          </label>
          <label
            className={[
              'flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors duration-fast',
              voiceStreamPaste
                ? 'border-primary bg-surface-1'
                : 'border-border bg-surface-2 hover:bg-surface-3'
            ].join(' ')}
          >
            <input
              type="radio"
              name="hotkeyDefaultMode"
              checked={voiceStreamPaste}
              onChange={() => handleStreamPasteToggle(true)}
              className="mt-0.5 accent-primary"
            />
            <div className="flex-1">
              <div className="text-sm text-text-primary font-medium">
                Live streaming{' '}
                <span className="text-xs font-normal text-warning ml-1">experimental</span>
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                Words stream into the active app every ~3 s while you hold the
                hotkey. Only useful if your hotkey doesn't conflict with the
                target app's shortcuts.
              </div>
            </div>
          </label>
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
