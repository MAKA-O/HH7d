import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Лёгкий рендер текста от ИИ: fenced-блоки кода, **жирный** и `встроенный код`.
 * Полноценный markdown не нужен — это ответы ассистента.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  const blocks = splitCodeBlocks(text)
  return (
    <div className={cn('space-y-3 text-14 leading-relaxed text-fg', className)}>
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
        <strong key={index} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded border border-line bg-surface-2 px-1 py-0.5 font-mono text-13 text-fg"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={index}>{part}</span>
  })
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="border-b border-line bg-surface-2 px-3 py-1.5 text-12 text-fg-3">{language}</div>
      <pre className="overflow-x-auto bg-surface p-3 font-mono text-13 leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
    </div>
  )
}
