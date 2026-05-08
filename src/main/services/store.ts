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
