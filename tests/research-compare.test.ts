// 双公司对比 P0 —— 纯函数层测试（固定指标目录 / 可比性规则 / 复合证据身份 / 可用性三态）

import { describe, expect, it } from "vitest"

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import type { Evidence } from "@/lib/evidence/types"
import type { MetricResult } from "@/lib/metrics/types"
import {
  COMPARE_CATALOG,
  buildCompareRows,
  classifyResearchLoad,
  describeSampleMix,
  formatMetricDiff,
  formatMetricValue,
} from "@/lib/v5/compare"

/** 构造最小可用 payload：目录内指标按 overrides 提供值与报告期 */
function makePayload(
  stockCode: string,
  metrics: MetricResult[],
  evidence: Evidence[] = [],
): ResearchSpacePayload {
  return {
    spaceId: `SP_${stockCode}`,
    company: {
      stockCode,
      stockName: `公司${stockCode.slice(0, 2)}`,
      capabilities: [],
      availableCapabilities: [],
      partialCapabilities: [],
      unavailableCapabilities: [],
    },
    frame: { intent: "test", framingReason: "test" },
    dimensions: [],
    claims: [],
    evidence,
    suggestions: [],
    trend: [],
    metrics,
    ai: { status: "success" },
    errors: [],
  }
}

function metric(
  metricId: string,
  value: number | null,
  period: string,
  unit = "%",
  unavailableReason?: string,
): MetricResult {
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
    ...(value === null && unavailableReason ? { unavailableReason } : {}),
  }
}

function factEvidence(evidenceId: string, statement: string): Evidence {
  return {
    evidenceId,
    dimension: "growth",
    title: evidenceId,
    statement,
    type: "fact",
    signal: "neutral",
    confidence: "high",
    metricIds: [evidenceId],
    basedOn: [],
    sourceFields: [],
    verifyStatus: "verified",
    confidenceReason: "test",
  }
}

const A = makePayload(
  "000333.SZ",
  [
    metric("FIN_REVENUE_YOY_YTD", 9.5, "2025-Q3"),
    metric("FIN_GROSS_MARGIN", 26.4, "2025-Q3"),
    metric("VAL_PE_TTM", 12.3, "2026-09-30", "x"),
    metric("FIN_ROE", null, "2025-Q3", "%", "报告期数据缺失"),
  ],
  [
    factEvidence("EV_FACT_FIN_REVENUE_YOY_YTD", "A 的营收证据：累计同比 9.5%。"),
    factEvidence("EV_FACT_FIN_GROSS_MARGIN", "A 的毛利率证据：26.4%。"),
  ],
)

const B = makePayload(
  "000651.SZ",
  [
    metric("FIN_REVENUE_YOY_YTD", 6.2, "2025-Q3"),
    metric("FIN_GROSS_MARGIN", 29.1, "2024-Q3"), // 报告期不同 → 并列参考
    metric("VAL_PE_TTM", 10.1, "2026-09-30", "x"),
    metric("FIN_ROE", 18.5, "2025-Q3"), // A 侧 unavailable → 不可比
  ],
  [
    factEvidence("EV_FACT_FIN_REVENUE_YOY_YTD", "B 的营收证据：累计同比 6.2%。"),
    factEvidence("EV_FACT_FIN_GROSS_MARGIN", "B 的毛利率证据：29.1%。"),
  ],
)

function rowOf(metricId: string) {
  const rows = buildCompareRows(A, B)
  const row = rows.find((r) => r.def.metricId === metricId)
  expect(row, `目录中应存在 ${metricId}`).toBeTruthy()
  return row!
}

describe("固定指标目录", () => {
  it("目录包含四组九项，metricId 与指标层一致", () => {
    expect(COMPARE_CATALOG).toHaveLength(9)
    const ids = COMPARE_CATALOG.map((d) => d.metricId)
    expect(new Set(ids).size).toBe(9)
    for (const id of [
      "FIN_REVENUE_YOY_YTD", "FIN_NET_PROFIT_YOY_YTD", "FIN_OCF_YOY_YTD",
      "FIN_GROSS_MARGIN", "FIN_NET_MARGIN", "FIN_ROE",
      "FIN_CFO_TO_NET_PROFIT_YTD", "VAL_PE_TTM", "VAL_PB_MRQ",
    ]) {
      expect(ids).toContain(id)
    }
  })
})

