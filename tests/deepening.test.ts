import { describe, expect, it } from "vitest"

import type { IndexPrice } from "@/lib/data/industry"
import { VERIFIED_INDUSTRY_MAPPINGS, getVerifiedIndustry } from "@/lib/data/verified-industry"
import { buildFinancialTrend, latestQuarterYoYValues } from "@/lib/metrics/trend"
import {
  buildIndustryValuationMetrics,
  buildMarketContextMetrics,
  computeIndustryValuationStats,
} from "@/lib/metrics/market-context"
import { buildEvidence } from "@/lib/evidence/engine"
import type { FinancialPeriodData, DailyPrice } from "@/lib/data/types"
import { m, realLikeMetrics } from "./evidence/helpers"

// ---------- 构造工具 ----------

function stockPrices(closes: number[]): DailyPrice[] {
  return closes.map((c, i) => ({
    stockCode: "000333.SZ",
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: c,
    source: "fuyao" as const,
  }))
}

function indexPrices(closes: number[]): IndexPrice[] {
  return closes.map((c, i) => ({
    indexCode: "000300.SH",
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: c,
    source: "fuyao" as const,
  }))
}

function fp(period: string, revenue: number | null, netProfit: number | null = null, ocf: number | null = null): FinancialPeriodData {
  return { stockCode: "000333.SZ", period, revenue, netProfit, operatingCashflow: ocf, source: "fuyao" }
}

// ---------- §37 高风险测试 ----------

describe("CSI300 与个股同口径（§11–12）", () => {
  const closes = Array.from({ length: 121 }, (_, i) => 100 + i) // 单调递增 121 根

  it("指数 20D 收益与个股同口径：均使用 N+1 收盘价窗口", () => {
    const metrics = buildMarketContextMetrics({
      stockPrices: stockPrices(closes),
      csi300: indexPrices(closes),
    })
    const stock20 = metrics.find((x) => x.metricId === "MKT_RETURN_20D")!
    const index20 = metrics.find((x) => x.metricId === "MKT_CSI300_RETURN_20D")!
    // 同一价格序列 → 收益率必然相等（证明口径一致）
    expect(stock20.value).toBeCloseTo(index20.value!, 10)
    expect(index20.calculationMethod).toContain("same window discipline")
  })

  it("指数数据不足 → unavailable 且带原因（不降窗口口径）", () => {
    const metrics = buildMarketContextMetrics({
      stockPrices: stockPrices(closes),
      csi300: indexPrices(closes.slice(0, 20)),
    })
    const index20 = metrics.find((x) => x.metricId === "MKT_CSI300_RETURN_20D")!
    expect(index20.status).toBe("unavailable")
    expect(index20.unavailableReason).toContain("insufficient")
  })

  it("相对收益 = 个股 − 基准（减法，pct 差）", () => {
    // 个股 +10%（121/110-1），指数与个股不同：后 21 根指数走平
    const stock = Array.from({ length: 121 }, (_, i) => 100 + i)
    const index = [...Array.from({ length: 100 }, (_, i) => 100 + i), ...Array(21).fill(200)]
    const metrics = buildMarketContextMetrics({
      stockPrices: stockPrices(stock),
      csi300: indexPrices(index),
    })
    const rel = metrics.find((x) => x.metricId === "MKT_RELATIVE_CSI300_20D")!
    const s = metrics.find((x) => x.metricId === "MKT_RETURN_20D")!
    const b = metrics.find((x) => x.metricId === "MKT_CSI300_RETURN_20D")!
    expect(rel.unit).toBe("pct")
    expect(rel.value).toBeCloseTo(s.value! - b.value!, 10)
    expect(rel.calculationMethod).toContain("never division")
  })

  it("任一序列缺失 → 相对指标 unavailable（不是 0）", () => {
    const metrics = buildMarketContextMetrics({
      stockPrices: stockPrices([100, 101]),
      csi300: indexPrices([100, 102]),
    })
    const rel = metrics.find((x) => x.metricId === "MKT_RELATIVE_CSI300_20D")!
    expect(rel.status).toBe("unavailable")
    expect(rel.value).toBeNull()
  })
})

