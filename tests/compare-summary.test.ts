// 双公司对比 P2 —— 摘要纯函数层测试（事实包 / 服务端重校验 / 确定性摘要 / 输出事实校验）

import { describe, expect, it } from "vitest"

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import type { MetricResult } from "@/lib/metrics/types"
import { buildCompareRows } from "@/lib/v5/compare"
import {
  COMPARE_JUDGMENT_PATTERNS,
  buildCoverage,
  buildDeterministicSummary,
  buildFactPack,
  findUnanchoredNumbers,
  recheckFacts,
  toSummaryFacts,
  validateCompareNarrative,
  type CompareRowFact,
} from "@/lib/v5/compare-summary"

const noForbidden = () => []

function metric(metricId: string, value: number | null, period: string, unit = "%"): MetricResult {
  return {
    metricId,
    dimension: "growth",
    name: metricId,
    status: value === null ? "unavailable" : "available",
    value,
    unit,
    period,
    sourceFields: [{ source: "fuyao", domain: "financial", field: metricId, period }],
    calculationMethod: `calc(${metricId})`,
    ...(value === null ? { unavailableReason: "无数据" } : {}),
  }
}

function payload(stockCode: string, metrics: MetricResult[]): ResearchSpacePayload {
  return {
    spaceId: `SP_${stockCode}`,
    company: {
      stockCode,
      stockName: stockCode === "000333.SZ" ? "美的集团" : "格力电器",
      capabilities: [],
      availableCapabilities: [],
      partialCapabilities: [],
      unavailableCapabilities: [],
    },
    frame: { intent: "test", framingReason: "test" },
    dimensions: [],
    claims: [],
    evidence: [],
    suggestions: [],
    trend: [],
    metrics,
    ai: { status: "success" },
    errors: [],
  }
}

function fact(overrides: Partial<CompareRowFact> & { metricId: string }): CompareRowFact {
  return {
    name: overrides.metricId,
    group: "growth",
    note: "",
    left: { value: null, unit: "%" },
    right: { value: null, unit: "%" },
    status: "not_comparable",
    diff: null,
    ...overrides,
  }
}

const ROE = "FIN_ROE"
const GROSS = "FIN_GROSS_MARGIN"

describe("toSummaryFacts（事实包瘦身）", () => {
  it("只带数值/单位/报告期，不带证据长文本与来源字段", () => {
    const rows = buildCompareRows(
      payload("000333.SZ", [metric(ROE, 21.5, "2025H1")]),
      payload("000651.SZ", [metric(ROE, 18.2, "2025H1")]),
    )
    const facts = toSummaryFacts(rows)
    const roe = facts.find((f) => f.metricId === ROE)
    expect(roe).toBeTruthy()
    // 事实包里不存在任何可抄的自由文本字段
    expect(Object.keys(roe as object).sort()).toEqual(
      ["diff", "group", "left", "right", "metricId", "name", "note", "status"].sort(),
    )
    expect(JSON.stringify(roe)).not.toContain("statement")
    expect(JSON.stringify(roe)).not.toContain("sourceFields")
  })
})

describe("recheckFacts（服务端重跑确定性规则）", () => {
  it("与规则一致的行通过，并给出重算后的差值", () => {
    const rows = buildCompareRows(
      payload("000333.SZ", [metric(ROE, 21.5, "2025H1")]),
      payload("000651.SZ", [metric(ROE, 18.2, "2025H1")]),
    )
    const result = recheckFacts(toSummaryFacts(rows))
    expect(result.ok).toBe(true)
    const roe = result.facts.find((f) => f.metricId === ROE)
    expect(roe?.status).toBe("comparable")
    expect(roe?.diff?.value).toBeCloseTo(21.5 - 18.2, 10)
  })

  it("声称可比但报告期不同 → 拒绝（不许客户端改判定）", () => {
    const result = recheckFacts([
      fact({
        metricId: ROE,
        status: "comparable",
        left: { value: 21.5, unit: "%", period: "2025H1" },
        right: { value: 18.2, unit: "%", period: "2024H1" },
        diff: { value: 3.3, unit: "pct" },
      }),
    ])
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("不一致")
  })

  it("声称的差值与确定性计算不符 → 拒绝", () => {
    const result = recheckFacts([
      fact({
        metricId: ROE,
        status: "comparable",
        left: { value: 21.5, unit: "%", period: "2025H1" },
        right: { value: 18.2, unit: "%", period: "2025H1" },
        diff: { value: 9.9, unit: "pct" },
      }),
    ])
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("差值")
  })

  it("并列/不可比却携带差值 → 拒绝", () => {
    const result = recheckFacts([
      fact({
        metricId: ROE,
        status: "side_by_side",
        left: { value: 21.5, unit: "%", period: "2025H1" },
        right: { value: 18.2, unit: "%", period: "2024H1" },
        diff: { value: 3.3, unit: "pct" },
      }),
    ])
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("不应携带差值")
  })

  it("空行数组 → 拒绝", () => {
    expect(recheckFacts([]).ok).toBe(false)
  })
})

