import { BrowserWindow, ipcMain } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { audioService } from '../services/audio'
import { whisperService } from '../services/whisper'
import { pasteAtCursor } from '../services/paste'
import { getConfigValue } from '../services/store'
import { hideMicIndicator, showMicIndicator } from '../windows/mic-indicator'
import { notify } from '../services/notify'
import { meetingService } from '../services/meeting'

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error'

interface ParsedHotkey {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  keycode: number
  label: string
}

interface ModifierState {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}

let currentHotkey: ParsedHotkey | null = null
let currentMeetingHotkey: ParsedHotkey | null = null
let modifiers: ModifierState = { ctrl: false, shift: false, alt: false, meta: false }
let activeRecordingHotkey: ParsedHotkey | null = null
let started = false
/**
 * When true, the voice hotkey listener still observes events (uIOhook
 * doesn't consume them) but does NOT trigger recording. Used during the
 * Settings → Hotkeys live recorder so pressing the voice combo flags a
 * conflict instead of starting an audio capture.
 */
let suspended = false

const MODIFIER_KEYCODES: Record<keyof ModifierState, number[]> = {
  ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
  shift: [UiohookKey.Shift, UiohookKey.ShiftRight],
  alt: [UiohookKey.Alt, UiohookKey.AltRight],
  meta: [UiohookKey.Meta, UiohookKey.MetaRight]
}

function parseHotkey(hotkey: string): ParsedHotkey | null {
  const parts = hotkey.split('+').map((p) => p.trim())
  if (parts.length === 0) return null

  let ctrl = false
  let shift = false
  let alt = false
  let meta = false
  let keyName: string | null = null

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') ctrl = true
    else if (lower === 'shift') shift = true
    else if (lower === 'alt') alt = true
    else if (lower === 'meta' || lower === 'cmd' || lower === 'super' || lower === 'win') meta = true
    else keyName = part
  }

  if (!keyName) return null

  const keys = UiohookKey as unknown as Record<string, number>
  const candidate =
    keys[keyName] ??
    keys[keyName.toUpperCase()] ??
    keys[keyName[0].toUpperCase() + keyName.slice(1).toLowerCase()]

  if (typeof candidate !== 'number') return null

  return { ctrl, shift, alt, meta, keycode: candidate, label: hotkey }
}

function isModifierKey(keycode: number): { mod: keyof ModifierState } | null {
  for (const mod of Object.keys(MODIFIER_KEYCODES) as (keyof ModifierState)[]) {
    if (MODIFIER_KEYCODES[mod].includes(keycode)) return { mod }
  }
  return null
}

function modifiersMatch(hotkey: ParsedHotkey, state: ModifierState): boolean {
  return (
    hotkey.ctrl === state.ctrl &&
    hotkey.shift === state.shift &&
    hotkey.alt === state.alt &&
    hotkey.meta === state.meta
  )
}

function broadcastState(state: VoiceState, extra?: Record<string, unknown>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('voice:state', { state, ...extra })
    }
  }

  if (state === 'recording' || state === 'transcribing') {
    showMicIndicator(state)
  } else {
    hideMicIndicator()
  }
}

async function handleHotkeyPress(
  hotkey: ParsedHotkey,
  options?: { forceStream?: boolean }
): Promise<void> {
  if (audioService.isRecording()) return // Already recording — ignore
  activeRecordingHotkey = hotkey
  console.log('[voice] hotkey pressed — starting recording')
  try {
    await audioService.startRecording({ forceStream: options?.forceStream })
    // Tell the mic indicator which mode this session is — different label.
    const mode = audioService.isStreamSession() ? 'streaming' : 'batch'
    broadcastState('recording', { mode })
  } catch (err) {
    console.error('[voice] startRecording failed:', err)
    activeRecordingHotkey = null
    broadcastState('error', { message: (err as Error).message })
  }
}