describe("行业 mapping 溯源（§6–7）", () => {
  it("000333.SZ 的 mapping 带完整溯源字段（非无来源 hardcode）", () => {
    const mapping = getVerifiedIndustry("000333.SZ")!
    expect(mapping).toBeDefined()
    expect(mapping.industryIndexCode).toBe("881131.TI")
    expect(mapping.industryName).toBe("白色家电")
    expect(mapping.source).toBe("fuyao")
    expect(mapping.verifiedAt).toBeTruthy()
    expect(mapping.verificationMethod).toContain("成分股")
  })

  it("未验证的股票返回 null（不猜测行业）", () => {
    expect(getVerifiedIndustry("600519.SH")).toBeNull()
    expect(VERIFIED_INDUSTRY_MAPPINGS.every((m0) => m0.verificationMethod.length > 0)).toBe(true)
  })

  it("行业指数行情缺失 → 指标 unavailable + 拆分后的行业 UNKNOWN", () => {
    const metrics = buildMarketContextMetrics({
      stockPrices: stockPrices(Array.from({ length: 130 }, (_, i) => 100 + i)),
      csi300: indexPrices(Array.from({ length: 130 }, (_, i) => 4000 + i)),
      industry: { indexCode: "881131.TI", indexName: "白色家电", prices: [] },
    })
    expect(metrics.find((x) => x.metricId === "IND_RETURN_20D")!.status).toBe("unavailable")

    const bundle = buildEvidence({
      metrics,
      context: {
        stockCode: "000333.SZ",
        stockName: "美的集团",
        industry: "白色家电",
        industryPricesAvailable: false,
        industryValuationAvailable: false,
      },
    })
    const ids = bundle.evidence.map((e) => e.evidenceId)
    expect(ids).toContain("EV_UNKNOWN_INDUSTRY_PRICES")
    expect(ids).toContain("EV_UNKNOWN_INDUSTRY_PEER_FINANCIALS")
    expect(ids).toContain("EV_UNKNOWN_INDUSTRY_VALUATION")
    expect(ids).not.toContain("EV_UNKNOWN_INDUSTRY_COMPARISON") // 行业已知，不再笼统 unknown
  })
})

describe("行业估值中位数（§27–29）", () => {
  const valuations = {
    industryIndexCode: "881131.TI",
    source: "fuyao" as const,
    updatedAt: "2026-09-30T00:00:00Z",
    samples: [
      { thscode: "A", peTtm: 10, pb: 1 },
      { thscode: "B", peTtm: 20, pb: 3 },
      { thscode: "C", peTtm: null, pb: 2 },
      { thscode: "D", peTtm: -5, pb: null }, // 负 PE 应被过滤
      { thscode: "E", peTtm: 30, pb: Number.NaN },
    ],
  }

  it("过滤 null/NaN/负 PE，并保留有效样本数", () => {
    const stats = computeIndustryValuationStats(valuations)
    expect(stats.peMedian).toBe(20) // [10,20,30] 的中位数
    expect(stats.peSampleSize).toBe(3)
    expect(stats.pbMedian).toBe(2) // [1,3,2] 的中位数
    expect(stats.pbSampleSize).toBe(3)
  })

  it("个股 PE 与行业中位数之差（倍数差，不做高低判断）", () => {
    const stats = computeIndustryValuationStats(valuations)
    const metrics = buildIndustryValuationMetrics({
      peTtm: 13.77,
      pb: 2.89,
      stats,
      industryName: "白色家电",
      date: "2026-09-30",
    })
    const pe = metrics.find((x) => x.metricId === "VAL_PE_VS_INDUSTRY_MEDIAN")!
    expect(pe.value).toBeCloseTo(13.77 - 20, 10)
    expect(pe.sampleSize).toBe(3)
    expect(pe.unit).toBe("x")
  })

  it("行业样本全无效 → unavailable（不编造中位数）", () => {
    const stats = computeIndustryValuationStats({
      ...valuations,
      samples: [{ thscode: "A", peTtm: -1, pb: null }],
    })
    expect(stats.peMedian).toBeNull()
    const metrics = buildIndustryValuationMetrics({
      peTtm: 13.77, pb: 2.89, stats, industryName: "白色家电", date: "2026-09-30",
    })
    expect(metrics.every((x) => x.status === "unavailable")).toBe(true)
  })
})