describe("buildFactPack / buildCoverage", () => {
  const facts: CompareRowFact[] = [
    fact({
      metricId: ROE,
      name: "ROE",
      status: "comparable",
      left: { value: 21.5, unit: "%", period: "2025H1" },
      right: { value: 18.2, unit: "%", period: "2025H1" },
      diff: { value: 3.3, unit: "pct" },
    }),
    fact({
      metricId: GROSS,
      name: "毛利率",
      status: "side_by_side",
      left: { value: 26.4, unit: "%", period: "2025H1" },
      right: { value: 24.1, unit: "%", period: "2024H1" },
    }),
    fact({ metricId: "VAL_PE_TTM", name: "市盈率", status: "not_comparable" }),
  ]

  it("不可比的行完全不进模型事实包", () => {
    const pack = buildFactPack(facts)
    expect(pack.map((f) => f.metricId)).toEqual([ROE, GROSS])
  })

  it("覆盖统计与未纳入清单准确", () => {
    const coverage = buildCoverage(facts)
    expect(coverage).toMatchObject({ comparable: 1, sideBySide: 1, notComparable: 1 })
    expect(coverage.excluded).toEqual(["市盈率"])
  })
})

describe("buildDeterministicSummary（永远可用的降级摘要）", () => {
  const facts: CompareRowFact[] = [
    fact({
      metricId: ROE,
      name: "ROE",
      status: "comparable",
      left: { value: 21.5, unit: "%", period: "2025H1" },
      right: { value: 18.2, unit: "%", period: "2025H1" },
      diff: { value: 3.3, unit: "pct" },
    }),
    fact({
      metricId: GROSS,
      name: "毛利率",
      status: "side_by_side",
      left: { value: 26.4, unit: "%", period: "2025H1" },
      right: { value: 24.1, unit: "%", period: "2024H1" },
    }),
    fact({ metricId: "VAL_PE_TTM", name: "市盈率", status: "not_comparable" }),
  ]

  it("可比项念出两侧值与差值，并带报告期", () => {
    const { sentences } = buildDeterministicSummary(facts, "美的集团", "格力电器")
    expect(sentences[0]).toContain("美的集团 21.5%")
    expect(sentences[0]).toContain("格力电器 18.2%")
    expect(sentences[0]).toContain("+3.3 pct")
    expect(sentences[0]).toContain("2025H1")
  })

  it("并列项明确声明不算差值", () => {
    const { sentences } = buildDeterministicSummary(facts, "美的集团", "格力电器")
    expect(sentences[1]).toContain("仅并列不计算差值")
  })

  it("不可比项只说不可比，不出现任何数字", () => {
    const { sentences } = buildDeterministicSummary(facts, "美的集团", "格力电器")
    expect(sentences[2]).toBe("市盈率：至少一侧无可用数据，不可比。")
  })

  it("末句是确定性生成的覆盖范围句", () => {
    const { sentences, coverage } = buildDeterministicSummary(facts, "美的集团", "格力电器")
    expect(sentences[sentences.length - 1]).toContain("本摘要覆盖 1 项可比较指标")
    expect(sentences[sentences.length - 1]).toContain("市盈率")
    expect(coverage.comparable).toBe(1)
  })
})

