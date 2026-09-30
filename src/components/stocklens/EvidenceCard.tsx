"use client"

import type { Evidence } from "@/lib/evidence/types"
import { formatEvidencePeriod } from "@/lib/presentation/formatters"
import { EvidenceSignalBadge, EvidenceTypeBadge } from "./badges"

export function EvidenceCard({
  evidence,
  onOpen,
  compact = false,
}: {
  evidence: Evidence
  onOpen: (evidenceId: string) => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(evidence.evidenceId)}
      aria-label={`查看证据：${evidence.title}`}
      className="group flex h-full w-full flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <EvidenceTypeBadge type={evidence.type} />
        <EvidenceSignalBadge signal={evidence.signal} />
      </div>
      <div className="text-sm font-semibold text-zinc-900">{evidence.title}</div>
      {!compact && <p className="text-sm leading-relaxed text-zinc-600">{evidence.statement}</p>}
      <div className="mt-auto flex items-center justify-between pt-1 text-xs text-zinc-400">
        <span>
          {formatEvidencePeriod(evidence.period, evidence.comparisonPeriod)}
          {evidence.metricIds.length > 0 && ` · ${evidence.metricIds.length} 项指标`}
        </span>
        <span className="font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          查看证据 →
        </span>
      </div>
    </button>
  )
}
