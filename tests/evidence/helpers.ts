import type { MetricResult } from "@/lib/metrics/types"

// 测试 fixture 工具：仅用于单元测试构造指标数据（Task 03 §36 允许；
// 绝不进入 Runtime fallback）。

const DIMENSION_BY_ID: Record<string, MetricResult["dimension"]> = {
  FIN_REVENUE_YOY_YTD: "growth",
  FIN_REVENUE_YOY_QUARTER: "growth",
  FIN_NET_PROFIT_YOY_YTD: "growth",
  FIN_NET_PROFIT_YOY_QUARTER: "growth",
  FIN_OCF_YOY_YTD: "growth",
  FIN_OCF_YOY_QUARTER: "growth",
  FIN_CFO_TO_NET_PROFIT_YTD: "cashflow",
  FIN_GROSS_MARGIN: "profitability",
  FIN_NET_MARGIN: "profitability",
  FIN_ROE: "profitability",
  FIN_GROSS_MARGIN_CHANGE_YOY: "profitability",
  FIN_NET_MARGIN_CHANGE_YOY: "profitability",
  FIN_ROE_CHANGE_YOY: "profitability",
  VAL_PE_TTM: "valuation",
  VAL_PB_MRQ: "valuation",
  MKT_RETURN_20D: "market",
  MKT_RETURN_60D: "market",
  MKT_RETURN_120D: "market",
  MKT_VOLATILITY_20D: "market",
  MKT_VOLATILITY_60D: "market",
  MKT_MAX_DRAWDOWN_120D: "market",
}

export const ALL_METRIC_IDS = Object.keys(DIMENSION_BY_ID)

export function m(metricId: string, value: number | null, extra: Partial<MetricResult> = {}): MetricResult {
  return {
    metricId,
    dimension: DIMENSION_BY_ID[metricId] ?? "growth",
    name: metricId,
    status: value === null ? "unavailable" : "available",
    value,
    unit: "%",
    sourceFields: [],
    calculationMethod: "-",
    ...(value === null ? { unavailableReason: "fixture: unavailable" } : {}),
    ...extra,
  }
}

/** Task 02 真实冒烟数据（000333.SZ 2026-09-30）的 fixture 化版本 */
export function realLikeMetrics(): MetricResult[] {
  return [
    m("FIN_REVENUE_YOY_YTD", 3.55155),
    m("FIN_REVENUE_YOY_QUARTER", 4.58994),
    m("FIN_NET_PROFIT_YOY_YTD", 1.662),
    m("FIN_NET_PROFIT_YOY_QUARTER", 1.32454),
    m("FIN_OCF_YOY_YTD", 0.727113),
    m("FIN_OCF_YOY_QUARTER", 0.273858),
    m("FIN_CFO_TO_NET_PROFIT_YTD", 1.41995, { unit: "x" }),
    m("FIN_GROSS_MARGIN", 25.2558),
    m("FIN_NET_MARGIN", 10.2225),
    m("FIN_ROE", 11.33),
    m("FIN_GROSS_MARGIN_CHANGE_YOY", -0.3641, { unit: "pct" }),
    m("FIN_NET_MARGIN_CHANGE_YOY", -0.3887, { unit: "pct" }),
    m("FIN_ROE_CHANGE_YOY", 0.04, { unit: "pct" }),
    m("VAL_PE_TTM", 13.7717, { unit: "x" }),
    m("VAL_PB_MRQ", 2.88579, { unit: "x" }),
    m("MKT_RETURN_20D", -8.44668),
    m("MKT_RETURN_60D", 1.23862),
    m("MKT_RETURN_120D", 9.83135),
    m("MKT_VOLATILITY_20D", 21.8981),
    m("MKT_VOLATILITY_60D", 20.5867),
    m("MKT_MAX_DRAWDOWN_120D", -10.8522),
  ]
}
