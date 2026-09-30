import { describe, expect, it } from "vitest"

import type { FinancialPeriodData } from "@/lib/data/types"
import {
  buildFinancialMetrics,
  getStandaloneQuarterValue,
  prevYearSamePeriod,
} from "@/lib/metrics/financial"

function period(
  p: string,
  values: Partial<Pick<FinancialPeriodData, "revenue" | "netProfit" | "operatingCashflow" | "grossMargin" | "netMargin" | "roe">>,
): FinancialPeriodData {
  return { stockCode: "000333.SZ", period: p, source: "fuyao", ...values }
}

describe("报告期工具", () => {
  it("prevYearSamePeriod", () => {
    expect(prevYearSamePeriod("2026-Q2")).toBe("2025-Q2")
    expect(prevYearSamePeriod("2027-Q1")).toBe("2026-Q1")
  })
})

describe("getStandaloneQuarterValue", () => {
  const periods = [
    period("2026-Q4", { revenue: 450 }),
    period("2026-Q3", { revenue: 300 }),
    period("2026-Q2", { revenue: 120 }),
    period("2026-Q1", { revenue: 50 }),
  ]

  it("§38 Q2 standalone = 累计 − Q1 累计", () => {
    expect(getStandaloneQuarterValue(periods, "2026-Q2", "revenue")).toBe(70)
  })

  it("§39 Q4 standalone = 累计 − Q3 累计", () => {
    expect(getStandaloneQuarterValue(periods, "2026-Q4", "revenue")).toBe(150)
  })

  it("Q1 standalone = Q1 累计本身", () => {
    expect(getStandaloneQuarterValue(periods, "2026-Q1", "revenue")).toBe(50)
  })

  it("上季缺失 → null（不假设）", () => {
    const only = [period("2026-Q2", { revenue: 120 })]
    expect(getStandaloneQuarterValue(only, "2026-Q2", "revenue")).toBeNull()
  })

  it("字段缺失 → null", () => {
    expect(getStandaloneQuarterValue(periods, "2026-Q2", "operatingCashflow")).toBeNull()
  })

  it("期次不存在 → null", () => {
    expect(getStandaloneQuarterValue(periods, "2025-Q2", "revenue")).toBeNull()
  })
})

describe("累计同比 / 单季同比 / CFO / 盈利能力（通过 buildFinancialMetrics）", () => {
  const periods = [
    period("2026-Q2", { revenue: 120, netProfit: 30, operatingCashflow: 60, grossMargin: 25, netMargin: 10, roe: 11.33 }),
    period("2026-Q1", { revenue: 50, netProfit: 12, operatingCashflow: 25 }),
    period("2025-Q2", { revenue: 100, netProfit: 20, operatingCashflow: 55, grossMargin: 23, netMargin: 9, roe: 10.5 }),
    period("2025-Q1", { revenue: 40, netProfit: 8, operatingCashflow: 20 }),
  ]

  it("§37 YTD YoY：120 vs 100 → 20%", () => {
    const [m] = buildFinancialMetrics(periods, "2026-Q2").filter((x) => x.metricId === "FIN_REVENUE_YOY_YTD")
    expect(m.status).toBe("available")
    expect(m.value).toBeCloseTo(20, 9)
    expect(m.unit).toBe("%")
    expect(m.comparisonPeriod).toBe("2025-Q2")
    expect(m.sourceFields).toHaveLength(2)
    expect(m.sourceFields[0]).toMatchObject({ field: "operating_income", period: "2026-Q2" })
    expect(m.calculationMethod).toContain("2025-Q2")
  })

  it("§40 单季 YoY：70/60 − 1 = 16.667%（不用累计直接比）", () => {
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_REVENUE_YOY_QUARTER")!
    expect(m.status).toBe("available")
    expect(m.value).toBeCloseTo(16.6667, 3)
    // 单季指标 provenance 应包含 4 个累计源字段（两年各自的本季 + 上季）
    expect(m.sourceFields).toHaveLength(4)
  })

  it("单季同比为真实 0 时 available 且 value=0（不是 unavailable）", () => {
    // 2026Q2 单季 = 120-50 = 70？构造 OCF：60-25=35，55-20=35 → YoY = 0
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_OCF_YOY_QUARTER")!
    expect(m.status).toBe("available")
    expect(m.value).toBe(0)
  })

  it("CFO / Net Profit 正常：60/30 = 2x", () => {
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_CFO_TO_NET_PROFIT_YTD")!
    expect(m.status).toBe("available")
    expect(m.value).toBe(2)
    expect(m.unit).toBe("x")
  })

  it("盈利能力事实指标与同比变化（§43 百分点）", () => {
    const ms = buildFinancialMetrics(periods, "2026-Q2")
    const gross = ms.find((x) => x.metricId === "FIN_GROSS_MARGIN")!
    expect(gross).toMatchObject({ status: "available", value: 25, unit: "%" })

    const change = ms.find((x) => x.metricId === "FIN_GROSS_MARGIN_CHANGE_YOY")!
    expect(change.status).toBe("available")
    expect(change.value).toBe(2) // 25 − 23 = +2 pct，不是 (25/23−1)×100 ≈ 8.7%
    expect(change.unit).toBe("pct")
  })
})

