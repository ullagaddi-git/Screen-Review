// Meeting recording orchestrator. Captures mic + system audio mixed,
// streams transcription chunks into an internal buffer (NOT pasted into
// active app — meeting transcripts go to a file, not into your editor),
// and at stop saves a .txt transcript to:
//
//   %USERPROFILE%\Documents\ScreenSpeak\meetings\meeting-YYYYMMDD-HHMM.txt
//
// State machine:
//   'idle' → start() → 'recording' → stop() → 'saving' → 'idle'
//
// At most one meeting at a time. Calling start() while recording is a
// no-op. Calling stop() while idle is a no-op.

import { app, Notification, shell } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { audioService } from './audio'
import { streamTranscribeService } from './stream-transcribe'
import {
  formatMeetingFilename,
  serializeTranscript
} from './meeting-helpers'
import { getConfigValue, setConfig } from './store'
import { log, logError } from './logger'
import {
  closeLiveTranscriptPanel,
  notifyTranscriptSaved,
  openLiveTranscriptPanel
} from '../windows/live-transcript-panel'

export type MeetingState = 'idle' | 'recording' | 'saving'

type StateListener = (state: MeetingState, info?: { filePath?: string }) => void

class MeetingService {
  private state: MeetingState = 'idle'
  private listeners: StateListener[] = []
  /** When this meeting started — used to format the save filename. */
  private startedAt: Date | null = null

  getState(): MeetingState {
    return this.state
  }

  onStateChange(handler: StateListener): () => void {
    this.listeners.push(handler)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== handler)
    }
  }

  private setState(state: MeetingState, info?: { filePath?: string }): void {
    this.state = state
    for (const l of this.listeners) {
      try {
        l(state, info)
      } catch {
        /* ignore listener errors */
      }
    }
  }

  /**
   * Has the user already acknowledged the recording-consent toast? Used
   * by callers to know whether to show it (don't badger every time).
   */
  hasConsentAcknowledged(): boolean {
    return !!getConfigValue('meetingConsentAcknowledged')
  }

  /** Persist the consent acknowledgement so we never re-prompt. */
  acknowledgeConsent(): void {
    setConfig({ meetingConsentAcknowledged: true })
  }

  /**
   * Begin a meeting recording. Forwards to audioService with the meeting
   * flag, which:
   *   - Captures mic + system audio mixed (via getDisplayMedia loopback)
   *   - Streams chunks to stream-transcribe with sink='meeting'
   *   - Does NOT auto-end the session at stop — we drain it here.
   */
  async start(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.state !== 'idle') {
      return { ok: false, error: `meeting already ${this.state}` }
    }
    try {
      this.startedAt = new Date()
      log('info', '[meeting] start')
      await audioService.startRecording({ forceMeeting: true })
      // Open the live transcript panel so the user can SEE chunks as
      // they arrive and copy them out for use in other apps during the
      // meeting (notes, replies, etc.).
      openLiveTranscriptPanel()
      this.setState('recording')
      return { ok: true }
    } catch (err) {
      this.startedAt = null
      logError('[meeting] start failed', err)
      return { ok: false, error: (err as Error).message }
    }
  }

  /**
   * Stop the active meeting recording. Drains the transcription queue,
   * serializes the chunks into a .txt file, and surfaces a tray
   * notification with the saved path. Idempotent — calling on idle
   * returns immediately.
   */
  async stop(): Promise<
    { ok: true; filePath: string } | { ok: false; error: string }
  > {
    if (this.state !== 'recording') {
      return { ok: false, error: 'no active meeting' }
    }
    this.setState('saving')
    log('info', '[meeting] stop — draining transcription')

    try {
      // Stop audio capture — the recorder will flush its residual chunk
      // via recorder:audio which audio.ts forwards into stream-transcribe.
      await audioService.stopRecording()

      // Drain the queue and collect all transcribed chunks.
      const chunks = await streamTranscribeService.endSession()
      log('info', `[meeting] drained ${chunks.length} chunks`)

      // Save the transcript.
      const startedAt = this.startedAt ?? new Date()
      const filePath = this.writeTranscriptFile(startedAt, chunks)

      this.setState('idle', { filePath })
      this.startedAt = null

      // Let the live transcript panel know we've saved — it shows the
      // file path + Open File button. We don't auto-close the panel
      // because the user may want to copy parts of the transcript out
      // post-meeting; they close it manually.
      notifyTranscriptSaved(filePath)

      // Tray notification — let the user open the file from their notification.
      try {
        const n = new Notification({
          title: 'Meeting transcript saved',
          body: `Click to open the file in Explorer.`,
          silent: false
        })
        n.on('click', () => {
          void shell.showItemInFolder(filePath)
        })
        n.show()
      } catch {
        // Notifications can fail in some Windows configs; the file is saved either way.
      }

      return { ok: true, filePath }
    } catch (err) {
      logError('[meeting] stop failed', err)
      this.setState('idle')
      this.startedAt = null
      // Close the live transcript panel on failure — leaving it open
      // with a stale "Recording" state would confuse the user.
      closeLiveTranscriptPanel()
      return { ok: false, error: (err as Error).message }
    }
  }

  /** Open the meetings folder in Explorer (creates it if missing). */
  openMeetingsFolder(): void {
    const folder = this.getMeetingsFolder()
    try {
      mkdirSync(folder, { recursive: true })
    } catch {
      /* best effort */
    }
    void shell.openPath(folder)
  }

  /**
   * Computes the save folder. Ensures it exists. Defaults to
   * `%USERPROFILE%\Documents\ScreenSpeak\meetings`.
   */
  getMeetingsFolder(): string {
    return join(app.getPath('documents'), 'ScreenSpeak', 'meetings')
  }

  private writeTranscriptFile(date: Date, chunks: string[]): string {
    const folder = this.getMeetingsFolder()
    if (!existsSync(folder)) {
      mkdirSync(folder, { recursive: true })
    }
    const { txtName } = formatMeetingFilename(date)
    const fullPath = join(folder, txtName)
    const body = serializeTranscript(chunks)
    // Include a brief header so the file is self-describing — useful when
    // the user opens it weeks later and forgets the filename convention.
    const header = `# ScreenSpeak meeting transcript\n# ${date.toLocaleString()}\n# ${chunks.length} chunks\n\n`
    writeFileSync(fullPath, header + body, 'utf-8')
    log('info', `[meeting] wrote transcript to ${fullPath}`)
    return fullPath
  }
}

export const meetingService = new MeetingService()
