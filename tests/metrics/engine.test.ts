import { describe, expect, it } from "vitest"

import type { DebugStockDataResponse, FinancialPeriodData } from "@/lib/data/types"
import { VALUATION_HISTORY_WARNING, calculateMetrics } from "@/lib/metrics/engine"

const TOTAL_EXPECTED = 21 // 财务 13 + 估值 2 + 行情 6

function fp(
  p: string,
  values: Partial<FinancialPeriodData> = {},
): FinancialPeriodData {
  return { stockCode: "000333.SZ", period: p, source: "fuyao", ...values }
}

function makeData(overrides: Partial<DebugStockDataResponse> = {}): DebugStockDataResponse {
  return {
    stock: { stockCode: "000333.SZ", stockName: "美的集团", industry: null, source: "fuyao", updatedAt: null },
    financial: [],
    valuation: null,
    prices: [],
    availability: { basic: true, financial: true, valuation: true, prices: true },
    errors: [],
    meta: { requested_at: "2026-09-30T00:00:00Z", latest_financial_period: null, latest_price_date: null },
    ...overrides,
  }
}

const fullData = makeData({
  financial: [
    fp("2026-Q2", { revenue: 120, netProfit: 30, operatingCashflow: 60, grossMargin: 25, netMargin: 10, roe: 11.33 }),
    fp("2026-Q1", { revenue: 50, netProfit: 12, operatingCashflow: 25 }),
    fp("2025-Q2", { revenue: 100, netProfit: 20, operatingCashflow: 55, grossMargin: 23, netMargin: 9, roe: 10.5 }),
    fp("2025-Q1", { revenue: 40, netProfit: 8, operatingCashflow: 20 }),
  ],
  valuation: {
    stockCode: "000333.SZ",
    date: "2026-09-30",
    peTtm: 13.77168,
    pb: 2.885786,
    source: "fuyao",
    updatedAt: null,
  },
  prices: Array.from({ length: 121 }, (_, i) => ({
    stockCode: "000333.SZ",
    date: `d${String(i).padStart(3, "0")}`,
    close: 100 + i,
    source: "fuyao" as const,
  })),
  meta: {
    requested_at: "2026-09-30T00:00:00Z",
    latest_financial_period: "2026-Q2",
    latest_price_date: "d120",
  },
})

describe("calculateMetrics —— 完整数据 fixture", () => {
  const resp = calculateMetrics(fullData)

  it("产出 21 个指标，全部 available", () => {
    expect(resp.summary).toEqual({ total: TOTAL_EXPECTED, available: TOTAL_EXPECTED, unavailable: 0 })
  })

  it("每个指标都有 provenance（sourceFields 与 calculationMethod）", () => {
    for (const m of resp.metrics) {
      expect(m.sourceFields.length).toBeGreaterThan(0)
      expect(m.calculationMethod).toBeTruthy()
      expect(m.name).toBeTruthy()
    }
  })

  it("不含语义判断字段（signal/score/rating 禁止出现）", () => {
    for (const m of resp.metrics) {
      expect("signal" in m).toBe(false)
      expect("score" in m).toBe(false)
      expect("rating" in m).toBe(false)
    }
  })

  it("数值全部有限（无 NaN / Infinity），原始浮点不舍入", () => {
    for (const m of resp.metrics) {
      if (m.status === "available") {
        expect(Number.isFinite(m.value!)).toBe(true)
      }
    }
    const revYoy = resp.metrics.find((m) => m.metricId === "FIN_REVENUE_YOY_YTD")!
    expect(revYoy.value).toBeCloseTo(20, 9) // 原始浮点，不做 toFixed
  })

  it("关键财务数值正确（累计同比 / 单季同比 / CFO）", () => {
    const byId = Object.fromEntries(resp.metrics.map((m) => [m.metricId, m]))
    expect(byId["FIN_REVENUE_YOY_YTD"]!.value).toBeCloseTo(20, 9)
    expect(byId["FIN_REVENUE_YOY_YTD"]).toMatchObject({ period: "2026-Q2", comparisonPeriod: "2025-Q2" })
    expect(byId["FIN_REVENUE_YOY_QUARTER"]!.value).toBeCloseTo(16.6667, 3)
    expect(byId["FIN_NET_PROFIT_YOY_YTD"]).toMatchObject({ value: 50 })
    expect(byId["FIN_OCF_YOY_YTD"]!.value).toBeCloseTo(9.0909, 3)
    expect(byId["FIN_CFO_TO_NET_PROFIT_YTD"]).toMatchObject({ value: 2, unit: "x" })
    expect(byId["FIN_GROSS_MARGIN_CHANGE_YOY"]).toMatchObject({ value: 2, unit: "pct" })
  })

  it("估值与行情指标正确", () => {
    const byId = Object.fromEntries(resp.metrics.map((m) => [m.metricId, m]))
    expect(byId["VAL_PE_TTM"]).toMatchObject({ value: 13.77168, period: "2026-09-30" })
    expect(byId["VAL_PB_MRQ"]).toMatchObject({ value: 2.885786 })
    // 单调递增序列：回撤为 0（真实 0），120D 收益 = (220/100 − 1)×100 = 120%
    expect(byId["MKT_MAX_DRAWDOWN_120D"]).toMatchObject({ status: "available", value: 0 })
    expect(byId["MKT_RETURN_120D"]!.status).toBe("available")
    expect(byId["MKT_RETURN_120D"]!.value).toBeCloseTo(120, 6)
    expect(byId["MKT_VOLATILITY_20D"]!.status).toBe("available")
  })

  it("顶部信息与 warnings", () => {
    expect(resp.stock).toEqual({ stockCode: "000333.SZ", stockName: "美的集团" })
    expect(resp.latestFinancialPeriod).toBe("2026-Q2")
    expect(resp.latestPriceDate).toBe("d120")
    expect(resp.warnings).toContain(VALUATION_HISTORY_WARNING)
    expect(resp.warnings.some((w) => w.includes("industry"))).toBe(true)
  })
})

