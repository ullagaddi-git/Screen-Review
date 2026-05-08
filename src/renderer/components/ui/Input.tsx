import { clsx } from 'clsx'
import { forwardRef, type InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  password?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { password, className, type, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type={password ? 'password' : type ?? 'text'}
      className={clsx(
        'w-full bg-surface-1 text-text-primary border border-border rounded-sm',
        'px-3 py-2 text-sm font-body',
        'placeholder:text-text-muted',
        'transition-colors duration-fast',
        'focus:border-primary focus:outline-none',
        'disabled:opacity-50',
        className
      )}
      {...rest}
    />
  )
})
