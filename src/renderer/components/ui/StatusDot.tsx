import { clsx } from 'clsx'

export type StatusKind = 'success' | 'warning' | 'error' | 'info'

export interface StatusDotProps {
  status: StatusKind
  label?: string
  className?: string
}

const colorClass: Record<StatusKind, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info'
}

export function StatusDot({ status, label, className }: StatusDotProps): JSX.Element {
  return (
    <span className={clsx('inline-flex items-center', className)}>
      <span
        aria-hidden
        className={clsx('inline-block w-2 h-2 rounded-full mr-1.5', colorClass[status])}
      />
      {label ? <span className="text-xs text-text-muted">{label}</span> : null}
    </span>
  )
}
