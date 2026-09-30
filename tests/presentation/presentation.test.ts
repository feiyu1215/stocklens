import { describe, expect, it } from "vitest"

import { buildEvidence } from "@/lib/evidence/engine"
import type { EvidenceContext } from "@/lib/evidence/types"
import { buildDimensionViews } from "@/lib/presentation/dimension-view"
import { formatMetricValue, formatPctPoint, formatPeriod, formatRatio, formatSignedPercentage } from "@/lib/presentation/formatters"
import type { MetricResult } from "@/lib/metrics/types"
import { realLikeMetrics } from "../evidence/helpers"

const CTX: EvidenceContext = {
  stockCode: "000333.SZ",
  stockName: "美的集团",
  industry: null,
  latestFinancialPeriod: "2026-Q2",
  latestPriceDate: "2026-09-30",
}

describe("formatters（§58–59）", () => {
  const mk = (metricId: string, value: number, unit: string): MetricResult => ({
    metricId, dimension: "growth", name: metricId, status: "available", value, unit,
    sourceFields: [], calculationMethod: "-",
  })

  it("百分比：带符号指标 +9.83% / -8.45%；非符号指标 25.26%", () => {
    expect(formatMetricValue(mk("MKT_RETURN_120D", 9.83135, "%"))).toBe("+9.83%")
    expect(formatMetricValue(mk("MKT_RETURN_20D", -8.44668, "%"))).toBe("-8.45%")
    expect(formatMetricValue(mk("FIN_GROSS_MARGIN", 25.2558, "%"))).toBe("25.26%")
  })

  it("百分点：-0.36 pct（不是 -0.36%）", () => {
    expect(formatMetricValue(mk("FIN_GROSS_MARGIN_CHANGE_YOY", -0.3641, "pct"))).toBe("-0.36 pct")
    expect(formatPctPoint(2)).toBe("+2.00 pct")
  })

  it("倍数：1.42x / 13.77x", () => {
    expect(formatMetricValue(mk("FIN_CFO_TO_NET_PROFIT_YTD", 1.41995, "x"))).toBe("1.42x")
    expect(formatRatio(13.77168)).toBe("13.77x")
  })

  it("period 与 signed percentage", () => {
    expect(formatPeriod("2026-Q2")).toBe("2026 年第 2 季度")
    expect(formatPeriod(null)).toBe("—")
    expect(formatSignedPercentage(-8.44668)).toBe("-8.45%")
  })
})

describe("buildDimensionViews（§24–26）", () => {
  it("空证据：全维度 hasEvidence=false（信息不足 ≠ 无异常）", () => {
    const views = buildDimensionViews([])
    expect(views).toHaveLength(7)
    expect(views.every((v) => !v.hasEvidence)).toBe(true)
    expect(views.find((v) => v.dimension === "growth")?.label).toBe("经营增长")
  })

  it("分组计数与关键证据优先级（conflict > negative > positive > unknown）", () => {
    const evidence = buildEvidence({ metrics: realLikeMetrics(), context: CTX }).evidence
    const vs = buildDimensionViews(evidence)
    const profitability = vs.find((v) => v.dimension === "profitability")!
    expect(profitability.counts.conflict).toBe(1) // growth/margin divergence
    expect(profitability.keyEvidence[0]?.evidenceId).toBe("EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE")
    const market = vs.find((v) => v.dimension === "market")!
    expect(market.counts.total).toBe(7)
    expect(market.counts.conflict).toBe(1)
    // industry 维度持有「行业比较不可验证」的 UNKNOWN 证据 → 有证据
    const industry = vs.find((v) => v.dimension === "industry")!
    expect(industry.hasEvidence).toBe(true)
    expect(industry.counts.unknown).toBe(1)
    // risk 维度完全没有证据 → 信息不足
    expect(vs.find((v) => v.dimension === "risk")!.hasEvidence).toBe(false)
  })
})