describe("validateCompareNarrative（模型输出闸门）", () => {
  const pack: CompareRowFact[] = [
    fact({
      metricId: ROE,
      name: "ROE",
      status: "comparable",
      left: { value: 21.53, unit: "%", period: "2025H1" },
      right: { value: 18.2, unit: "%", period: "2025H1" },
      diff: { value: 3.33, unit: "pct" },
    }),
    fact({
      metricId: GROSS,
      name: "毛利率",
      status: "side_by_side",
      left: { value: 26.4, unit: "%", period: "2025H1" },
      right: { value: 24.1, unit: "%", period: "2024H1" },
    }),
  ]

  it("合规的摘要通过：数值来自事实包", () => {
    const issues = validateCompareNarrative(
      [
        { text: "ROE：美的集团 21.5%，格力电器 18.2%，相差 3.3 个百分点。", metricIds: [ROE] },
        { text: "毛利率两侧报告期不同，仅并列：26.4% 与 24.1%。", metricIds: [GROSS] },
      ],
      pack,
      noForbidden,
    )
    expect(issues).toEqual([])
  })

  it("展示层舍入（21.53 → 21.5）允许", () => {
    const issues = validateCompareNarrative(
      [{ text: "ROE 21.5%。", metricIds: [ROE] }],
      pack,
      noForbidden,
    )
    expect(issues).toEqual([])
  })

  it("事实包里没有的数字 → 判定为编造", () => {
    const issues = validateCompareNarrative(
      [{ text: "美的集团 ROE 35%，远高于同行。", metricIds: [ROE] }],
      pack,
      noForbidden,
    )
    expect(issues.map((i) => i.code)).toContain("unanchored_number")
  })

  it("引用事实包中不存在的指标 → 拒绝", () => {
    const issues = validateCompareNarrative(
      [{ text: "营收同比表现不同。", metricIds: ["FIN_REVENUE_YOY_YTD"] }],
      pack,
      noForbidden,
    )
    expect(issues.map((i) => i.code)).toContain("unknown_metric")
  })

  it("句子未声明引用指标 → 拒绝", () => {
    const issues = validateCompareNarrative([{ text: "两家公司差异不大。", metricIds: [] }], pack, noForbidden)
    expect(issues.map((i) => i.code)).toContain("no_metric_ref")
  })

  it("优劣判断词 → 拒绝", () => {
    for (const word of ["更好", "更值得", "领先", "值得投资"]) {
      const issues = validateCompareNarrative(
        [{ text: `美的集团${word}。`, metricIds: [ROE] }],
        pack,
        noForbidden,
      )
      expect(issues.map((i) => i.code)).toContain("judgment")
    }
    // 判断词清单本身要覆盖典型表达
    expect(COMPARE_JUDGMENT_PATTERNS).toContain("更稳健")
  })

  it("合规禁语由调用方注入，命中即拒绝", () => {
    const issues = validateCompareNarrative(
      [{ text: "建议买入美的集团。", metricIds: [ROE] }],
      pack,
      (text) => (text.includes("建议买入") ? [{ pattern: "建议买入" }] : []),
    )
    expect(issues.map((i) => i.code)).toContain("forbidden_output")
  })

  it("超过 5 句 → 拒绝", () => {
    const issues = validateCompareNarrative(
      Array.from({ length: 6 }, () => ({ text: "一句话", metricIds: [ROE] })),
      pack,
      noForbidden,
    )
    expect(issues.map((i) => i.code)).toContain("too_many")
  })

  it("空摘要 → 拒绝", () => {
    expect(validateCompareNarrative([], pack, noForbidden).map((i) => i.code)).toContain("empty")
  })
})

describe("findUnanchoredNumbers（数字锚定的放行边界）", () => {
  const allowed = [21.5, 18.2, 3.3]

  it("带单位的数字必须锚定", () => {
    expect(findUnanchoredNumbers("毛利率 26.4%", allowed)).toEqual(["26.4"])
    expect(findUnanchoredNumbers("市盈率 15 倍", allowed)).toEqual(["15"])
  })

  it("锚定上的数字放行（含舍入）", () => {
    expect(findUnanchoredNumbers("ROE 21.5%，差 3.3 个百分点", allowed)).toEqual([])
    expect(findUnanchoredNumbers("ROE 21.53%", allowed)).toEqual([])
  })

  it("数量词与年份放行，不属于事实编造", () => {
    expect(findUnanchoredNumbers("共有 3 项指标", allowed)).toEqual([])
    expect(findUnanchoredNumbers("报告期为 2025H1", allowed)).toEqual([])
  })

  it("无单位且 ≥10 的整数仍须锚定（防止随口报数）", () => {
    expect(findUnanchoredNumbers("ROE 达到 30", allowed)).toEqual(["30"])
  })
})
