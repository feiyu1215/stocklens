import { describe, expect, it } from "vitest"

import type { DiagnosisSynthesis } from "@/lib/ai/types"
import { validateDiagnosisSynthesis } from "@/lib/validation/diagnosis"
import { buildEvidence } from "@/lib/evidence/engine"
import type { EvidenceContext, Evidence } from "@/lib/evidence/types"
import { realLikeMetrics } from "../evidence/helpers"

const CTX: EvidenceContext = {
  stockCode: "000333.SZ",
  stockName: "美的集团",
  industry: null,
  latestFinancialPeriod: "2026-Q2",
  latestPriceDate: "2026-09-30",
}

const fullEvidence: Evidence[] = buildEvidence({ metrics: realLikeMetrics(), context: CTX }).evidence

function validSynthesis(): DiagnosisSynthesis {
  return {
    summary: {
      text: "公司收入和利润保持同比增长，但毛利率同比下降，增长与盈利变化方向不完全一致；行情上短期与中期方向存在背离。",
      evidenceIds: ["EV_FACT_FIN_REVENUE_YOY_YTD", "EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE", "EV_INF_MARKET_HORIZON_DIVERGENCE"],
    },
    confirmedFacts: [
      { text: "最新报告期营业收入累计同比增长。", evidenceIds: ["EV_FACT_FIN_REVENUE_YOY_YTD"] },
    ],
    analysisInferences: [
      {
        text: "收入仍在增长，但毛利率较上年同期下降，经营增长与盈利水平的变化方向并不完全一致。",
        evidenceIds: ["EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE", "EV_FACT_FIN_REVENUE_YOY_YTD", "EV_FACT_FIN_GROSS_MARGIN_CHANGE_YOY"],
      },
    ],
    unknowns: [
      { text: "当前无法判断估值处于历史高低位置。", evidenceIds: ["EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE"] },
    ],
    nextQuestions: ["毛利率下降是否主要集中在最新单季度？", "短期行情走弱是否与基本面变化同步？"],
  }
}

describe("§57 AI Eval｜Grounding（正确引用 → PASS）", () => {
  it("小证据集：Revenue +3% / GM Change −0.5pct / Growth-Margin Conflict", () => {
    const smallEvidence = [
      fullEvidence.find((e) => e.evidenceId === "EV_FACT_FIN_REVENUE_YOY_YTD")!,
      fullEvidence.find((e) => e.evidenceId === "EV_FACT_FIN_GROSS_MARGIN_CHANGE_YOY")!,
      fullEvidence.find((e) => e.evidenceId === "EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE")!,
    ]
    const synthesis = validSynthesis()
    // 小证据集内不存在 horizon/unknown 证据：相应引用按 §58 已知边界不进入 P0 校验范围之外——
    // 但 binding 校验是严格的，因此本 fixture 的引用必须落在集内
    synthesis.summary.evidenceIds = ["EV_FACT_FIN_REVENUE_YOY_YTD", "EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE"]
    synthesis.unknowns = []
    const result = validateDiagnosisSynthesis(synthesis, smallEvidence)
    expect(result.ok).toBe(true)
  })
})

describe("§48/§34｜Evidence Binding", () => {
  it("伪造 Evidence ID（EV_FAKE_001）→ FAIL，且不静默删除", () => {
    const synthesis = validSynthesis()
    synthesis.summary.evidenceIds.push("EV_FAKE_001")
    const result = validateDiagnosisSynthesis(synthesis, fullEvidence)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.rule === "evidence-binding" && i.message.includes("EV_FAKE_001"))).toBe(true)
    }
  })

  it("§51 Missing grounding：summary.evidenceIds 为空 → FAIL", () => {
    const synthesis = validSynthesis()
    synthesis.summary.evidenceIds = []
    const result = validateDiagnosisSynthesis(synthesis, fullEvidence)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.section === "summary" && i.rule === "schema")).toBe(true)
    }
  })

  it("引用存在但未选中的证据 → FAIL（绑定范围是 selectedEvidence）", () => {
    const synthesis = validSynthesis()
    synthesis.confirmedFacts.push({
      text: "行业位置暂无法验证。",
      evidenceIds: ["EV_UNKNOWN_INDUSTRY_COMPARISON"], // 存在于全量，但不在 selected
    })
    const selected = fullEvidence.filter((e) => e.dimension !== "industry")
    const result = validateDiagnosisSynthesis(synthesis, selected)
    expect(result.ok).toBe(false)
  })
})