async function processCapturedAudio(wav: Buffer): Promise<void> {
  console.log(`[voice] processCapturedAudio: ${wav.length} bytes`)
  if (wav.length === 0) {
    // Silent / empty recording — dismiss without surfacing anything.
    broadcastState('idle')
    return
  }

  broadcastState('transcribing')

  let text: string
  try {
    text = await whisperService.transcribe(wav)
    console.log(`[voice] transcribe ok: "${text}"`)
  } catch (err) {
    const message = (err as Error).message
    console.error('[voice] transcribe failed:', err)
    broadcastState('error', { message: `Transcription error: ${message}` })
    notify('Transcription failed', message)
    return
  }

  if (!text || !text.trim()) {
    // Empty transcription (silence, mic off, etc.) — dismiss silently per PRD edge cases.
    broadcastState('idle')
    return
  }

  const result = await pasteAtCursor(text)
  if (!result.pasted) {
    // Tailor the notification depending on why paste was skipped — the
    // "you clicked Stop in Settings" case is common enough to call out
    // explicitly so the user knows where the text went.
    if (result.reason === 'own-window') {
      notify(
        'Transcript copied to clipboard',
        "Settings doesn't accept text — switch to your target app and press Ctrl+V to paste."
      )
    } else {
      notify(
        'Text copied to clipboard',
        'No active text field detected — paste with Ctrl+V when ready.'
      )
    }
  }
  broadcastState('idle', { text })
}

async function handleHotkeyRelease(): Promise<void> {
  if (!activeRecordingHotkey) return
  activeRecordingHotkey = null

  let wav: Buffer
  try {
    wav = await audioService.stopRecording()
    console.log(`[voice] stopRecording returned ${wav.length} bytes`)
  } catch (err) {
    console.error('[voice] stopRecording failed:', err)
    broadcastState('error', { message: `Recording error: ${(err as Error).message}` })
    return
  }

  await processCapturedAudio(wav)
}

/**
 * Single-tap toggle for meeting recording. If a meeting is active, stop
 * it; otherwise start one. Called from both the keyboard hotkey listener
 * and the IPC handlers (Voice tab button, tray menu item).
 */
async function toggleMeeting(): Promise<void> {
  const state = meetingService.getState()
  if (state === 'recording') {
    console.log('[voice] meeting hotkey — stopping')
    broadcastState('transcribing') // briefly, until the file is saved
    const result = await meetingService.stop()
    if (!result.ok) {
      broadcastState('error', { message: result.error })
      return
    }
    broadcastState('idle')
    return
  }
  if (state === 'idle') {
    console.log('[voice] meeting hotkey — starting')
    const result = await meetingService.start()
    if (!result.ok) {
      broadcastState('error', { message: result.error })
      return
    }
    // Reuse the voice-state broadcast so the mic indicator appears with
    // the streaming label. Pass a 'meeting' mode so the indicator can
    // show a distinct label in a future polish pass.
    broadcastState('recording', { mode: 'streaming' })
    return
  }
  // 'saving' — ignore taps while in-flight.
  console.log('[voice] meeting hotkey ignored (state=saving)')
}

async function handleAutoStop(wav: Buffer): Promise<void> {
  // Recorder hit the configured cap. Treat as if the user released the hotkey.
  if (!activeRecordingHotkey) return
  activeRecordingHotkey = null
  const maxSeconds = Number(getConfigValue('voiceMaxSeconds')) || 300
  const minutes = Math.round(maxSeconds / 60)
  const label =
    maxSeconds < 60
      ? `${maxSeconds} seconds`
      : `${minutes} minute${minutes === 1 ? '' : 's'}`

  // The notification body depends on which voice mode was active. In
  // stream mode there's nothing left to transcribe — text already
  // streamed to the user's editor — so a "transcribing what was
  // captured" message would be misleading.
  const body = audioService.isStreamSession()
    ? `Recording capped at ${label} — your dictation is already in the active app.`
    : `Recording capped at ${label} — transcribing what was captured.`
  notify('Max recording length reached', body)
  await processCapturedAudio(wav)
}

