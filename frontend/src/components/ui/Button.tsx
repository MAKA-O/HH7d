import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-accent-500 to-violet-500 text-white shadow-lg shadow-accent-700/30 hover:from-accent-400 hover:to-violet-400 disabled:from-accent-500/60 disabled:to-violet-500/60',
  secondary: 'border border-white/15 bg-white/5 text-slate-100 hover:border-white/25 hover:bg-white/10',
  ghost: 'text-slate-300 hover:bg-white/5 hover:text-white',
  danger: 'border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  soft: 'border border-accent-400/25 bg-accent-500/10 text-accent-200 hover:bg-accent-500/20',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 rounded-lg px-3 text-sm',
  md: 'h-11 gap-2 rounded-xl px-5 text-sm',
  lg: 'h-12 gap-2.5 rounded-xl px-6 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

/** Основная кнопка интерфейса: 5 вариантов, 3 размера, состояние загрузки. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    disabled,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
})
