import type { Evidence, EvidenceDimension } from "@/lib/evidence/types"

// Dimension View（Task 05 §23–26）：按维度组织证据的纯函数。
// 不生成维度评级（改善/承压/健康），只呈现证据分布（Signal 计数 + 关键证据）。

export const DIMENSION_LABELS: Record<EvidenceDimension, string> = {
  growth: "经营增长",
  profitability: "盈利能力",
  cashflow: "现金流",
  valuation: "估值",
  market: "行情",
  industry: "行业",
  risk: "风险事件",
}

export const DIMENSION_ORDER: EvidenceDimension[] = [
  "growth",
  "profitability",
  "cashflow",
  "valuation",
  "market",
  "industry",
  "risk",
]

export interface DimensionView {
  dimension: EvidenceDimension
  label: string
  hasEvidence: boolean
  counts: {
    total: number
    fact: number
    inference: number
    unknown: number
    positive: number
    negative: number
    conflict: number
    neutral: number
  }
  /** 1–2 条关键证据：conflict > negative > positive > unknown > 其余 */
  keyEvidence: Evidence[]
  evidence: Evidence[]
}

function evidenceTier(e: Evidence): number {
  if (e.signal === "conflict") return 0
  if (e.signal === "negative") return 1
  if (e.signal === "positive") return 2
  if (e.type === "unknown") return 3
  return 4
}

export function buildDimensionViews(evidence: Evidence[]): DimensionView[] {
  return DIMENSION_ORDER.map((dimension) => {
    const items = evidence.filter((e) => e.dimension === dimension)
    const counts = {
      total: items.length,
      fact: items.filter((e) => e.type === "fact").length,
      inference: items.filter((e) => e.type === "inference").length,
      unknown: items.filter((e) => e.type === "unknown").length,
      positive: items.filter((e) => e.signal === "positive").length,
      negative: items.filter((e) => e.signal === "negative").length,
      conflict: items.filter((e) => e.signal === "conflict").length,
      neutral: items.filter((e) => e.signal === "neutral").length,
    }
    const keyEvidence = [...items].sort((a, b) => evidenceTier(a) - evidenceTier(b)).slice(0, 2)
    return {
      dimension,
      label: DIMENSION_LABELS[dimension],
      hasEvidence: items.length > 0,
      counts,
      keyEvidence,
      evidence: items,
    }
  })
}
