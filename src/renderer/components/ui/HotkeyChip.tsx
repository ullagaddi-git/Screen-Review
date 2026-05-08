import { clsx } from 'clsx'

export interface HotkeyChipProps {
  hotkey: string
  className?: string
}

export function HotkeyChip({ hotkey, className }: HotkeyChipProps): JSX.Element {
  return (
    <span
      className={clsx(
        'inline-flex items-center bg-surface-3 border border-border rounded-sm',
        'px-2 py-0.5 text-xs font-mono text-text-primary',
        className
      )}
    >
      {hotkey}
    </span>
  )
}
