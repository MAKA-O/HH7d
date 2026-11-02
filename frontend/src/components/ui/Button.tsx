import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-hover',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface-2 active:bg-surface-2',
  outline: 'border border-line bg-transparent text-fg hover:bg-surface-2 active:bg-surface-2',
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg active:bg-surface-2',
  danger: 'border border-negative/25 bg-negative-soft text-negative hover:border-negative/40 hover:bg-negative/10',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-13',
  md: 'h-10 px-4 text-14',
  lg: 'h-11 px-5 text-14',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

/** Основная кнопка: 5 вариантов, 3 размера, высота ≥40px (цель нажатия). */
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
      className={cn(BASE, VARIANT_CLASSES[variant], SIZE_CLASSES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Доступное имя действия (обязательно, т.к. кнопка без текста). */
  label: string
  variant?: 'ghost' | 'secondary' | 'danger'
}

const ICON_VARIANT_CLASSES: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  secondary: 'border border-line bg-surface text-fg-2 hover:bg-surface-2 hover:text-fg',
  danger: 'text-fg-3 hover:bg-negative-soft hover:text-negative',
}

/** Квадратная иконка-кнопка 40×40px. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
        ICON_VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