describe("calculateMetrics —— 上年同期指标缺失（§16 部分失败）", () => {
  const data = makeData({
    financial: [
      fp("2026-Q2", { revenue: 120, netProfit: 30, operatingCashflow: 60, grossMargin: 25, netMargin: 10, roe: 11.33 }),
      fp("2026-Q1", { revenue: 50, netProfit: 12, operatingCashflow: 25 }),
      fp("2025-Q2", { revenue: 100, netProfit: 20, operatingCashflow: 55 }), // 无指标
      fp("2025-Q1", { revenue: 40, netProfit: 8, operatingCashflow: 20 }),
    ],
    valuation: { stockCode: "000333.SZ", date: "2026-09-30", peTtm: 13.7, pb: 2.8, source: "fuyao", updatedAt: null },
    prices: Array.from({ length: 121 }, (_, i) => ({ stockCode: "000333.SZ", date: `d${i}`, close: 100 + i, source: "fuyao" as const })),
    meta: { requested_at: "", latest_financial_period: "2026-Q2", latest_price_date: "d120" },
  })

  const resp = calculateMetrics(data)

  it("仅 3 个变化类指标 unavailable，其余 18 个不受影响", () => {
    expect(resp.summary).toEqual({ total: TOTAL_EXPECTED, available: 18, unavailable: 3 })
    for (const id of ["FIN_GROSS_MARGIN_CHANGE_YOY", "FIN_NET_MARGIN_CHANGE_YOY", "FIN_ROE_CHANGE_YOY"]) {
      const m = resp.metrics.find((x) => x.metricId === id)!
      expect(m.status).toBe("unavailable")
      expect(m.unavailableReason).toContain("2025-Q2")
    }
    expect(resp.metrics.find((x) => x.metricId === "FIN_REVENUE_YOY_YTD")!.status).toBe("available")
    expect(resp.metrics.find((x) => x.metricId === "FIN_GROSS_MARGIN")!.status).toBe("available")
  })
})

describe("calculateMetrics —— 空数据（全部 unavailable，不静默丢弃）", () => {
  const resp = calculateMetrics(makeData({ stock: null, availability: { basic: false, financial: false, valuation: false, prices: false } }))

  it("21 个指标全部存在且 unavailable，各带原因", () => {
    expect(resp.summary).toEqual({ total: TOTAL_EXPECTED, available: 0, unavailable: TOTAL_EXPECTED })
    for (const m of resp.metrics) {
      expect(m.status).toBe("unavailable")
      expect(m.value).toBeNull()
      expect(m.unavailableReason).toBeTruthy()
    }
  })

  it("stock 为 null，warnings 提示基础信息不可用", () => {
    expect(resp.stock).toBeNull()
    expect(resp.warnings.some((w) => w.includes("basic info"))).toBe(true)
  })
})
