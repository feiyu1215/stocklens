import type { EvidenceSignal, EvidenceType } from "@/lib/evidence/types"

// Type 与 Signal 视觉区分（Task 05 §20）：
// type 回答「这是什么性质的信息」→ 描边徽章（形状语言）；
// signal 回答「它呈现什么方向」→ 色点徽章（颜色语言，克制、非证券红绿）。

const TYPE_META: Record<EvidenceType, { label: string; cls: string }> = {
  fact: { label: "事实", cls: "border-sky-300 text-sky-700 bg-sky-50/60" },
  inference: { label: "分析推断", cls: "border-violet-300 text-violet-700 bg-violet-50/60" },
  unknown: { label: "待验证", cls: "border-zinc-300 text-zinc-600 bg-zinc-50" },
}

const SIGNAL_META: Record<EvidenceSignal, { label: string; dot: string; cls: string }> = {
  positive: { label: "积极", dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  negative: { label: "承压", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  conflict: { label: "矛盾", dot: "bg-rose-500", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  neutral: { label: "中性", dot: "bg-zinc-400", cls: "bg-zinc-50 text-zinc-600 border-zinc-200" },
  unknown: { label: "未知", dot: "bg-zinc-300", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" },
}

export function EvidenceTypeBadge({ type }: { type: EvidenceType }) {
  const meta = TYPE_META[type]
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

export function EvidenceSignalBadge({ signal }: { signal: EvidenceSignal }) {
  const meta = SIGNAL_META[signal]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

export const CONFIDENCE_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" }

export const CONFIDENCE_TOOLTIP: Record<string, string> = {
  high: "高：直接来自结构化数据",
  medium: "中：由确定性规则组合多个已验证事实",
  low: "低：当前信息不足 / 未验证",
}
