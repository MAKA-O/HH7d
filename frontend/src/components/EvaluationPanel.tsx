import { AlertTriangle, CheckCircle2, ChevronDown, Lightbulb, MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'

import { ProgressBar, toneByScore } from '@/components/ui/ProgressBar'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { cn } from '@/lib/cn'
import { formatScore } from '@/lib/format'
import { CRITERIA_HINTS, CRITERIA_LABELS } from '@/lib/labels'
import type { EvaluationOut } from '@/lib/types'

const CRITERIA_ORDER = ['correctness', 'completeness', 'depth', 'clarity']

/** Панель ИИ-оценки ответа: интегральный балл, 4 критерия, сильные стороны, пробелы, эталон. */
export function EvaluationPanel({ evaluation }: { evaluation: EvaluationOut }) {
  const [idealOpen, setIdealOpen] = useState(false)

  const criteria = CRITERIA_ORDER.map((key) => ({
    key,
    label: CRITERIA_LABELS[key] ?? key,
    hint: CRITERIA_HINTS[key] ?? '',
    value: typeof evaluation.criteria[key] === 'number' ? evaluation.criteria[key] : null,
  }))

  const extraCriteria = Object.entries(evaluation.criteria)
    .filter(([key]) => !CRITERIA_ORDER.includes(key))
    .map(([key, value]) => ({ key, label: key, hint: '', value }))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 justify-center sm:block">
          <ScoreRing score={evaluation.score} size={88} label="оценка ИИ" />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          {[...criteria, ...extraCriteria].map((criterion) => (
            <div key={criterion.key}>
              <ProgressBar
                label={criterion.label}
                valueLabel={criterion.value == null ? '—' : formatScore(criterion.value)}
                value={criterion.value == null ? 0 : (criterion.value / 10) * 100}
                tone={toneByScore(criterion.value)}
                size="sm"
              />
              {criterion.hint ? <p className="mt-0.5 text-12 text-fg-3">{criterion.hint}</p> : null}
            </div>
          ))}
        </div>
      </div>

      {evaluation.strengths.length > 0 || evaluation.gaps.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-12 font-semibold uppercase tracking-wide text-positive">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Сильные стороны
            </p>
            {evaluation.strengths.length > 0 ? (
              <ul className="space-y-1.5">
                {evaluation.strengths.map((item, index) => (
                  <li key={index} className="flex gap-2 text-13 leading-relaxed text-fg-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-positive" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-13 text-fg-3">Не выделены</p>
            )}
          </div>

          <div className="rounded-md border border-line p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-12 font-semibold uppercase tracking-wide text-caution">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Что доработать
            </p>
            {evaluation.gaps.length > 0 ? (
              <ul className="space-y-1.5">
                {evaluation.gaps.map((item, index) => (
                  <li key={index} className="flex gap-2 text-13 leading-relaxed text-fg-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-caution" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-13 text-fg-3">Пробелов не найдено</p>
            )}
          </div>
        </div>
      ) : null}

      {evaluation.recommendation ? (
        <div className="flex items-start gap-2.5 rounded-md border border-line bg-surface-2 p-3.5">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <p className="text-12 font-semibold uppercase tracking-wide text-fg-2">Рекомендация</p>
            <p className="mt-1 text-13 leading-relaxed text-fg">{evaluation.recommendation}</p>
          </div>
        </div>
      ) : null}

      {evaluation.follow_up_question ? (
        <div className="flex items-start gap-2.5 rounded-md border border-line bg-surface-2 p-3.5">
          <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" aria-hidden="true" />
          <div>
            <p className="text-12 font-semibold uppercase tracking-wide text-fg-2">Уточняющий вопрос</p>
            <p className="mt-1 text-13 leading-relaxed text-fg">{evaluation.follow_up_question}</p>
          </div>
        </div>
      ) : null}

      {evaluation.ideal_answer ? (
        <div className="rounded-md border border-line">
          <button
            type="button"
            onClick={() => setIdealOpen((value) => !value)}
            aria-expanded={idealOpen}
            className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-2"
          >
            <span className="text-13 font-medium text-fg">Эталонный ответ</span>
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-fg-3 transition-transform', idealOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {idealOpen ? (
            <div className="border-t border-line px-3.5 py-3">
              <p className="whitespace-pre-wrap text-13 leading-relaxed text-fg-2">{evaluation.ideal_answer}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
