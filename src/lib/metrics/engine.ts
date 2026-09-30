import type { DebugStockDataResponse } from "@/lib/data/types"
import type { IndexPrice, IndustryValuationSampleData } from "@/lib/data/industry"

import { buildFinancialMetrics } from "./financial"
import { buildMarketMetrics } from "./market"
import {
  buildIndustryValuationMetrics,
  buildMarketContextMetrics,
  computeIndustryValuationStats,
} from "./market-context"
import { buildValuationMetrics } from "./valuation"
import type { DebugMetricsResponse, MetricResult, MetricsSummary } from "./types"

// Metric Engine 编排入口：Normalized Data → MetricResult[]
// 只组合，不解释。语义判断属于后续 Evidence Engine。

export const VALUATION_HISTORY_WARNING =
  "historical valuation percentile unavailable because valuation history is not yet connected"

export interface MarketContextInput {
  csi300: IndexPrice[]
  industry?: {
    indexCode: string
    indexName: string
    prices: IndexPrice[]
    valuations?: IndustryValuationSampleData
  }
}

export function calculateMetrics(
  data: DebugStockDataResponse,
  marketContext?: MarketContextInput,
): DebugMetricsResponse {
  const industryValuationMetrics: MetricResult[] = marketContext?.industry?.valuations
    ? buildIndustryValuationMetrics({
        peTtm: data.valuation?.peTtm ?? null,
        pb: data.valuation?.pb ?? null,
        stats: computeIndustryValuationStats(marketContext.industry.valuations),
        industryName: marketContext.industry.indexName,
        date: data.valuation?.date ?? data.meta.latest_price_date ?? "",
      })
    : []

  const marketMetrics: MetricResult[] = marketContext
    ? buildMarketContextMetrics({
        stockPrices: data.prices,
        csi300: marketContext.csi300,
        industry: marketContext.industry
          ? {
              indexCode: marketContext.industry.indexCode,
              indexName: marketContext.industry.indexName,
              prices: marketContext.industry.prices,
            }
          : undefined,
      })
    : buildMarketMetrics(data.prices)

  const metrics: MetricResult[] = [
    ...buildFinancialMetrics(data.financial, data.meta.latest_financial_period),
    ...buildValuationMetrics(data.valuation),
    ...industryValuationMetrics,
    ...marketMetrics,
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