describe("§41 zero denominator / §42 null propagation", () => {
  it("上年同期累计 = 0 → unavailable（非 Infinity）", () => {
    const periods = [period("2026-Q2", { revenue: 120 }), period("2025-Q2", { revenue: 0 })]
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_REVENUE_YOY_YTD")!
    expect(m.status).toBe("unavailable")
    expect(m.value).toBeNull()
    expect(m.unavailableReason).toContain("0")
  })

  it("上年同期单季 = 0 → unavailable", () => {
    const periods = [
      period("2026-Q2", { revenue: 120 }),
      period("2026-Q1", { revenue: 50 }),
      period("2025-Q2", { revenue: 30 }),
      period("2025-Q1", { revenue: 30 }), // 2025Q2 单季 = 0
    ]
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_REVENUE_YOY_QUARTER")!
    expect(m.status).toBe("unavailable")
    expect(m.unavailableReason).toContain("standalone")
  })

  it("本期缺失 → unavailable；上期缺失 → unavailable（不得 null→0）", () => {
    const noCurrent = [period("2025-Q2", { revenue: 100 })]
    const m1 = buildFinancialMetrics(noCurrent, "2026-Q2").find((x) => x.metricId === "FIN_REVENUE_YOY_YTD")!
    expect(m1.status).toBe("unavailable")
    expect(m1.value).toBeNull()

    const noPrev = [period("2026-Q2", { revenue: 120 })]
    const m2 = buildFinancialMetrics(noPrev, "2026-Q2").find((x) => x.metricId === "FIN_REVENUE_YOY_YTD")!
    expect(m2.status).toBe("unavailable")
    expect(m2.value).toBeNull()
    expect(m2.unavailableReason).toContain("2025-Q2")
  })

  it("字段为 null（接口返回空值）→ unavailable，不是 0", () => {
    const periods = [period("2026-Q2", { revenue: null }), period("2025-Q2", { revenue: 100 })]
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_REVENUE_YOY_YTD")!
    expect(m.status).toBe("unavailable")
    expect(m.unavailableReason).toContain("missing")
  })
})

describe("CFO / Net Profit 边界规则", () => {
  it("netProfit = 0 → unavailable", () => {
    const periods = [period("2026-Q2", { operatingCashflow: 60, netProfit: 0 })]
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_CFO_TO_NET_PROFIT_YTD")!
    expect(m.status).toBe("unavailable")
    expect(m.unavailableReason).toContain("net profit = 0")
  })

  it("netProfit < 0 → unavailable（明确规则：≤0 无解释价值）", () => {
    const periods = [period("2026-Q2", { operatingCashflow: 60, netProfit: -5 })]
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_CFO_TO_NET_PROFIT_YTD")!
    expect(m.status).toBe("unavailable")
    expect(m.unavailableReason).toContain("not meaningful")
  })

  it("OCF 缺失 → unavailable", () => {
    const periods = [period("2026-Q2", { netProfit: 30 })]
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_CFO_TO_NET_PROFIT_YTD")!
    expect(m.status).toBe("unavailable")
  })
})

describe("盈利能力历史指标缺失", () => {
  it("指标未取到（undefined）→ fact unavailable；变化 unavailable；不影响 growth", () => {
    const periods = [period("2026-Q2", { revenue: 120 }), period("2025-Q2", { revenue: 100 })]
    const ms = buildFinancialMetrics(periods, "2026-Q2")
    const fact = ms.find((x) => x.metricId === "FIN_ROE")!
    expect(fact.status).toBe("unavailable")
    expect(fact.unavailableReason).toContain("not fetched")

    const change = ms.find((x) => x.metricId === "FIN_ROE_CHANGE_YOY")!
    expect(change.status).toBe("unavailable")

    const yoy = ms.find((x) => x.metricId === "FIN_REVENUE_YOY_YTD")!
    expect(yoy.status).toBe("available")
    expect(yoy.value).toBeCloseTo(20, 9)
  })

  it("指标取到但为 null → fact unavailable（reason 含 is null）", () => {
    const periods = [period("2026-Q2", { roe: null })]
    const m = buildFinancialMetrics(periods, "2026-Q2").find((x) => x.metricId === "FIN_ROE")!
    expect(m.status).toBe("unavailable")
    expect(m.unavailableReason).toContain("is null")
  })
})

describe("无报告期时 13 个财务指标全部 unavailable（不静默丢弃）", () => {
  it("latestPeriod = null", () => {
    const ms = buildFinancialMetrics([], null)
    expect(ms).toHaveLength(13)
    expect(ms.every((m) => m.status === "unavailable")).toBe(true)
    expect(ms.every((m) => m.unavailableReason)).toBe(true)
  })
})