describe("单季趋势序列（§15–17）", () => {
  // 累计口径：2026-Q1=100, Q2=220；2025-Q1=80, Q2=160；2024 同期供上一可比季
  const periods = [
    fp("2026-Q2", 220, 44, 60),
    fp("2026-Q1", 100, 20, 25),
    fp("2025-Q2", 160, 40, 55),
    fp("2025-Q1", 80, 16, 20),
  ]

  it("单季差分复用 Task 02 算法（Q2 单季 = 累计 − Q1 累计），ASC 排序", () => {
    const trend = buildFinancialTrend(periods)
    expect(trend.map((p) => p.period)).toEqual(["2025-Q1", "2025-Q2", "2026-Q1", "2026-Q2"])
    const q2 = trend.find((p) => p.period === "2026-Q2")!
    expect(q2.revenueQuarter).toBe(120) // 220 - 100
    expect(q2.netProfitQuarter).toBe(24)
    expect(q2.operatingCashflowQuarter).toBe(35)
  })

  it("单季同比：仅有上年同期可比期才计算，缺失为 null", () => {
    const trend = buildFinancialTrend(periods)
    const q2 = trend.find((p) => p.period === "2026-Q2")!
    // 2026Q2 单季 120 vs 2025Q2 单季 80 → +50%
    expect(q2.revenueQuarterYoY).toBeCloseTo(50, 10)
    // 2025 年没有 2024 基期 → null
    expect(trend.find((p) => p.period === "2025-Q2")!.revenueQuarterYoY).toBeNull()
  })

  it("latestQuarterYoYValues 取最近 N 个可比值（跳过 null）", () => {
    const trend = buildFinancialTrend(periods)
    const values = latestQuarterYoYValues(trend, "revenueQuarterYoY", 3)
    expect(values.map((v) => v.period)).toEqual(["2026-Q1", "2026-Q2"])
    expect(values[0].value).toBeCloseTo(25, 10) // 100 vs 80 → +25%
  })
})

describe("趋势规则触发/不触发（§21–22）", () => {
  const CTX = { stockCode: "000333.SZ", stockName: "美的集团", industry: null }

  function evidenceWithTrend(trend: { period: string; value: number }[]) {
    const metrics = [...realLikeMetrics()]
    return buildEvidence({
      metrics,
      context: CTX,
      trend: {
        quarterYoY: (_field, n) => trend.slice(-n),
      },
    })
  }

  it("最近 3 个可比单季全部为正 → 触发连续同向（neutral）", () => {
    const bundle = evidenceWithTrend([
      { period: "2025-Q4", value: 5 },
      { period: "2026-Q1", value: 3 },
      { period: "2026-Q2", value: 1.2 },
    ])
    const e = bundle.evidence.find((x) => x.evidenceId === "EV_INF_TREND_REVENUE_QUARTER_DIRECTION_RUN")!
    expect(e).toBeDefined()
    expect(e.signal).toBe("neutral")
    expect(e.statement).toContain("均")
  })

  it("方向不一致 → 不触发连续同向", () => {
    const bundle = evidenceWithTrend([
      { period: "2025-Q4", value: 5 },
      { period: "2026-Q1", value: -3 },
      { period: "2026-Q2", value: 1.2 },
    ])
    expect(bundle.evidence.find((x) => x.evidenceId === "EV_INF_TREND_REVENUE_QUARTER_DIRECTION_RUN")).toBeUndefined()
  })

  it("最近两季由负转正 → 触发反转（conflict）；同向不触发", () => {
    const flipped = evidenceWithTrend([
      { period: "2026-Q1", value: -2 },
      { period: "2026-Q2", value: 3 },
    ])
    const e = flipped.evidence.find((x) => x.evidenceId === "EV_INF_TREND_REVENUE_QUARTER_REVERSAL")!
    expect(e.signal).toBe("conflict")
    expect(e.statement).toContain("由负转正")

    const same = evidenceWithTrend([
      { period: "2026-Q1", value: 2 },
      { period: "2026-Q2", value: 3 },
    ])
    expect(same.evidence.find((x) => x.evidenceId === "EV_INF_TREND_REVENUE_QUARTER_REVERSAL")).toBeUndefined()
  })

  it("趋势规则引用真实存在的 FACT（validator 通过）", () => {
    const bundle = evidenceWithTrend([
      { period: "2026-Q1", value: -2 },
      { period: "2026-Q2", value: 3 },
    ])
    const e = bundle.evidence.find((x) => x.evidenceId === "EV_INF_TREND_REVENUE_QUARTER_REVERSAL")!
    const ids = new Set(bundle.evidence.map((x) => x.evidenceId))
    expect(e.basedOn.length).toBeGreaterThanOrEqual(2)
    for (const ref of e.basedOn) expect(ids.has(ref)).toBe(true)
  })
})

describe("基准/相对 FACT 语义（§14）", () => {
  it("相对表现仅陈述百分点差，不做好坏判断", () => {
    const metrics = [
      ...realLikeMetrics(),
      m("MKT_RELATIVE_CSI300_20D", -5.45, { unit: "pct" }),
    ]
    const bundle = buildEvidence({
      metrics,
      context: { stockCode: "000333.SZ", stockName: "美的集团", industry: null },
    })
    const e = bundle.evidence.find((x) => x.evidenceId === "EV_FACT_MKT_RELATIVE_CSI300_20D")!
    expect(e.signal).toBe("negative") // 仅表示相对方向
    expect(e.statement).toContain("较沪深300低 5.45 个百分点")
    expect(e.statement).not.toMatch(/跑输|较差|不佳/)
  })
})
