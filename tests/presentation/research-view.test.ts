import { describe, expect, it } from "vitest"

import type { PlannerResult } from "@/lib/ai/types"
import type { Evidence, EvidenceDimension, EvidenceSignal, EvidenceType } from "@/lib/evidence/types"
import { MAX_ATTENTION, MAX_UNKNOWN_SPOTLIGHT, buildResearchView } from "@/lib/presentation/research-view"

let seq = 0
function e(
  type: EvidenceType,
  signal: EvidenceSignal,
  dimension: EvidenceDimension = "growth",
  id?: string,
): Evidence {
  seq += 1
  return {
    evidenceId: id ?? `EV_${type}_${dimension}_${signal}_${seq}`,
    dimension,
    title: `${dimension}-${signal}`,
    statement: `statement-${seq}`,
    type,
    signal,
    confidence: type === "unknown" ? "low" : type === "inference" ? "medium" : "high",
    metricIds: [],
    basedOn: [],
    sourceFields: type === "fact" && dimension === "risk" ? [{ source: "fuyao", domain: "prices", field: "ep" }] : [],
    verifyStatus: type === "unknown" ? "unverified" : "verified",
    confidenceReason: "-",
  }
}

function plan(dimensions: EvidenceDimension[], optional: EvidenceDimension[] = []): PlannerResult {
  return { intent: "overall_diagnosis", dimensions, optionalDimensions: optional, reason: "test" }
}

const FULL: Evidence[] = [
  e("inference", "conflict", "profitability", "EV_INF_CONFLICT"),
  e("fact", "negative", "profitability", "EV_FACT_NEG"),
  e("fact", "positive", "growth", "EV_FACT_POS"),
  e("inference", "neutral", "growth", "EV_INF_NEUTRAL"),
  e("fact", "neutral", "market", "EV_FACT_MKT"),
  e("fact", "positive", "market", "EV_FACT_MKT_POS"),
  e("unknown", "unknown", "valuation", "EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE"),
  e("unknown", "unknown", "risk", "EV_UNKNOWN_RISK_NEWS_DISCLOSURE"),
  e("unknown", "unknown", "industry", "EV_UNKNOWN_INDUSTRY_PEER_FINANCIALS"),
  e("unknown", "unknown", "risk", "EV_UNKNOWN_RISK_ANOMALY_COVERAGE"),
]