export function startVoiceHotkey(): void {
  if (started) return
  started = true

  const hotkeyStr = getConfigValue('voiceHotkey') || 'Ctrl+Shift+Space'
  currentHotkey = parseHotkey(hotkeyStr)
  if (!currentHotkey) {
    console.warn(`[voice] Could not parse voice hotkey "${hotkeyStr}" — voice disabled`)
    started = false
    return
  }

  // Meeting hotkey — toggle behavior (single tap to start, single tap to
  // stop). Independent of voice hotkey.
  const meetingHotkeyStr = getConfigValue('meetingHotkey') || 'Ctrl+Shift+M'
  currentMeetingHotkey = parseHotkey(meetingHotkeyStr)
  if (!currentMeetingHotkey) {
    console.warn(
      `[voice] Could not parse meeting hotkey "${meetingHotkeyStr}" — meeting hotkey disabled`
    )
  }

  uIOhook.on('keydown', (e) => {
    const mod = isModifierKey(e.keycode)
    if (mod) {
      modifiers[mod.mod] = true
      return
    }
    if (suspended) return

    // Meeting hotkey toggles a meeting on/off. Check this before the
    // voice hotkey because the two hotkeys must be different combos
    // (modifiersMatch guards against overlap anyway).
    if (
      currentMeetingHotkey &&
      e.keycode === currentMeetingHotkey.keycode &&
      modifiersMatch(currentMeetingHotkey, modifiers)
    ) {
      void toggleMeeting()
      return
    }

    if (!currentHotkey) return
    if (e.keycode === currentHotkey.keycode && modifiersMatch(currentHotkey, modifiers)) {
      void handleHotkeyPress(currentHotkey)
    }
  })

  uIOhook.on('keyup', (e) => {
    const mod = isModifierKey(e.keycode)
    if (mod) {
      modifiers[mod.mod] = false
    }
    if (suspended) return
    if (activeRecordingHotkey && e.keycode === activeRecordingHotkey.keycode) {
      void handleHotkeyRelease()
    }
  })

  uIOhook.start()

  audioService.setAutoStopHandler((buf) => {
    void handleAutoStop(buf)
  })
}

export function stopVoiceHotkey(): void {
  if (!started) return
  started = false
  try {
    uIOhook.stop()
  } catch {
    // ignore
  }
}

export function reloadVoiceHotkey(): void {
  const hotkeyStr = getConfigValue('voiceHotkey') || 'Ctrl+Shift+Space'
  const parsed = parseHotkey(hotkeyStr)
  if (parsed) currentHotkey = parsed

  // Meeting hotkey is reloaded alongside since they share the same
  // uIOhook listener and config-set IPC. If meeting hotkey was unset
  // or invalid, leave it null so the listener short-circuits cleanly.
  const meetingHotkeyStr = getConfigValue('meetingHotkey')
  if (meetingHotkeyStr) {
    const parsedMeeting = parseHotkey(meetingHotkeyStr)
    currentMeetingHotkey = parsedMeeting ?? null
  }
}

export function suspendVoiceHotkey(): void {
  suspended = true
}

export function resumeVoiceHotkey(): void {
  suspended = false
}

export function registerVoiceIPC(): void {
  ipcMain.handle('voice:reload-hotkey', () => {
    reloadVoiceHotkey()
    return { ok: true, hotkey: currentHotkey?.label }
  })

  ipcMain.handle('voice:state', () => {
    return audioService.isRecording() ? 'recording' : 'idle'
  })

  ipcMain.handle('voice:request-start', async () => {
    if (!currentHotkey) return { ok: false, error: 'no-hotkey-parsed' }
    await handleHotkeyPress(currentHotkey)
    return { ok: true }
  })

  // Explicit "start live streaming dictation" — overrides the global
  // voiceStreamPaste setting for this one session. Used by the dedicated
  // button in the Voice tab so the user doesn't have to mess with config
  // first. The button-side does a 3 s countdown before invoking this so
  // the user can Alt-Tab to their target app first.
  ipcMain.handle('voice:request-start-stream', async () => {
    if (!currentHotkey) return { ok: false, error: 'no-hotkey-parsed' }
    await handleHotkeyPress(currentHotkey, { forceStream: true })
    return { ok: true }
  })

  ipcMain.handle('voice:request-stop', async () => {
    await handleHotkeyRelease()
    return { ok: true }
  })

  // Meeting mode — toggle, query state, open folder, acknowledge consent.
  ipcMain.handle('meeting:toggle', async () => {
    await toggleMeeting()
    return { ok: true, state: meetingService.getState() }
  })

  ipcMain.handle('meeting:get-state', () => {
    return {
      state: meetingService.getState(),
      consentAcknowledged: meetingService.hasConsentAcknowledged()
    }
  })

  ipcMain.handle('meeting:acknowledge-consent', () => {
    meetingService.acknowledgeConsent()
    return { ok: true }
  })

  ipcMain.handle('meeting:open-folder', () => {
    meetingService.openMeetingsFolder()
    return { ok: true }
  })
}