describe("§49/§31｜confirmedFacts 只能引用 fact", () => {
  it("confirmedFacts 引用 inference → FAIL", () => {
    const synthesis = validSynthesis()
    synthesis.confirmedFacts.push({
      text: "收入增长但毛利率下降。",
      evidenceIds: ["EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE"],
    })
    const result = validateDiagnosisSynthesis(synthesis, fullEvidence)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.rule === "section-type" && i.section === "confirmedFacts")).toBe(true)
    }
  })
})

describe("§32｜analysisInferences 必须引用至少 1 条 inference", () => {
  it("只引用 fact → FAIL（事实重述不构成分析推断）", () => {
    const synthesis = validSynthesis()
    synthesis.analysisInferences = [
      { text: "营业收入累计同比增长。", evidenceIds: ["EV_FACT_FIN_REVENUE_YOY_YTD"] },
    ]
    const result = validateDiagnosisSynthesis(synthesis, fullEvidence)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.rule === "section-type" && i.section === "analysisInferences")).toBe(true)
    }
  })
})

describe("§50/§33｜unknowns 只能引用 unknown", () => {
  it("unknowns 引用 FACT → FAIL", () => {
    const synthesis = validSynthesis()
    synthesis.unknowns = [
      { text: "营业收入同比增长。", evidenceIds: ["EV_FACT_FIN_REVENUE_YOY_YTD"] },
    ]
    const result = validateDiagnosisSynthesis(synthesis, fullEvidence)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.rule === "section-type" && i.section === "unknowns")).toBe(true)
    }
  })
})

describe("§35/§36｜Compliance Output Validation", () => {
  it("summary 含买卖建议 → FAIL", () => {
    const synthesis = validSynthesis()
    synthesis.summary.text = "公司经营稳健，建议买入。"
    const result = validateDiagnosisSynthesis(synthesis, fullEvidence)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.section === "compliance")).toBe(true)
    }
  })

  it("summary 含低估/高估断言 → FAIL", () => {
    const synthesis = validSynthesis()
    synthesis.summary.text = "当前估值明显低估，公司质地优秀。"
    const result = validateDiagnosisSynthesis(synthesis, fullEvidence)
    expect(result.ok).toBe(false)
  })

  it("nextQuestions 含禁止表达 → FAIL", () => {
    const synthesis = validSynthesis()
    synthesis.nextQuestions = ["预计上涨空间有多大？"]
    const result = validateDiagnosisSynthesis(synthesis, fullEvidence)
    expect(result.ok).toBe(false)
  })
})

describe("§58｜Known Boundary：语义矛盾检测依赖 Prompt + 人工 Eval", () => {
  it("模型声称「经营现金流同比下降」（与证据矛盾）但绑定合法 → 结构校验仍 PASS（已知局限，非零幻觉）", () => {
    const synthesis = validSynthesis()
    synthesis.confirmedFacts = [
      {
        // 语义上与 EV_FACT_FIN_OCF_YOY_YTD（+0.73%，正增长）矛盾，
        // 但 evidenceId 绑定与类型均合法 —— P0 结构校验无法识别
        text: "经营现金流同比下降。",
        evidenceIds: ["EV_FACT_FIN_OCF_YOY_YTD"],
      },
    ]
    const result = validateDiagnosisSynthesis(synthesis, fullEvidence)
    // 该断言刻意固化「已知局限」：系统不假装已解决语义事实一致性
    expect(result.ok).toBe(true)
  })
})

describe("Schema 边界", () => {
  it("非对象输入 → FAIL", () => {
    expect(validateDiagnosisSynthesis("hello", fullEvidence).ok).toBe(false)
  })
  it("confirmedFacts 非数组 → FAIL", () => {
    const parsed = { ...validSynthesis(), confirmedFacts: "oops" }
    expect(validateDiagnosisSynthesis(parsed, fullEvidence).ok).toBe(false)
  })
  it("nextQuestions 非字符串数组 → FAIL", () => {
    const parsed = { ...validSynthesis(), nextQuestions: [1, 2] }
    expect(validateDiagnosisSynthesis(parsed, fullEvidence).ok).toBe(false)
  })
})