describe("Question-first Research View（Task 11 §8–§16）", () => {
  it("A：answerEvidence = summary 实际引用的证据", () => {
    const view = buildResearchView({
      planner: plan(["growth", "profitability"]),
      synthesis: { summary: { evidenceIds: ["EV_INF_CONFLICT", "EV_FACT_POS"] }, nextQuestions: [] },
      fullEvidence: FULL,
    })
    expect(view.answerEvidence.map((x) => x.evidenceId)).toEqual(["EV_INF_CONFLICT", "EV_FACT_POS"])
  })

  it("B：attention ≤ MAX_ATTENTION，冲突优先且至少保留一条 negative", () => {
    const view = buildResearchView({
      planner: plan(["growth", "profitability", "cashflow"]),
      synthesis: null,
      fullEvidence: FULL,
    })
    expect(view.attentionEvidence.length).toBeLessThanOrEqual(MAX_ATTENTION)
    expect(view.attentionEvidence[0].evidenceId).toBe("EV_INF_CONFLICT")
    expect(view.attentionEvidence.some((x) => x.evidenceId === "EV_FACT_NEG")).toBe(true)
    // attention 不含 UNKNOWN
    expect(view.attentionEvidence.every((x) => x.type !== "unknown")).toBe(true)
  })

  it("C：UNKNOWN 独立成区且 ≤ MAX_UNKNOWN_SPOTLIGHT，边界类优先", () => {
    const view = buildResearchView({
      planner: plan(["valuation", "risk"]),
      synthesis: null,
      fullEvidence: FULL,
    })
    expect(view.unknownEvidence.length).toBeLessThanOrEqual(MAX_UNKNOWN_SPOTLIGHT)
    expect(view.unknownEvidence.every((x) => x.type === "unknown")).toBe(true)
    // 历史估值位置排第一（研究边界优先级）
    expect(view.unknownEvidence[0].evidenceId).toBe("EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE")
  })

  it("维度主/次：Planner primary 在前，其余归入 secondary（默认折叠语义）", () => {
    const view = buildResearchView({
      planner: plan(["growth", "profitability"], ["market"]),
      synthesis: null,
      fullEvidence: FULL,
    })
    // primary 只含 Planner dimensions（不含 optionalDimensions）
    expect(view.primaryDimensions.map((d) => d.dimension).sort()).toEqual(["growth", "profitability"])
    expect(view.secondaryDimensions.map((d) => d.dimension)).toContain("market")
    expect(view.secondaryDimensions.map((d) => d.dimension)).toContain("valuation")
  })

  it("问题相关性：估值问题的 primary 维度体现为 valuation（Planner 决定）", () => {
    const view = buildResearchView({
      planner: { intent: "valuation_review", dimensions: ["valuation"], optionalDimensions: ["market"], reason: "估值" },
      synthesis: null,
      fullEvidence: FULL,
    })
    expect(view.primaryDimensions.map((d) => d.dimension)).toEqual(["valuation"])
  })

  it("趋势展示相关性：仅 growth/profitability/cashflow 被选中时 showTrend=true", () => {
    const withTrend = buildResearchView({
      planner: plan(["valuation"], ["market"]),
      synthesis: null,
      fullEvidence: FULL,
    })
    expect(withTrend.showTrend).toBe(false)

    const growthQ = buildResearchView({
      planner: plan(["growth"], ["market"]),
      synthesis: null,
      fullEvidence: FULL,
    })
    expect(growthQ.showTrend).toBe(true)
  })

  it("§22 关注度方向不被改写：statement 原样进入视图（不新增'提升'措辞）", () => {
    const attention = e("fact", "neutral", "risk", "EV_FACT_RISK_ATTENTION_20260930")
    attention.statement = "最近 30 天热榜排名由 2026-08-31 的约第 323 名变为 2026-09-30 的约第 334 名（期间最好约第 164 名）。"
    const view = buildResearchView({
      planner: plan(["risk", "market"]),
      synthesis: null,
      fullEvidence: [attention],
    })
    const shown = [...view.primaryDimensions, ...view.secondaryDimensions]
      .flatMap((d) => d.evidence)
      .find((x) => x.evidenceId === attention.evidenceId)!
    expect(shown.statement).toBe(attention.statement)
    expect(shown.statement).not.toContain("提升")
    expect(shown.statement).not.toContain("关注度上升")
  })

  it("§26/§27 继续研究：≤3 条，过滤明显不可回答的方向", () => {
    const view = buildResearchView({
      planner: plan(["growth"]),
      synthesis: {
        summary: { evidenceIds: [] },
        nextQuestions: [
          "最近有什么公告导致股价下跌？",
          "毛利率下降是否主要集中在最新单季度？",
          "短期行情走弱是否与基本面变化同步？",
          "未来一周股价会怎么走？",
        ],
      },
      fullEvidence: FULL,
    })
    expect(view.nextQuestions.length).toBeLessThanOrEqual(3)
    expect(view.nextQuestions.some((q) => q.includes("公告"))).toBe(false)
    expect(view.nextQuestions[0]).toContain("毛利率")
  })

  it("synthesis 缺失（AI failure）：A/B/C 仍可构建（无 summary 依据，attention/unknown 正常）", () => {
    const view = buildResearchView({ planner: plan(["growth"]), synthesis: null, fullEvidence: FULL })
    expect(view.answerEvidence).toEqual([])
    expect(view.attentionEvidence.length).toBeGreaterThan(0)
    expect(view.unknownEvidence.length).toBeGreaterThan(0)
    expect(view.nextQuestions).toEqual([])
  })

  it("确定性：同输入两次运行输出顺序一致", () => {
    const build = () =>
      buildResearchView({ planner: plan(["growth", "profitability"]), synthesis: null, fullEvidence: FULL })
    const a = build()
    const b = build()
    expect(a.attentionEvidence.map((x) => x.evidenceId)).toEqual(b.attentionEvidence.map((x) => x.evidenceId))
    expect(a.unknownEvidence.map((x) => x.evidenceId)).toEqual(b.unknownEvidence.map((x) => x.evidenceId))
    expect(a.primaryDimensions.map((d) => d.dimension)).toEqual(b.primaryDimensions.map((d) => d.dimension))
  })
})
