import { useEffect, useState } from 'react'
import { useIPC } from '../../hooks/useIPC'
import { VoiceTab } from './tabs/VoiceTab'
import { AITab } from './tabs/AITab'
import { HotkeysTab } from './tabs/HotkeysTab'
import { AppTab } from './tabs/AppTab'

const TABS = ['Hotkeys', 'AI', 'Voice', 'App'] as const
type Tab = (typeof TABS)[number]

export function Settings(): JSX.Element {
  const [active, setActive] = useState<Tab>('Hotkeys')
  const ipc = useIPC()

  // Honor "open Settings → AI" requests from other windows (e.g. the result
  // panel's "Add OpenAI key" button) by switching the active tab.
  useEffect(() => {
    const off = ipc.settings.onFocusTab((tab) => {
      if ((TABS as readonly string[]).includes(tab)) {
        setActive(tab as Tab)
      }
    })
    return off
  }, [ipc])

  return (
    <div className="bg-bg-base text-text-primary font-body min-h-screen flex flex-col">
      {/* Window chrome already shows "ScreenSpeak Settings" — keep the in-window
          header lean to avoid duplicating that text. */}
      <header className="px-6 pt-6 pb-3 border-b border-border">
        <h1 className="text-lg font-heading font-semibold">Settings</h1>
      </header>

      <nav className="flex border-b border-border px-3" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => {
          const isActive = tab === active
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab)}
              className={[
                'px-4 py-3 text-sm transition-colors duration-fast outline-none',
                'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
                isActive
                  ? 'text-text-primary border-b-2 border-primary -mb-px'
                  : 'text-text-muted hover:text-text-primary'
              ].join(' ')}
            >
              {tab}
            </button>
          )
        })}
      </nav>

      <main role="tabpanel" aria-label={active} className="flex-1 px-6 py-6 overflow-y-auto">
        {active === 'Voice' ? (
          <VoiceTab />
        ) : active === 'AI' ? (
          <AITab />
        ) : active === 'Hotkeys' ? (
          <HotkeysTab />
        ) : (
          <AppTab />
        )}
      </main>
    </div>
  )
}
