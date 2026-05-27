import { useEffect, useState } from 'react'

type State = 'recording' | 'streaming' | 'transcribing' | 'hidden'

const LABEL: Record<Exclude<State, 'hidden'>, string> = {
  recording: 'Recording…',
  streaming: 'Streaming…',
  transcribing: 'Transcribing…'
}

export function MicIndicator(): JSX.Element | null {
  const [state, setState] = useState<State>('hidden')

  useEffect(() => {
    const handler = (
      _event: Event,
      payload: { state: string; mode?: string }
    ): void => {
      if (payload.state === 'recording') {
        // Stream-mode recordings show a different label so the user knows
        // text is going *directly into their app* right now, not buffered
        // for a batch paste at the end.
        setState(payload.mode === 'streaming' ? 'streaming' : 'recording')
      } else if (payload.state === 'transcribing') {
        setState('transcribing')
      } else {
        setState('hidden')
      }
    }

    window.indicatorBridge.onState(handler)
    return () => {
      window.indicatorBridge.offState(handler)
    }
  }, [])

  if (state === 'hidden') return null

  const isActive = state === 'recording' || state === 'streaming'

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-border rounded shadow-panel select-none">
      <span
        aria-hidden
        className={[
          'inline-block w-2 h-2 rounded-full',
          isActive ? 'bg-primary animate-mic-pulse' : 'bg-text-muted'
        ].join(' ')}
      />
      <span className="text-xs text-text-primary font-mono">{LABEL[state]}</span>
    </div>
  )
}
