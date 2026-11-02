import { AlertTriangle, CheckCircle2, ChevronDown, Lightbulb, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { ProgressBar, toneByScore } from '@/components/ui/ProgressBar'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { formatScore } from '@/lib/format'
import { CRITERIA_HINTS, CRITERIA_LABELS } from '@/lib/labels'
import type { EvaluationOut } from '@/lib/types'

const CRITERIA_ORDER = ['correctness', 'completeness', 'depth', 'clarity']

/** Панель ИИ-оценки ответа: балл, 4 критерия, сильные стороны, пробелы, эталон. */
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
    <div className="space-y-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-1 sm:w-32">
          <ScoreRing score={evaluation.score} size={104} />
          <p className="text-[11px] uppercase tracking-wider text-slate-500">оценка ИИ</p>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {[...criteria, ...extraCriteria].map((criterion) => (
            <div key={criterion.key}>
              <ProgressBar
                label={criterion.label}
                valueLabel={criterion.value == null ? '—' : formatScore(criterion.value)}
                value={criterion.value == null ? 0 : (criterion.value / 10) * 100}
                tone={toneByScore(criterion.value)}
                size="sm"
              />
              {criterion.hint ? <p className="mt-0.5 text-[11px] text-slate-600">{criterion.hint}</p> : null}
            </div>
          ))}
        </div>
      </div>

      {evaluation.strengths.length > 0 || evaluation.gaps.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {evaluation.strengths.length > 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Сильные стороны
              </p>
              <ul className="space-y-1.5">
                {evaluation.strengths.map((item, index) => (
                  <li key={index} className="flex gap-1.5 text-xs leading-relaxed text-emerald-100/80">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {evaluation.gaps.length > 0 ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Что доработать
              </p>
              <ul className="space-y-1.5">
                {evaluation.gaps.map((item, index) => (
                  <li key={index} className="flex gap-1.5 text-xs leading-relaxed text-amber-100/80">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {evaluation.recommendation ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-accent-400/20 bg-accent-500/[0.06] p-3.5">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-300">Рекомендация</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{evaluation.recommendation}</p>
          </div>
        </div>
      ) : null}

      {evaluation.follow_up_question ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-violet-400/25 bg-violet-500/[0.07] p-3.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Дополнительный вопрос ИИ</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{evaluation.follow_up_question}</p>
          </div>
        </div>
      ) : null}

      {evaluation.ideal_answer ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setIdealOpen((value) => !value)}
            aria-expanded={idealOpen}
            className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
          >
            <span className="text-sm font-medium text-slate-200">Эталонный ответ</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-500 transition ${idealOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {idealOpen ? (
            <div className="border-t border-white/5 px-3.5 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{evaluation.ideal_answer}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
