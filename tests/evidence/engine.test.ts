import { describe, expect, it } from "vitest"

import { buildEvidence } from "@/lib/evidence/engine"
import { validateEvidenceBundle } from "@/lib/evidence/validate"
import type { Evidence, EvidenceContext } from "@/lib/evidence/types"
import { ALL_METRIC_IDS, m, realLikeMetrics } from "./helpers"

const CTX: EvidenceContext = {
  stockCode: "000333.SZ",
  stockName: "美的集团",
  industry: null,
  latestFinancialPeriod: "2026-Q2",
  latestPriceDate: "2026-09-30",
}

describe("buildEvidence —— 真实数据形态 fixture（Task 02 冒烟值）", () => {
  const bundle = buildEvidence({ metrics: realLikeMetrics(), context: CTX })
  const ids = new Set(bundle.evidence.map((e) => e.evidenceId))

  it("21 个 FACT + 触发的 INFERENCE + 确定性 UNKNOWN，总数一致", () => {
    expect(bundle.stats.fact).toBe(21)
    expect(bundle.stats.inference).toBe(3)
    expect(bundle.stats.unknown).toBe(2)
    expect(bundle.stats.total).toBe(bundle.evidence.length)
  })

  it("真实数据自然触发的 inference：收入/毛利率背离、利润增速落后、行情期限背离", () => {
    expect(ids.has("EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE")).toBe(true)
    expect(ids.has("EV_INF_FIN_PROFIT_GROWTH_LAGS_REVENUE")).toBe(true)
    expect(ids.has("EV_INF_MARKET_HORIZON_DIVERGENCE")).toBe(true)
    const horizon = bundle.evidence.find((e) => e.evidenceId === "EV_INF_MARKET_HORIZON_DIVERGENCE")!
    expect(horizon.statement).toContain("-8.45%")
    expect(horizon.statement).toContain("+9.83%")
  })

  it("§2 纠正：OCF 同比为正 → 利润/现金流背离规则绝不触发", () => {
    expect(ids.has("EV_INF_FIN_PROFIT_CASHFLOW_DIVERGENCE")).toBe(false)
    expect(ids.has("EV_INF_FIN_REVENUE_PROFIT_DIVERGENCE")).toBe(false)
    expect(bundle.evidence.every((e) => e.signal !== "conflict" || ["EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE", "EV_INF_MARKET_HORIZON_DIVERGENCE"].includes(e.evidenceId))).toBe(true)
  })

  it("§50 Reference Integrity：所有 inference 的 basedOn 都能解析", () => {
    for (const e of bundle.evidence.filter((x) => x.type === "inference")) {
      expect(e.basedOn.length).toBeGreaterThanOrEqual(2)
      for (const ref of e.basedOn) {
        expect(ids.has(ref)).toBe(true)
      }
    }
  })

  it("UNKNOWN：历史估值 + 行业比较（industry = null）", () => {
    expect(ids.has("EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE")).toBe(true)
    expect(ids.has("EV_UNKNOWN_INDUSTRY_COMPARISON")).toBe(true)
  })

  it("stats 与 evidence 逐条对账", () => {
    const recount = { fact: 0, inference: 0, unknown: 0, positive: 0, negative: 0, conflict: 0, neutral: 0, unknownSignal: 0 }
    for (const e of bundle.evidence) {
      recount[e.type] += 1
      if (e.signal === "positive") recount.positive += 1
      if (e.signal === "negative") recount.negative += 1
      if (e.signal === "conflict") recount.conflict += 1
      if (e.signal === "neutral") recount.neutral += 1
      if (e.signal === "unknown") recount.unknownSignal += 1
    }
    expect(bundle.stats).toEqual({ total: bundle.evidence.length, ...recount })
  })

  it("§51 Determinism：同一输入两次运行，evidenceId/type/signal/ruleId 完全一致", () => {
    const again = buildEvidence({ metrics: realLikeMetrics(), context: CTX })
    const pick = (b: typeof bundle) =>
      b.evidence.map((e) => ({ evidenceId: e.evidenceId, type: e.type, signal: e.signal, ruleId: e.ruleId }))
    expect(pick(again)).toEqual(pick(bundle))
    expect(JSON.stringify(again.evidence)).toBe(JSON.stringify(bundle.evidence))
  })

  it("validator 通过；规则版本固定", () => {
    expect(validateEvidenceBundle(bundle.evidence).ok).toBe(true)
    expect(bundle.rulesVersion).toBe("evidence_rules_v1")
  })
})

