import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Лёгкий рендер текста от ИИ: понимает fenced-блоки кода, **жирный**
 * и `встроенный код`. Полноценный markdown не нужен — это ответы ассистента.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  const blocks = splitCodeBlocks(text)
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed text-slate-200', className)}>
      {blocks.map((block, index) =>
        block.type === 'code' ? (
          <CodeBlock key={index} language={block.language} code={block.content} />
        ) : (
          <Paragraphs key={index} text={block.content} />
        ),
      )}
    </div>
  )
}

interface CodeBlock {
  type: 'code'
  language: string
  content: string
}

interface TextBlock {
  type: 'text'
  content: string
}

/** Разбивает текст на обычные фрагменты и блоки кода ```lang ... ```. */
function splitCodeBlocks(text: string): Array<CodeBlock | TextBlock> {
  const blocks: Array<CodeBlock | TextBlock> = []
  const pattern = /```([\w+#-]*)\r?\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) blocks.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    blocks.push({ type: 'code', language: match[1] || 'text', content: match[2].replace(/\s+$/, '') })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) blocks.push({ type: 'text', content: text.slice(lastIndex) })
  return blocks.filter((block) => block.content.trim().length > 0)
}

function Paragraphs({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((part) => part.trim().length > 0)
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap break-words">
          {renderInline(paragraph.trim())}
        </p>
      ))}
    </>
  )
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-slate-50">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={index} className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[0.85em] text-accent-200">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={index}>{part}</span>
  })
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-950/80">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500">
        <span>{language}</span>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  )
}
