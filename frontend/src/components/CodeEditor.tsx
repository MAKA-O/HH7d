/** Простой редактор кода: textarea с моно-шрифтом и нумерацией строк. */
import { useCallback, useRef, type KeyboardEvent } from 'react'

import { cn } from '@/lib/cn'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minRows?: number
  disabled?: boolean
  className?: string
}

const LINE_HEIGHT = 'leading-6'
const FONT_SIZE = 'text-[13px]'

export function CodeEditor({
  value,
  onChange,
  placeholder = '// Напишите решение здесь',
  minRows = 14,
  disabled = false,
  className,
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  const lineCount = Math.max(minRows, value.split('\n').length)

  const syncScroll = useCallback(() => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Tab') return
      event.preventDefault()
      const textarea = event.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`
      onChange(nextValue)
      requestAnimationFrame(() => {
        textarea.selectionStart = start + 2
        textarea.selectionEnd = start + 2
      })
    },
    [onChange, value],
  )

  return (
    <div
      className={cn(
        'relative flex overflow-hidden rounded-xl border border-white/10 bg-ink-950/70 transition focus-within:border-accent-400/50 focus-within:ring-2 focus-within:ring-accent-400/20',
        disabled && 'opacity-70',
        className,
      )}
    >
      {/* Нумерация строк */}
      <div
        ref={gutterRef}
        aria-hidden="true"
        className={cn(
          'scrollbar-none shrink-0 select-none overflow-hidden border-r border-white/5 bg-white/[0.02] py-4 pr-3 pl-4 text-right font-mono text-slate-600',
          FONT_SIZE,
          LINE_HEIGHT,
        )}
        style={{ width: '3.25rem' }}
      >
        {Array.from({ length: lineCount }).map((_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={disabled}
        rows={lineCount}
        className={cn(
          'w-full resize-none bg-transparent py-4 pl-3 pr-4 font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none disabled:cursor-not-allowed',
          FONT_SIZE,
          LINE_HEIGHT,
        )}
        style={{ tabSize: 2 }}
      />
    </div>
  )
}