describe("buildEvidence —— 能力组聚合 UNKNOWN", () => {
  it("全部指标 unavailable → 7 条 UNKNOWN（2 确定性 + 5 能力组），无 FACT/INFERENCE", () => {
    const bundle = buildEvidence({
      metrics: ALL_METRIC_IDS.map((id) => m(id, null)),
      context: CTX,
    })
    expect(bundle.stats).toEqual({
      total: 7, fact: 0, inference: 0, unknown: 7,
      positive: 0, negative: 0, conflict: 0, neutral: 0, unknownSignal: 7,
    })
    const marginHistory = bundle.evidence.find((e) => e.evidenceId === "EV_UNKNOWN_FIN_MARGIN_HISTORY")!
    expect(marginHistory.statement).toContain("FIN_GROSS_MARGIN_CHANGE_YOY")
    expect(marginHistory.unavailableReason).toBeTruthy()
  })

  it("部分缺失（3 个 margin change 中 1 个不可用）→ 聚合为 1 条，不生成重复卡片", () => {
    const metrics = realLikeMetrics().map((x) =>
      x.metricId === "FIN_ROE_CHANGE_YOY" ? m("FIN_ROE_CHANGE_YOY", null) : x,
    )
    const bundle = buildEvidence({ metrics, context: CTX })
    const groupUnknowns = bundle.evidence.filter(
      (e) => e.type === "unknown" && e.evidenceId === "EV_UNKNOWN_FIN_MARGIN_HISTORY",
    )
    expect(groupUnknowns).toHaveLength(1)
    expect(groupUnknowns[0].metricIds).toEqual(["FIN_ROE_CHANGE_YOY"])
    // 其余 20 个 fact 仍然生成
    expect(bundle.stats.fact).toBe(20)
  })

  it("industry 已知 → 不生成行业 UNKNOWN", () => {
    const bundle = buildEvidence({
      metrics: realLikeMetrics(),
      context: { ...CTX, industry: "白色家电" },
    })
    expect(bundle.evidence.find((e) => e.evidenceId === "EV_UNKNOWN_INDUSTRY_COMPARISON")).toBeUndefined()
  })
})

describe("§41-42｜Validator", () => {
  const bundle = buildEvidence({ metrics: realLikeMetrics(), context: CTX })

  function tamper(fn: (list: Evidence[]) => void): Evidence[] {
    const copy: Evidence[] = JSON.parse(JSON.stringify(bundle.evidence))
    fn(copy)
    return copy
  }

  it("broken reference → 校验失败（绝不悄悄删引用）", () => {
    const broken = tamper((list) => {
      const inf = list.find((e) => e.type === "inference")!
      inf.basedOn.push("EV_DOES_NOT_EXIST")
    })
    const result = validateEvidenceBundle(broken)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.rule === "broken-reference" && v.message.includes("EV_DOES_NOT_EXIST"))).toBe(true)
  })

  it("FACT 带 basedOn → 校验失败", () => {
    const bad = tamper((list) => {
      const fact = list.find((e) => e.type === "fact")!
      fact.basedOn.push("EV_FACT_FIN_ROE")
    })
    expect(validateEvidenceBundle(bad).violations.some((v) => v.rule === "fact-based-on")).toBe(true)
  })

  it("INFERENCE basedOn 不足 2 条 → 校验失败", () => {
    const bad = tamper((list) => {
      const inf = list.find((e) => e.type === "inference")!
      inf.basedOn = [inf.basedOn[0]]
    })
    expect(validateEvidenceBundle(bad).violations.some((v) => v.rule === "inference-based-on")).toBe(true)
  })

  it("UNKNOWN 缺少 unavailableReason 且 statement 为空 → 校验失败", () => {
    const bad = tamper((list) => {
      const u = list.find((e) => e.type === "unknown")!
      u.statement = ""
      delete u.unavailableReason
    })
    expect(validateEvidenceBundle(bad).violations.some((v) => v.rule === "unknown-reason")).toBe(true)
  })

  it("重复 evidenceId → 校验失败", () => {
    const bad = tamper((list) => {
      list.push(JSON.parse(JSON.stringify(list[0])))
    })
    expect(validateEvidenceBundle(bad).violations.some((v) => v.rule === "unique-id")).toBe(true)
  })
})
