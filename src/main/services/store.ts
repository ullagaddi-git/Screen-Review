import Store from 'electron-store'

export interface Config {
  voiceHotkey: string
  captureHotkey: string

  aiMode: 'local' | 'cloud' | 'ask'
  openaiApiKey: string | null
  ollamaModel: string
  ollamaHost: string

  whisperModel: 'tiny' | 'base' | 'small'
  voiceLanguage: string
  /**
   * Maximum recording length in seconds. Acts as a safety cap so a stuck
   * hotkey doesn't record forever and fill memory. Default 300 (5 min).
   * Settings → Voice exposes a selector for 1, 5, 15, 30, 60 minutes.
   */
  voiceMaxSeconds: number
  /**
   * How the voice hotkey triggers recording:
   *  - 'hold': hold to record, release to transcribe (original UX, good
   *    for short dictation)
   *  - 'toggle': press once to start, press again to stop (better for
   *    longer recordings — no thumb fatigue)
   */
  voiceTriggerMode: 'hold' | 'toggle'
  /**
   * When true, voice transcription streams text into the active app
   * (Windows Dictation style) as you speak instead of waiting for the
   * hotkey release. Trade-off: per-chunk accuracy is slightly lower than
   * a single batch pass on the full recording, and corrections are not
   * applied retroactively (chunks are append-only). Off by default.
   *
   * Implementation: when true, the recorder window emits ~3 s audio chunks
   * via MediaRecorder.start(timeslice), and the main-process stream-
   * transcribe service spawns whisper-cli per chunk + pastes the result
   * at the cursor. The release-of-hotkey batch transcription is SKIPPED
   * in stream mode — text is already in the target app.
   */
  voiceStreamPaste: boolean

  /**
   * Hotkey that toggles a meeting recording on/off. Distinct from
   * voiceHotkey because meetings use a press-to-toggle pattern (single
   * tap to start, single tap to stop) — meetings run long and you don't
   * want to hold the keys for 30 minutes. Mic + system audio are captured
   * mixed together so all sides of a Zoom/Teams/Meet call get recorded.
   */
  meetingHotkey: string
  /**
   * True after the user has acknowledged the one-time consent banner
   * informing them that recording other people's voice may require their
   * permission depending on jurisdiction. Once true, never re-prompted.
   */
  meetingConsentAcknowledged: boolean

  launchOnStartup: boolean
  showTrayNotifications: boolean

  firstRun: boolean
  version: string
}

const defaults: Config = {
  voiceHotkey: 'Ctrl+Shift+Space',
  captureHotkey: 'Ctrl+Shift+S',

  aiMode: 'local',
  openaiApiKey: null,
  // llava:7b is the canonical vision model on Ollama's registry (qwen2-vl,
  // which the PRD originally specified, isn't a published Ollama model name).
  // Users can switch via Settings → AI tab once TASK-036 lands.
  ollamaModel: 'llava:7b',
  ollamaHost: 'http://localhost:11434',

  whisperModel: 'base',
  voiceLanguage: 'en',
  voiceMaxSeconds: 300,
  voiceTriggerMode: 'hold',
  voiceStreamPaste: false,

  meetingHotkey: 'Ctrl+Shift+M',
  meetingConsentAcknowledged: false,

  launchOnStartup: true,
  showTrayNotifications: true,

  firstRun: true,
  version: '1.0.0'
}

const store = new Store<Config>({
  name: 'config',
  defaults,
  clearInvalidConfig: true
})

export function getConfig(): Config {
  return store.store
}

export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  return store.get(key)
}

export function setConfig(partial: Partial<Config>): Config {
  for (const [key, value] of Object.entries(partial) as [keyof Config, Config[keyof Config]][]) {
    store.set(key, value)
  }
  return store.store
}

export function resetConfig(): Config {
  store.clear()
  for (const [key, value] of Object.entries(defaults) as [keyof Config, Config[keyof Config]][]) {
    store.set(key, value)
  }
  return store.store
}

export function getStorePath(): string {
  return store.path
}
