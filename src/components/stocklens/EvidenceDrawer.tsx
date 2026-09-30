"use client"

import { useEffect, useRef, useState } from "react"

import type { MetricResult } from "@/lib/metrics/types"
import type { Evidence } from "@/lib/evidence/types"
import { formatMetricValue } from "@/lib/presentation/formatters"
import { CONFIDENCE_LABEL, CONFIDENCE_TOOLTIP, EvidenceSignalBadge, EvidenceTypeBadge } from "./badges"
import { FollowupSection } from "./FollowupSection"
import { InterpretationCaution } from "./EventPanel"

// Evidence Drawer（Task 05 §27–41）：证据钻取主入口。
// - inference：依据事实（basedOn 可点击下钻，带返回）；
// - 关联指标：MetricResult 原值/口径/来源（来自后端 metrics，前端不重算）；
// - unknown：为什么暂时无法验证；不渲染空的指标区域。

function MetricDetail({ metric }: { metric: MetricResult }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-zinc-800">{metric.name}</span>
        <span className="font-mono text-lg font-semibold text-zinc-900">
          {formatMetricValue(metric)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500">
        <span>当前期：{metric.period ?? "—"}</span>
        {metric.comparisonPeriod && <span>比较期：{metric.comparisonPeriod}</span>}
        <span>单位：{metric.unit}</span>
        {typeof metric.sampleSize === "number" && <span>有效样本：n={metric.sampleSize}</span>}
      </div>
      {metric.interpretationNote && (
        <p className="mt-1.5 rounded border border-amber-200 bg-amber-50/70 p-2 text-xs leading-relaxed text-amber-800">
          ⚠ {metric.interpretationNote}
        </p>
      )}
      <div className="mt-2">
        <div className="text-xs font-medium text-zinc-500">计算口径</div>
        <p className="mt-0.5 font-mono text-xs leading-relaxed text-zinc-600">{metric.calculationMethod}</p>
      </div>
      {metric.sourceFields.length > 0 && (
        <details className="mt-2 text-xs text-zinc-500">
          <summary className="cursor-pointer select-none font-medium text-indigo-600 hover:text-indigo-700">
            查看技术口径
          </summary>
          <ul className="mt-1 space-y-1">
            {metric.sourceFields.map((sf, i) => (
              <li key={i} className="font-mono">
                {sf.source} · {sf.domain} · {sf.field}
                {sf.period ? ` · ${sf.period}` : sf.date ? ` · ${sf.date}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function EvidenceDrawer({
  evidenceId,
  allEvidence,
  metrics,
  stockCode,
  seedQuestion,
  onClose,
}: {
  evidenceId: string | null
  allEvidence: Evidence[]
  metrics: MetricResult[]
  stockCode: string
  /** 从「继续研究」带入的预填问题（Task 11 §28） */
  seedQuestion?: string
  onClose: () => void
}) {
  // 钻取栈：当前证据 + 返回历史；切换目标证据时重置
  const [stack, setStack] = useState<string[]>([])
  const lastTarget = useRef<string | null>(null)

  useEffect(() => {
    if (evidenceId && lastTarget.current !== evidenceId) {
      lastTarget.current = evidenceId
      setStack([evidenceId])
    }
    if (!evidenceId) lastTarget.current = null
  }, [evidenceId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (stack.length > 1) setStack((s) => s.slice(0, -1))
        else onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [stack.length, onClose])

  if (!evidenceId) return null

  const byId = new Map(allEvidence.map((e) => [e.evidenceId, e] as const))
  const current = byId.get(stack[stack.length - 1] ?? evidenceId)
  if (!current) return null

  const basedOnList: { evidence: Evidence }[] = current.basedOn
    .map((id) => ({ evidence: byId.get(id) }))
    .filter((x): x is { evidence: Evidence } => Boolean(x.evidence))
  const brokenRefs = current.basedOn.length - basedOnList.length
  const linkedMetrics = current.metricIds
    .map((id) => metrics.find((m) => m.metricId === id))
    .filter((m): m is MetricResult => Boolean(m))
  const missingMetrics = current.type !== "unknown" && linkedMetrics.length < current.metricIds.length

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`证据详情：${current.title}`}>
      <button
        type="button"
        aria-label="关闭证据详情"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-zinc-900/30"
      />
      <aside className="absolute inset-x-0 bottom-0 flex h-[92vh] flex-col rounded-t-2xl border border-zinc-200 bg-white shadow-xl sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:w-[480px] sm:rounded-none sm:rounded-l-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-4">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900">{current.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <EvidenceTypeBadge type={current.type} />
              <EvidenceSignalBadge signal={current.signal} />
              <span
                title={CONFIDENCE_TOOLTIP[current.confidence]}
                className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-600"
              >
                {CONFIDENCE_LABEL[current.confidence]}置信度
              </span>
              <span className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-600">
                {current.verifyStatus === "verified" ? "已验证" : "未验证"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {stack.length > 1 && (
            <button
              type="button"
              onClick={() => setStack((s) => s.slice(0, -1))}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              ← 返回上一条证据
            </button>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">证据说明</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{current.statement}</p>
            <div className="mt-2">
              <InterpretationCaution flags={current.interpretationFlags} note={current.interpretationNote} />
            </div>
          </section>

          {current.type === "inference" && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">依据事实</h3>
              <div className="mt-2 space-y-2">
                {basedOnList.map(({ evidence }) => (
                  <button
                    key={evidence.evidenceId}
                    type="button"
                    onClick={() => setStack((s) => [...s, evidence.evidenceId])}
                    className="block w-full rounded-lg border border-zinc-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <div className="text-sm font-medium text-zinc-800">{evidence.title}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">{evidence.statement}</div>
                  </button>
                ))}
                {brokenRefs > 0 && (
                  <p className="text-xs text-amber-600">部分引用证据暂不可用（{brokenRefs} 条）。</p>
                )}
                {basedOnList.length === 0 && brokenRefs === 0 && (
                  <p className="text-xs text-zinc-400">该推断未登记依据事实。</p>
                )}
              </div>
            </section>
          )}

          {current.type === "unknown" ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                为什么暂时无法验证？
              </h3>
              {current.unavailableReason && (
                <p className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-600">
                  {current.unavailableReason}
                </p>
              )}
              {!current.unavailableReason && (
                <p className="mt-1.5 text-sm text-zinc-500">当前信息不足，尚未完成验证。</p>
              )}
            </section>
          ) : (
            linkedMetrics.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">关联指标</h3>
                <div className="mt-2 space-y-2">
                  {linkedMetrics.map((m) => (
                    <MetricDetail key={m.metricId} metric={m} />
                  ))}
                </div>
                {missingMetrics && (
                  <p className="mt-2 text-xs text-amber-600">部分关联指标暂不可用。</p>
                )}
              </section>
            )
          )}

          <FollowupSection
            stockCode={stockCode}
            seedQuestion={seedQuestion}
            focusEvidence={current}
            focusEvidenceIds={[...current.basedOn, ...current.metricIds.map((id) => {
              // 关联指标对应的证据（同指标的 fact 证据）作为追问上下文
              return allEvidence.find((e) => e.metricIds.includes(id) && e.type === "fact")?.evidenceId ?? ""
            }).filter(Boolean)]}
            onOpenEvidence={(id) => setStack((s) => (s[s.length - 1] === id ? s : [...s, id]))}
          />
        </div>
      </aside>
    </div>
  )
}
