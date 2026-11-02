import { ChevronDown } from 'lucide-react'
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '@/lib/cn'

interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  htmlFor?: string
  required?: boolean
  children: ReactNode
  className?: string
}

/** Обёртка поля: подпись, контрол, подсказка или ошибка. */
export function Field({ label, hint, error, htmlFor, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="flex items-center gap-1 text-13 font-medium text-fg">
          {label}
          {required ? <span className="text-negative">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-12 text-negative" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-12 text-fg-3">{hint}</p>
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
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3">{icon}</span>
      ) : null}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn('control h-10 px-3 text-14', icon ? 'pl-9' : undefined, rightSlot ? 'pr-10' : undefined, className)}
        {...rest}
      />
      {rightSlot ? <span className="absolute right-1 top-1/2 -translate-y-1/2">{rightSlot}</span> : null}
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
      aria-invalid={invalid || undefined}
      className={cn('control min-h-[96px] resize-y px-3 py-2 text-14 leading-relaxed', className)}
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
        aria-invalid={invalid || undefined}
        className={cn('control h-10 appearance-none px-3 pr-9 text-14', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
    </div>
  )
})
