import { useEffect, useState } from 'react'
import { Activity, ExternalLink, RefreshCw } from 'lucide-react'
import { useIPC } from '../../../hooks/useIPC'
import { Button, StatusDot } from '../../../components/ui'

const GITHUB_URL = 'https://github.com/ullagaddi-git/screenshpeak'

interface AppInfo {
  version: string
  isPackaged: boolean
  loginItemEnabled: boolean
}

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; message?: string }
  | { kind: 'available'; version?: string; message?: string }
  | { kind: 'unavailable'; message?: string }
  | { kind: 'error'; message?: string }

interface MemorySnapshot {
  mainProcessMB: number
  rendererMB: number
  otherMB: number
  totalMB: number
  liveWindowCount: number
  meetsIdleTarget: boolean
}

export function AppTab(): JSX.Element {
  const ipc = useIPC()

  const [launchOnStartup, setLaunchOnStartup] = useState(false)
  const [showTrayNotifications, setShowTrayNotifications] = useState(true)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: 'idle' })
  const [memory, setMemory] = useState<MemorySnapshot | null>(null)
  const [memoryRefreshing, setMemoryRefreshing] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([ipc.settings.get(), ipc.app.getInfo()]).then(([cfg, info]) => {
      if (!mounted) return
      setLaunchOnStartup(cfg.launchOnStartup)
      setShowTrayNotifications(cfg.showTrayNotifications)
      setAppInfo(info)
    })
    return () => {
      mounted = false
    }
  }, [ipc])

  const handleStartupToggle = async (checked: boolean): Promise<void> => {
    setLaunchOnStartup(checked)
    await ipc.settings.set({ launchOnStartup: checked })
    // Refresh appInfo so the live "registered with Windows" status updates.
    const info = await ipc.app.getInfo()
    setAppInfo(info)
  }

  const handleNotificationsToggle = async (checked: boolean): Promise<void> => {
    setShowTrayNotifications(checked)
    await ipc.settings.set({ showTrayNotifications: checked })
  }

  const handleCheckUpdates = async (): Promise<void> => {
    setUpdateState({ kind: 'checking' })
    try {
      const r = await ipc.app.checkForUpdates()
      setUpdateState({
        kind: r.status,
        message: r.message,
        ...(r.version ? { version: r.version } : {})
      } as UpdateState)
    } catch (err) {
      setUpdateState({ kind: 'error', message: (err as Error).message })
    }
  }

  const handleOpenGithub = (): void => {
    void ipc.openExternal(GITHUB_URL)
  }

  const handleRefreshMemory = async (): Promise<void> => {
    setMemoryRefreshing(true)
    try {
      const snap = await ipc.app.getMemory()
      setMemory(snap)
    } finally {
      setMemoryRefreshing(false)
    }
  }

  // Auto-load memory on first mount; user can hit Refresh to re-poll.
  useEffect(() => {
    void handleRefreshMemory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startupStatus =
    appInfo === null
      ? null
      : launchOnStartup === appInfo.loginItemEnabled
        ? null // matches — no need to surface drift
        : appInfo.loginItemEnabled
          ? {
              kind: 'warning' as const,
              text: 'Setting says off but Windows still has it registered. Toggle to sync.'
            }
          : {
              kind: 'warning' as const,
              text: 'Setting says on but Windows registration is missing. Toggle to re-register.'
            }

  return (
    <div className="space-y-6">
      {/* Startup */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Startup</h2>
          <p className="text-xs text-text-muted mt-1">
            ScreenSpeak runs in the tray and is most useful when always available.
          </p>
        </header>

        <label className="flex items-start gap-3 p-3 rounded border border-border bg-surface-2 cursor-pointer hover:bg-surface-3 transition-colors duration-fast">
          <input
            type="checkbox"
            checked={launchOnStartup}
            onChange={(e) => handleStartupToggle(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <div className="flex-1">
            <div className="text-sm text-text-primary font-medium">
              Launch ScreenSpeak when Windows starts
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              Hides the Settings window on launch — only the tray icon appears.
            </div>
          </div>
        </label>

        {startupStatus ? (
          <StatusDot status={startupStatus.kind} label={startupStatus.text} />
        ) : null}
      </section>

      {/* Notifications */}
      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Notifications</h2>
        </header>
        <label className="flex items-start gap-3 p-3 rounded border border-border bg-surface-2 cursor-pointer hover:bg-surface-3 transition-colors duration-fast">
          <input
            type="checkbox"
            checked={showTrayNotifications}
            onChange={(e) => handleNotificationsToggle(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <div className="flex-1">
            <div className="text-sm text-text-primary font-medium">
              Show tray notifications
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              Capture-saved confirmations, transcription errors, and other status
              messages. Doesn't affect the floating result panel.
            </div>
          </div>
        </label>
      </section>

      {/* Version + updates */}
      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Version</h2>
        </header>
        <div className="flex items-center justify-between bg-surface-2 border border-border rounded px-3 py-2">
          <div>
            <div className="text-sm font-mono text-text-primary">
              ScreenSpeak v{appInfo?.version ?? '…'}
            </div>
            <div className="text-xs text-text-muted">
              {appInfo
                ? appInfo.isPackaged
                  ? 'Production build'
                  : 'Development build'
                : ''}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCheckUpdates}
            disabled={updateState.kind === 'checking'}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            {updateState.kind === 'checking' ? 'Checking…' : 'Check for updates'}
          </Button>
        </div>
        {updateState.kind === 'up-to-date' ? (
          <div className="text-xs text-success px-1">✓ You're on the latest version.</div>
        ) : null}
        {updateState.kind === 'available' ? (
          <div className="text-xs text-info px-1">
            Update available {updateState.version ? `(v${updateState.version})` : ''}.{' '}
            {updateState.message}
          </div>
        ) : null}
        {updateState.kind === 'unavailable' ? (
          <div className="text-xs text-text-muted px-1">{updateState.message}</div>
        ) : null}
        {updateState.kind === 'error' ? (
          <div className="text-xs text-error px-1">{updateState.message}</div>
        ) : null}
      </section>

      {/* Memory diagnostics */}
      <section className="space-y-3 border-t border-border pt-5">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Memory usage</h2>
          {memory ? (
            <StatusDot
              status={memory.meetsIdleTarget ? 'success' : 'warning'}
              label={memory.meetsIdleTarget ? 'Within target' : 'Above target'}
            />
          ) : null}
        </header>
        <div className="flex items-center justify-between bg-surface-2 border border-border rounded px-3 py-2">
          <div>
            <div className="text-sm font-mono text-text-primary">
              {memory ? `${memory.totalMB} MB total` : '…'}
            </div>
            <div className="text-xs text-text-muted">
              {memory
                ? `main ${memory.mainProcessMB} + renderers ${memory.rendererMB} + helpers ${memory.otherMB} · ${memory.liveWindowCount} window${memory.liveWindowCount === 1 ? '' : 's'}`
                : 'Reading process metrics…'}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshMemory}
            disabled={memoryRefreshing}
            className="flex items-center gap-1.5"
          >
            <Activity size={12} />
            {memoryRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
        <p className="text-xs text-text-muted">
          Target is &lt; 200 MB at idle (no recordings or AI calls running). Open
          windows add ~25–50 MB each; they're destroyed when closed. Idle
          measurement varies ±10 MB run-to-run.
        </p>
      </section>

      {/* Project links */}
      <section className="space-y-3 border-t border-border pt-5">
        <header>
          <h2 className="text-sm font-semibold text-text-primary">Project</h2>
        </header>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenGithub}
            className="flex items-center gap-1.5"
          >
            <ExternalLink size={12} />
            View on GitHub
          </Button>
        </div>
        <p className="text-xs text-text-muted">
          ScreenSpeak is open source under the MIT license. Issues, feature requests,
          and pull requests welcome.
        </p>
      </section>
    </div>
  )
}
