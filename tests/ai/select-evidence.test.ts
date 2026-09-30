import { describe, expect, it } from "vitest"

import { buildEvidence } from "@/lib/evidence/engine"
import type { EvidenceContext } from "@/lib/evidence/types"
import { selectEvidenceForPlan } from "@/lib/ai/select-evidence"
import { realLikeMetrics } from "../evidence/helpers"

const CTX: EvidenceContext = {
  stockCode: "000333.SZ",
  stockName: "美的集团",
  industry: null,
  latestFinancialPeriod: "2026-Q2",
  latestPriceDate: "2026-09-30",
}

const fullEvidence = buildEvidence({ metrics: realLikeMetrics(), context: CTX }).evidence
const byId = (id: string) => fullEvidence.find((e) => e.evidenceId === id)

describe("selectEvidenceForPlan（§16–18）", () => {
  it("只保留所选维度的证据", () => {
    const selected = selectEvidenceForPlan(fullEvidence, {
      intent: "valuation_review",
      dimensions: ["valuation"],
      optionalDimensions: [],
      reason: "用户询问估值。",
    })
    expect(selected.length).toBeGreaterThan(0)
    expect(selected.every((e) => e.dimension === "valuation")).toBe(true)
    const ids = new Set(selected.map((e) => e.evidenceId))
    expect(ids.has("EV_FACT_VAL_PE_TTM")).toBe(true)
    expect(ids.has("EV_FACT_VAL_PB_MRQ")).toBe(true)
    expect(ids.has("EV_FACT_FIN_REVENUE_YOY_YTD")).toBe(false)
  })

  it("§17 选中维度时，相关 UNKNOWN 一起进入（估值 → 历史估值 UNKNOWN）", () => {
    const selected = selectEvidenceForPlan(fullEvidence, {
      intent: "valuation_review",
      dimensions: ["valuation"],
      optionalDimensions: [],
      reason: "用户询问估值。",
    })
    expect(selected.some((e) => e.evidenceId === "EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE")).toBe(true)
  })

  it("§18 industry 维度 → 选中行业 UNKNOWN（AI 不得自行找同行数据）", () => {
    const selected = selectEvidenceForPlan(fullEvidence, {
      intent: "risk_review",
      dimensions: ["industry"],
      optionalDimensions: [],
      reason: "用户询问行业位置。",
    })
    expect(selected.map((e) => e.evidenceId)).toEqual(["EV_UNKNOWN_INDUSTRY_COMPARISON"])
  })

  it("optionalDimensions 的证据也纳入", () => {
    const selected = selectEvidenceForPlan(fullEvidence, {
      intent: "growth_review",
      dimensions: ["growth"],
      optionalDimensions: ["market"],
      reason: "用户询问增长，行情作参考。",
    })
    const ids = new Set(selected.map((e) => e.evidenceId))
    expect(ids.has("EV_FACT_FIN_REVENUE_YOY_YTD")).toBe(true)
    expect(ids.has("EV_FACT_MKT_RETURN_20D")).toBe(true)
    expect(ids.has("EV_INF_MARKET_HORIZON_DIVERGENCE")).toBe(true)
    expect(ids.has("EV_FACT_VAL_PE_TTM")).toBe(false)
  })

  it("overall 诊断（5 维度）→ 除行业/风险界限 UNKNOWN 外全部命中", () => {
    const selected = selectEvidenceForPlan(fullEvidence, {
      intent: "overall_diagnosis",
      dimensions: ["growth", "profitability", "cashflow"],
      optionalDimensions: ["valuation", "market"],
      reason: "整体诊断。",
    })
    // Task 10 后：risk 维度（新闻覆盖边界 UNKNOWN）未被选中，随行业 UNKNOWN 一并排除
    const excluded = fullEvidence.length - selected.length
    expect(excluded).toBe(2)
    expect(selected.some((e) => e.evidenceId === "EV_UNKNOWN_INDUSTRY_COMPARISON")).toBe(false)
    expect(selected.some((e) => e.evidenceId === "EV_UNKNOWN_RISK_NEWS_DISCLOSURE")).toBe(false)
    expect(byId("EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE")).toBeDefined()
  })
})
