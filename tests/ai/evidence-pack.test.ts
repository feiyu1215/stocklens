import { describe, expect, it } from "vitest"

import {
  PACKING_POLICY,
  SYNTHESIS_EVIDENCE_BUDGET,
  buildSynthesisEvidencePack,
  toCompactEvidence,
} from "@/lib/ai/evidence-pack"
import type { PlannerResult } from "@/lib/ai/types"
import type { Evidence, EvidenceDimension, EvidenceSignal, EvidenceType } from "@/lib/evidence/types"

let seq = 0
function e(
  type: EvidenceType,
  signal: EvidenceSignal,
  dimension: EvidenceDimension = "growth",
  extra: Partial<Evidence> = {},
): Evidence {
  seq += 1
  const id = `EV_${type}_${dimension}_${signal}_${seq}`
  return {
    evidenceId: id,
    dimension,
    title: `${dimension}-${signal}`,
    statement: `statement-${id}`,
    type,
    signal,
    confidence: type === "unknown" ? "low" : type === "inference" ? "medium" : "high",
    metricIds: [],
    basedOn: [],
    sourceFields: [],
    verifyStatus: type === "unknown" ? "unverified" : "verified",
    confidenceReason: "-",
    ...extra,
  }
}

function plan(intent: PlannerResult["intent"], dimensions: EvidenceDimension[], optional: EvidenceDimension[] = []): PlannerResult {
  return { intent, dimensions, optionalDimensions: optional, reason: "test" }
}

const OVERALL = plan("overall_diagnosis", ["growth", "profitability", "cashflow"], ["valuation", "market"])

describe("T1 Budget（Task 09 §4/§11/§28）", () => {
  it("40 条证据的综合问题：synthesisEvidence ≤ HARD_MAX，且明显小于 full", () => {
    const full: Evidence[] = [
      e("inference", "conflict", "profitability"),
      e("inference", "conflict", "market"),
      e("inference", "neutral", "growth"),
      e("unknown", "unknown", "valuation"),
      e("unknown", "unknown", "industry"),
      ...Array.from({ length: 6 }, () => e("fact", "positive", "growth")),
      ...Array.from({ length: 6 }, () => e("fact", "positive", "market")),
      ...Array.from({ length: 6 }, () => e("fact", "neutral", "valuation")),
      ...Array.from({ length: 6 }, () => e("fact", "negative", "cashflow")),
      ...Array.from({ length: 6 }, () => e("fact", "neutral", "profitability")),
      ...Array.from({ length: 6 }, () => e("fact", "positive", "industry")),
    ]
    expect(full.length).toBeGreaterThanOrEqual(40)
    const pack = buildSynthesisEvidencePack(full, OVERALL)
    expect(pack.synthesisEvidence.length).toBeLessThanOrEqual(SYNTHESIS_EVIDENCE_BUDGET.HARD_MAX)
    expect(pack.synthesisEvidence.length).toBeLessThanOrEqual(PACKING_POLICY.overall_diagnosis.maxEvidence)
    expect(pack.synthesisEvidence.length).toBeLessThan(full.length)
  })

  it("单维度不超过 policy.maxPerDimension（market 15 条不会全进）", () => {
    const marketFacts = Array.from({ length: 15 }, () => e("fact", "positive", "market"))
    const pack = buildSynthesisEvidencePack(marketFacts, plan("overall_diagnosis", ["growth"], ["market"]))
    const marketCount = pack.synthesisEvidence.filter((x) => x.dimension === "market").length
    expect(marketCount).toBeLessThanOrEqual(PACKING_POLICY.overall_diagnosis.maxPerDimension)
  })
})

describe("T2 Dependency Closure（§9–§11）", () => {
  it("选中 inference 时 basedOn 的 FACT 自动进入（即使排序靠后）", () => {
    const factA = e("fact", "positive", "growth")
    const factB = e("fact", "neutral", "growth")
    const inference = e("inference", "conflict", "growth", { basedOn: [factA.evidenceId, factB.evidenceId] })
    // 大量 neutral fact 排在前面会挤占名额，但闭包必须保证依赖进入
    const neutrals = Array.from({ length: 20 }, () => e("fact", "neutral", "market"))
    const full = [...neutrals, factA, factB, inference]

    const pack = buildSynthesisEvidencePack(full, plan("overall_diagnosis", ["growth"]))
    const ids = new Set(pack.synthesisEvidence.map((x) => x.evidenceId))
    expect(ids.has(inference.evidenceId)).toBe(true)
    expect(ids.has(factA.evidenceId)).toBe(true)
    expect(ids.has(factB.evidenceId)).toBe(true)
  })

  it("依赖不重复计数：两个 inference 共用的 FACT 只出现一次", () => {
    const shared = e("fact", "positive", "growth")
    const inf1 = e("inference", "conflict", "growth", { basedOn: [shared.evidenceId] })
    const inf2 = e("inference", "neutral", "growth", { basedOn: [shared.evidenceId] })
    const pack = buildSynthesisEvidencePack([shared, inf1, inf2], plan("overall_diagnosis", ["growth"]))
    const occurrences = pack.synthesisEvidence.filter((x) => x.evidenceId === shared.evidenceId)
    expect(occurrences).toHaveLength(1)
  })

  it("绝不出现「保留 inference 丢掉 basedOn」", () => {
    const factA = e("fact", "positive", "growth")
    const factB = e("fact", "negative", "growth")
    const inference = e("inference", "conflict", "growth", { basedOn: [factA.evidenceId, factB.evidenceId] })
    const pack = buildSynthesisEvidencePack([inference, factA, factB], plan("overall_diagnosis", ["growth"]))
    const ids = new Set(pack.synthesisEvidence.map((x) => x.evidenceId))
    for (const inf of pack.synthesisEvidence.filter((x) => x.type === "inference")) {
      for (const ref of inf.basedOn) {
        expect(ids.has(ref)).toBe(true)
      }
    }
  })
})

