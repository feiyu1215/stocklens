import type { DebugStockDataResponse } from "@/lib/data/types"

import { buildFinancialMetrics } from "./financial"
import { buildMarketMetrics } from "./market"
import type { DebugMetricsResponse, MetricResult, MetricsSummary } from "./types"
import { buildValuationMetrics } from "./valuation"

// Metric Engine 编排入口：Normalized Data → MetricResult[]
// 只组合，不解释。语义判断属于后续 Evidence Engine。

export const VALUATION_HISTORY_WARNING =
  "historical valuation percentile unavailable because valuation history is not yet connected"

export function calculateMetrics(data: DebugStockDataResponse): DebugMetricsResponse {
  const metrics: MetricResult[] = [
    ...buildFinancialMetrics(data.financial, data.meta.latest_financial_period),
    ...buildValuationMetrics(data.valuation),
    ...buildMarketMetrics(data.prices),
  ]

  const available = metrics.filter((m) => m.status === "available").length
  const summary: MetricsSummary = {
    total: metrics.length,
    available,
    unavailable: metrics.length - available,
  }

  const warnings: string[] = [VALUATION_HISTORY_WARNING]
  if (!data.stock) {
    warnings.push("stock basic info unavailable; financial/valuation/market metrics may also be unavailable for the same reason")
  }
  // industry = null（Task 01 确认扶摇不提供）：行业类指标按 PRD 留待 P1，此处不构建
  if (data.stock && data.stock.industry == null) {
    warnings.push("industry is unknown; industry-relative metrics are not computed")
  }

  return {
    stock: data.stock
      ? { stockCode: data.stock.stockCode, stockName: data.stock.stockName }
      : null,
    latestFinancialPeriod: data.meta.latest_financial_period,
    latestPriceDate: data.meta.latest_price_date,
    metrics,
    summary,
    warnings,
  }
}
