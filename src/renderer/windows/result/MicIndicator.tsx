import { useEffect, useState } from 'react'

type State = 'recording' | 'transcribing' | 'hidden'

const LABEL: Record<Exclude<State, 'hidden'>, string> = {
  recording: 'Recording…',
  transcribing: 'Transcribing…'
}

export function MicIndicator(): JSX.Element | null {
  const [state, setState] = useState<State>('hidden')

  useEffect(() => {
    const handler = (_event: Event, payload: { state: string }): void => {
      if (payload.state === 'recording') setState('recording')
      else if (payload.state === 'transcribing') setState('transcribing')
      else setState('hidden')
    }

    window.indicatorBridge.onState(handler)
    return () => {
      window.indicatorBridge.offState(handler)
    }
  }, [])

  if (state === 'hidden') return null

  const isRecording = state === 'recording'

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-border rounded shadow-panel select-none">
      <span
        aria-hidden
        className={[
          'inline-block w-2 h-2 rounded-full',
          isRecording ? 'bg-primary animate-mic-pulse' : 'bg-text-muted'
        ].join(' ')}
      />
      <span className="text-xs text-text-primary font-mono">{LABEL[state]}</span>
    </div>
  )
}