describe("T3 Primary Dimension Coverage（§6–§7）", () => {
  it("growth/profitability/cashflow 每个主维度至少 1 条进入 Pack", () => {
    const full = [
      e("inference", "conflict", "profitability"),
      e("inference", "conflict", "market"),
      e("fact", "negative", "cashflow"),
      e("fact", "positive", "growth"),
      ...Array.from({ length: 10 }, () => e("fact", "neutral", "market")),
    ]
    const pack = buildSynthesisEvidencePack(full, OVERALL)
    const dims = new Set(pack.synthesisEvidence.map((x) => x.dimension))
    expect(dims.has("growth")).toBe(true)
    expect(dims.has("profitability")).toBe(true)
    expect(dims.has("cashflow")).toBe(true)
    expect(pack.byDimension.growth).toBeGreaterThanOrEqual(1)
  })
})

describe("T4 Market Overload（§8/§12）", () => {
  it("综合问题下市场证据被显著压缩（≤ maxPerDimension）", () => {
    const market = Array.from({ length: 15 }, () => e("fact", "positive", "market"))
    const rest = [
      e("fact", "positive", "growth"),
      e("fact", "positive", "profitability"),
      e("fact", "positive", "cashflow"),
    ]
    const pack = buildSynthesisEvidencePack([...market, ...rest], OVERALL)
    expect(pack.synthesisEvidence.filter((x) => x.dimension === "market").length).toBeLessThanOrEqual(4)
  })

  it("market_review 意图下允许更多市场证据（policy 差异化）", () => {
    const market = Array.from({ length: 15 }, () => e("fact", "positive", "market"))
    const pack = buildSynthesisEvidencePack(market, plan("market_review", ["market"], ["industry"]))
    expect(pack.synthesisEvidence.length).toBeGreaterThan(PACKING_POLICY.overall_diagnosis.maxPerDimension)
    expect(pack.synthesisEvidence.length).toBeLessThanOrEqual(PACKING_POLICY.market_review.maxEvidence)
  })
})

describe("T5 Unknown Preservation（§26）", () => {
  it("估值问题的历史估值 UNKNOWN 必须进入 Pack", () => {
    const full = [
      e("fact", "neutral", "valuation"),
      e("fact", "neutral", "valuation"),
      e("fact", "neutral", "valuation"),
      e("fact", "neutral", "valuation"),
      e("fact", "neutral", "valuation"),
      e("unknown", "unknown", "valuation", { evidenceId: "EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE" }),
    ]
    const pack = buildSynthesisEvidencePack(full, plan("valuation_review", ["valuation"], ["market"]))
    expect(pack.synthesisEvidence.some((x) => x.evidenceId === "EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE")).toBe(true)
  })

  it("unknown 优先级高于 neutral fact（同类竞争时先入选）", () => {
    const unknown = e("unknown", "unknown", "growth")
    const neutrals = Array.from({ length: 3 }, () => e("fact", "neutral", "growth"))
    const pack = buildSynthesisEvidencePack([...neutrals, unknown], plan("growth_review", ["growth"]))
    expect(pack.synthesisEvidence[0].evidenceId).toBe(unknown.evidenceId)
  })
})

describe("T6 Determinism（§2/§28）", () => {
  it("相同输入两次运行：证据 ID 顺序完全一致", () => {
    const full = [
      e("inference", "conflict", "profitability"),
      e("unknown", "unknown", "valuation"),
      ...Array.from({ length: 8 }, () => e("fact", "positive", "growth")),
      ...Array.from({ length: 8 }, () => e("fact", "neutral", "market")),
      e("fact", "negative", "cashflow"),
    ]
    const a = buildSynthesisEvidencePack(full, OVERALL).synthesisEvidence.map((x) => x.evidenceId)
    const b = buildSynthesisEvidencePack(full, OVERALL).synthesisEvidence.map((x) => x.evidenceId)
    expect(a).toEqual(b)
  })

  it("紧凑序列化只含白名单字段（不含 sourceFields/confidenceReason）", () => {
    const compact = toCompactEvidence(
      e("fact", "positive", "growth", {
        sourceFields: [{ source: "fuyao", domain: "financial", field: "operating_income", period: "2026-Q2" }],
      }),
    )
    expect(Object.keys(compact).sort()).toEqual(
      ["basedOn", "dimension", "evidenceId", "signal", "statement", "title", "type"].sort(),
    )
    expect(JSON.stringify(compact)).not.toContain("operating_income")
    expect(JSON.stringify(compact)).not.toContain("sourceFields")
  })
})
