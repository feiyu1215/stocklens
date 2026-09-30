import { describe, expect, it } from "vitest"

import { buildMarketMetrics, maxDrawdownPct, nDayReturnPct, annualizedVolatilityPct } from "@/lib/metrics/market"

describe("nDayReturnPct（§44 off-by-one）", () => {
  it("20D：latest vs 恰好 20 个交易日前（21 个收盘价）", () => {
    const closes = Array.from({ length: 21 }, (_, i) => i + 1) // [1..21]
    // 正确：21/1 − 1 = 20 → 2000%；若 off-by-one 用 closes[1]=2 → 950%
    expect(nDayReturnPct(closes, 20)).toBe(2000)
  })

  it("数据不足（≤N 个 close）→ null，不降口径", () => {
    expect(nDayReturnPct(Array.from({ length: 20 }, (_, i) => i + 1), 20)).toBeNull()
    expect(nDayReturnPct([], 20)).toBeNull()
  })
})

describe("annualizedVolatilityPct（§45 口径固定：日对数收益 sample std × sqrt(252)）", () => {
  it("对称对数收益 [+0.01, −0.01] → sample std = 0.01√2 → 22.4499%", () => {
    const closes = [100, 100 * Math.exp(0.01), 100]
    const expected = 0.01 * Math.sqrt(2) * Math.sqrt(252) * 100
    const v = annualizedVolatilityPct(closes, 2)
    expect(v).not.toBeNull()
    expect(v!).toBeCloseTo(expected, 6)
    expect(v!).toBeCloseTo(22.4499, 3)
  })

  it("恒定价格 → 对数收益全 0 → sample std = 0 → 波动率 0（真实 0，非缺失）", () => {
    expect(annualizedVolatilityPct([100, 100, 100, 100], 3)).toBe(0)
  })

  it("样本不足（n 个收益需 n+1 个 close；std 需 ≥2 个收益）→ null", () => {
    expect(annualizedVolatilityPct([100, 101], 20)).toBeNull() // 只有 1 个收益
    expect(annualizedVolatilityPct([100], 20)).toBeNull()
  })
})

describe("maxDrawdownPct（§46）", () => {
  it("[100,120,90,110] → 峰值 120 谷值 90 → −25%", () => {
    expect(maxDrawdownPct([100, 120, 90, 110])).toBeCloseTo(-25, 10)
  })

  it("单调上涨窗口 → 0（真实 0 回撤，输出负号约定：0 即 0）", () => {
    expect(maxDrawdownPct([100, 120, 130, 140])).toBe(0)
  })

  it("[120, 100] → −16.667%", () => {
    expect(maxDrawdownPct([120, 100])).toBeCloseTo(-16.6667, 3)
  })

  it("输出保持负百分数约定", () => {
    expect(maxDrawdownPct([100, 50])).toBe(-50)
  })
})

describe("buildMarketMetrics 窗口纪律", () => {
  const prices = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      stockCode: "000333.SZ",
      date: `2026-${String((i % 12) + 1).padStart(2, "0")}-01`,
      close: 100 + i,
      source: "fuyao" as const,
    }))

  it("119 个收盘价：120D 回撤与 120D 收益 unavailable，20D/60D 可用", () => {
    const ms = buildMarketMetrics(prices(119))
    const byId = Object.fromEntries(ms.map((m) => [m.metricId, m]))
    expect(byId["MKT_MAX_DRAWDOWN_120D"].status).toBe("unavailable")
    expect(byId["MKT_MAX_DRAWDOWN_120D"].unavailableReason).toContain("120")
    expect(byId["MKT_RETURN_120D"].status).toBe("unavailable")
    expect(byId["MKT_RETURN_20D"].status).toBe("available")
    expect(byId["MKT_VOLATILITY_60D"].status).toBe("available") // 61 closes 够 60 收益
  })

  it("完全无行情：6 个指标全部 unavailable 且带原因", () => {
    const ms = buildMarketMetrics([])
    expect(ms).toHaveLength(6)
    expect(ms.every((m) => m.status === "unavailable" && m.unavailableReason)).toBe(true)
  })
})