describe("可比性三级判定（确定性规则）", () => {
  it("同报告期且双方 available → comparable，差值为 left−right、单位 pct", () => {
    const row = rowOf("FIN_REVENUE_YOY_YTD")
    expect(row.status).toBe("comparable")
    expect(row.diff?.unit).toBe("pct")
    expect(row.diff?.value).toBeCloseTo(9.5 - 6.2, 10)
  })

  it("双方 available 但报告期不同 → side_by_side，不算差值", () => {
    const row = rowOf("FIN_GROSS_MARGIN")
    expect(row.status).toBe("side_by_side")
    expect(row.diff).toBeNull()
  })

  it("任一方 unavailable → not_comparable，保留 unavailableReason、不伪造数值", () => {
    const row = rowOf("FIN_ROE")
    expect(row.status).toBe("not_comparable")
    expect(row.diff).toBeNull()
    expect(row.left.status).toBe("unavailable")
    expect(row.left.unavailableReason).toBe("报告期数据缺失")
    expect(row.left.value).toBeNull()
  })

  it("目录指标在 metrics 中不存在 → missing，不伪造零值", () => {
    const row = rowOf("FIN_NET_PROFIT_YOY_YTD")
    expect(row.status).toBe("not_comparable")
    expect(row.diff).toBeNull()
    expect(row.left.status).toBe("missing")
    expect(row.right.status).toBe("missing")
  })

  it("x 单位指标的差值为绝对差、单位 x", () => {
    const row = rowOf("VAL_PE_TTM")
    expect(row.status).toBe("comparable")
    expect(row.diff?.unit).toBe("x")
    expect(row.diff?.value).toBeCloseTo(12.3 - 10.1, 10)
  })
})

describe("复合证据身份（相同原始证据 ID 不串线）", () => {
  it("两份 payload 各自持有同名 EV_FACT_ 前缀证据，statement 各归各家", () => {
    const row = rowOf("FIN_GROSS_MARGIN")
    expect(row.left.evidenceId).toBe("EV_FACT_FIN_GROSS_MARGIN")
    expect(row.right.evidenceId).toBe("EV_FACT_FIN_GROSS_MARGIN")
    expect(row.left.statement).toBe("A 的毛利率证据：26.4%。")
    expect(row.right.statement).toBe("B 的毛利率证据：29.1%。")
  })

  it("证据缺失时 statement 为 undefined，不影响可比性判定", () => {
    const row = rowOf("VAL_PE_TTM")
    expect(row.left.statement).toBeUndefined()
    expect(row.status).toBe("comparable")
  })
})

describe("数据可用性三态", () => {
  it("null → missing", () => {
    expect(classifyResearchLoad(null).state).toBe("missing")
  })

  it("metrics 缺失 → incomplete（只展示可验证部分）", () => {
    const p = makePayload("000333.SZ", [])
    const result = classifyResearchLoad({ payload: p, recordedSample: false })
    expect(result.state).toBe("incomplete")
    expect(result.issue).toContain("metrics")
  })

  it("结构完整 → ok", () => {
    const result = classifyResearchLoad({ payload: A, recordedSample: false })
    expect(result.state).toBe("ok")
  })
})

describe("示例/真实数据混合判定", () => {
  it("混合时返回 mixed（页面据此给显著警示）", () => {
    expect(describeSampleMix(true, false)).toBe("mixed")
    expect(describeSampleMix(false, true)).toBe("mixed")
    expect(describeSampleMix(true, true)).toBe("both_recorded")
    expect(describeSampleMix(false, false)).toBe("both_real")
  })
})

describe("展示格式化", () => {
  it("值：% 一位小数，x 两位小数", () => {
    expect(formatMetricValue(9.53, "%")).toBe("9.5%")
    expect(formatMetricValue(12.341, "x")).toBe("12.34x")
  })

  it("差值：带符号，% 显示 pct，零值中性", () => {
    expect(formatMetricDiff(3.3, "pct")).toBe("+3.3 pct")
    expect(formatMetricDiff(-2.2, "x")).toBe("−2.20 x")
    expect(formatMetricDiff(0, "pct")).toBe("±0.0 pct")
  })
})
