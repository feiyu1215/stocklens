"use client"

import { useState } from "react"

import type { DiagnosisSynthesis } from "@/lib/ai/types"
import type { Evidence } from "@/lib/evidence/types"

// AI 综合区（Task 05 §15–16/§42–44）：
// Summary 标注「基于当前证据」（不是 AI 结论/投资结论）；
// 每条 statement 带可点击证据锚点；AI 文本区与结构化证据卡视觉不同。

function GroundedLine({
  text,
  evidenceIds,
  onOpenEvidence,
}: {
  text: string
  evidenceIds: string[]
  onOpenEvidence: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm leading-relaxed text-zinc-700">{text}</p>
      {evidenceIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {evidenceIds.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => onOpenEvidence(id)}
              aria-label={`查看依据证据 ${i + 1}`}
              title={id}
              className="rounded border border-indigo-200 bg-indigo-50/70 px-1.5 py-0.5 font-mono text-[11px] text-indigo-600 transition hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              证据 {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GroundedSection({
  title,
  statements,
  onOpenEvidence,
}: {
  title: string
  statements: DiagnosisSynthesis["confirmedFacts"]
  onOpenEvidence: (id: string) => void
}) {
  if (statements.length === 0) return null
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      <div className="mt-2 space-y-3">
        {statements.map((s, i) => (
          <GroundedLine key={i} text={s.text} evidenceIds={s.evidenceIds} onOpenEvidence={onOpenEvidence} />
        ))}
      </div>
    </div>
  )
}

export function DiagnosisSummary({
  synthesis,
  onOpenEvidence,
}: {
  synthesis: DiagnosisSynthesis
  onOpenEvidence: (id: string) => void
}) {
  const [showRefs, setShowRefs] = useState(false)

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">当前状态</h2>
        <span className="rounded-full border border-indigo-200 bg-indigo-50/70 px-2 py-0.5 text-xs font-medium text-indigo-600">
          基于当前证据
        </span>
      </div>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-zinc-800">
        {synthesis.summary.text}
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowRefs((v) => !v)}
          aria-expanded={showRefs}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          依据 {synthesis.summary.evidenceIds.length} 条证据 {showRefs ? "↑" : "→"}
        </button>
        {showRefs && (
          <div className="flex flex-wrap gap-1.5">
            {synthesis.summary.evidenceIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onOpenEvidence(id)}
                title={id}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-500 transition hover:border-indigo-300 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {id}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 space-y-5 border-t border-zinc-100 pt-5">
        <GroundedSection title="可以确认" statements={synthesis.confirmedFacts} onOpenEvidence={onOpenEvidence} />
        <GroundedSection title="基于证据的分析" statements={synthesis.analysisInferences} onOpenEvidence={onOpenEvidence} />
        <GroundedSection title="当前还不能确认" statements={synthesis.unknowns} onOpenEvidence={onOpenEvidence} />
        {synthesis.nextQuestions.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">值得继续研究</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-600">
              {synthesis.nextQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

export function SummaryAnchorList({
  evidenceIds,
  evidence,
  onOpenEvidence,
}: {
  evidenceIds: string[]
  evidence: Evidence[]
  onOpenEvidence: (id: string) => void
}) {
  const byId = new Map(evidence.map((e) => [e.evidenceId, e] as const))
  return (
    <div className="flex flex-wrap gap-1.5">
      {evidenceIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpenEvidence(id)}
          title={byId.get(id)?.title ?? id}
          className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-500 transition hover:border-indigo-300 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {byId.get(id)?.title ?? id}
        </button>
      ))}
    </div>
  )
}
