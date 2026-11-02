import { ChevronDown } from 'lucide-react'
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '@/lib/cn'

const CONTROL_CLASSES =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-accent-400/60 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-accent-400/25 disabled:cursor-not-allowed disabled:opacity-60'

interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  htmlFor?: string
  required?: boolean
  children: ReactNode
  className?: string
}

/** Обёртка поля: подпись, подсказка и сообщение об ошибке. */
export function Field({ label, hint, error, htmlFor, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-medium text-slate-300">
          {label}
          {required ? <span className="text-rose-400">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-rose-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  icon?: ReactNode
  rightSlot?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, icon, rightSlot, ...rest },
  ref,
) {
  return (
    <div className="relative">
      {icon ? (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
      ) : null}
      <input
        ref={ref}
        className={cn(
          CONTROL_CLASSES,
          'h-11 px-3.5',
          icon ? 'pl-10' : undefined,
          rightSlot ? 'pr-11' : undefined,
          invalid && 'border-rose-500/50 focus:border-rose-400/70 focus:ring-rose-400/25',
          className,
        )}
        {...rest}
      />
      {rightSlot ? <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span> : null}
    </div>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        CONTROL_CLASSES,
        'min-h-32 resize-y px-3.5 py-3 leading-relaxed',
        invalid && 'border-rose-500/50 focus:border-rose-400/70 focus:ring-rose-400/25',
        className,
      )}
      {...rest}
    />
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          CONTROL_CLASSES,
          'h-11 appearance-none px-3.5 pr-10',
          invalid && 'border-rose-500/50 focus:border-rose-400/70 focus:ring-rose-400/25',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        aria-hidden="true"
      />
    </div>
  )
})
