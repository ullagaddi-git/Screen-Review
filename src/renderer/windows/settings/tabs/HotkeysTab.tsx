import { useEffect, useState } from 'react'
import { useIPC } from '../../../hooks/useIPC'
import { HotkeyRecorder } from '../../../components/ui'

export function HotkeysTab(): JSX.Element {
  const ipc = useIPC()
  const [voiceHotkey, setVoiceHotkey] = useState('Ctrl+Shift+Space')
  const [captureHotkey, setCaptureHotkey] = useState('Ctrl+Shift+S')

  useEffect(() => {
    let mounted = true
    ipc.settings.get().then((cfg) => {
      if (!mounted) return
      setVoiceHotkey(cfg.voiceHotkey)
      setCaptureHotkey(cfg.captureHotkey)
    })
    return () => {
      mounted = false
    }
  }, [ipc])

  const handleVoiceChange = async (combo: string): Promise<void> => {
    setVoiceHotkey(combo)
    await ipc.settings.set({ voiceHotkey: combo })
  }

  const handleCaptureChange = async (combo: string): Promise<void> => {
    setCaptureHotkey(combo)
    await ipc.settings.set({ captureHotkey: combo })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Voice dictation</h2>
          <p className="text-xs text-text-muted mt-1">
            Hold this combination while speaking. Release to transcribe and paste at
            your cursor.
          </p>
        </header>
        <HotkeyRecorder
          value={voiceHotkey}
          onChange={handleVoiceChange}
          conflictWith={{ combo: captureHotkey, label: 'Capture' }}
          label="Change voice hotkey"
        />
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Screen capture</h2>
          <p className="text-xs text-text-muted mt-1">
            Press once to open the capture mode picker (Region / Window / Desktop /
            Auto-scroll).
          </p>
        </header>
        <HotkeyRecorder
          value={captureHotkey}
          onChange={handleCaptureChange}
          conflictWith={{ combo: voiceHotkey, label: 'Voice' }}
          label="Change capture hotkey"
        />
      </section>

      <section className="space-y-2 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Tips</h2>
        </header>
        <ul className="text-xs text-text-muted space-y-1.5 list-disc list-inside">
          <li>
            Hotkeys are global — they fire even when other apps have focus.
          </li>
          <li>
            <span className="text-text-primary font-medium">Capture hotkey</span> is{' '}
            <em>consumed</em> by ScreenSpeak (uses Windows RegisterHotKey API), so
            apps like VS Code won't see <span className="font-mono">Ctrl+Shift+S</span>{' '}
            as "Save As" anymore.
          </li>
          <li>
            <span className="text-text-primary font-medium">Voice hotkey</span> is{' '}
            <em>observed but not consumed</em> (uses uiohook for hold-to-talk). If
            you bind it to a letter key (e.g. <span className="font-mono">Ctrl+Shift+J</span>),
            the focused app will <span className="text-warning">also</span> receive
            those keystrokes while you hold them — and may react to them (e.g.
            cursor moves, format changes). The default{' '}
            <span className="font-mono">Ctrl+Shift+Space</span> avoids this because
            Space + 2 modifiers is rarely bound by any app.
          </li>
          <li>
            If a combination won't register, it's likely already owned by Windows or
            another app. Try a different one.
          </li>
          <li>Press Esc while recording to cancel without changing.</li>
        </ul>
      </section>
    </div>
  )
}
