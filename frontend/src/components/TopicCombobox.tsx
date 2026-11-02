import { ChevronDown, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { cn } from '@/lib/cn'

interface TopicComboboxProps {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  id?: string
  placeholder?: string
}

/**
 * Выбор фокус-тем: chips + автодополнение с клавиатурной навигацией.
 * Поддерживает добавление своей темы (Enter по введённому тексту).
 */
export function TopicCombobox({
  options,
  selected,
  onChange,
  id = 'focus-topics',
  placeholder = 'Добавить тему…',
}: TopicComboboxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return options
      .filter((option) => !selected.includes(option))
      .filter((option) => (needle ? option.toLowerCase().includes(needle) : true))
      .slice(0, 8)
  }, [options, query, selected])

  const trimmedQuery = query.trim()
  const canAddCustom =
    trimmedQuery.length > 0 &&
    !options.some((option) => option.toLowerCase() === trimmedQuery.toLowerCase()) &&
    !selected.some((topic) => topic.toLowerCase() === trimmedQuery.toLowerCase())

  const optionCount = suggestions.length + (canAddCustom ? 1 : 0)

  useEffect(() => {
    setActiveIndex(0)
  }, [query, suggestions.length])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const addTopic = (topic: string) => {
    const value = topic.trim()
    if (!value || selected.includes(value)) return
    onChange([...selected, value])
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  const removeTopic = (topic: string) => {
    onChange(selected.filter((item) => item !== topic))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => (optionCount === 0 ? 0 : Math.min(index + 1, optionCount - 1)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (optionCount === 0) return
      const topic = suggestions[activeIndex] ?? (canAddCustom ? trimmedQuery : undefined)
      if (topic) addTopic(topic)
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Backspace' && query === '' && selected.length > 0) {
      removeTopic(selected[selected.length - 1])
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'control flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 px-2 py-1.5',
          open && 'border-accent',
        )}
        onClick={() => {
          inputRef.current?.focus()
          setOpen(true)
        }}
      >
        {selected.map((topic) => (
          <span
            key={topic}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface-2 pl-2 pr-1 text-12 text-fg"
          >
            {topic}
            <button
              type="button"
              aria-label={`Убрать тему ${topic}`}
              onClick={(event) => {
                event.stopPropagation()
                removeTopic(topic)
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-surface hover:text-fg"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={optionCount > 0 ? `${id}-option-${activeIndex}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length > 0 ? '' : placeholder}
          className="h-7 min-w-[140px] flex-1 bg-transparent px-1 text-13 text-fg placeholder:text-fg-3 focus:outline-none"
        />

        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-fg-3" aria-hidden="true" />
      </div>

      {open ? (
        <div
          role="listbox"
          id={`${id}-listbox`}
          aria-label="Темы для фокуса"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-pop"
        >
          {suggestions.map((topic, index) => (
            <button
              key={topic}
              type="button"
              role="option"
              id={`${id}-option-${index}`}
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => addTopic(topic)}
              className={cn(
                'flex h-10 w-full items-center rounded-md px-2.5 text-left text-13 transition-colors',
                index === activeIndex ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
              )}
            >
              {topic}
            </button>
          ))}

          {canAddCustom ? (
            <button
              type="button"
              role="option"
              id={`${id}-option-${suggestions.length}`}
              aria-selected={activeIndex === suggestions.length}
              onClick={() => addTopic(trimmedQuery)}
              className={cn(
                'flex h-10 w-full items-center rounded-md px-2.5 text-left text-13 transition-colors',
                activeIndex === suggestions.length
                  ? 'bg-surface-2 text-fg'
                  : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
              )}
            >
              Добавить «{trimmedQuery}»
            </button>
          ) : null}

          {optionCount === 0 ? (
            <p className="px-2.5 py-2 text-13 text-fg-3">Все темы направления уже выбраны</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
