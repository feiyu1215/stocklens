import type { IndexPrice, IndustryValuationSampleData } from "@/lib/data/industry"
import { indexSourceField } from "@/lib/data/industry"
import type { DailyPrice } from "@/lib/data/types"
import { UNITS, type MetricResult } from "./types"
import { buildMarketMetrics, nDayReturnPct } from "./market"

// 市场上下文指标（Task 08 §11–14）：
// 基准（沪深300）与行业指数收益必须与个股 MKT_RETURN_* 完全同口径
// （同一 nDayReturnPct、同一 N+1 收盘价窗口纪律）；相对收益 = 个股 − 基准（pct 差，
// 绝不做除法）。只输出数字，不解释好坏。

const HORIZONS = [20, 60, 120] as const

function indexCloses(prices: IndexPrice[]): number[] {
  return prices.map((p) => p.close)
}

function unavailable(
  metricId: string,
  name: string,
  unit: string,
  reason: string,
): MetricResult {
  return {
    metricId,
    dimension: "market",
    name,
    status: "unavailable",
    value: null,
    unit,
    sourceFields: [],
    calculationMethod: "-",
    unavailableReason: reason,
  }
}

function buildBenchmarkReturns(
  indexPrices: IndexPrice[],
  indexCode: string,
  indexLabel: string,
  prefix: string,
): MetricResult[] {
  const closes = indexCloses(indexPrices)
  const latestDate = indexPrices.length > 0 ? indexPrices[indexPrices.length - 1].date : undefined
  return HORIZONS.map((n): MetricResult => {
    const metricId = `${prefix}_RETURN_${n}D`
    const base: MetricResult = {
      metricId,
      dimension: "market",
      name: `${indexLabel} ${n} 个交易日区间收益率`,
      status: "available",
      value: null,
      unit: UNITS.percent,
      period: latestDate,
      sourceFields: [indexSourceField(indexCode, "close_price", latestDate)],
      calculationMethod: `(latest index close / close ${n} trading days earlier - 1) × 100, same window discipline as MKT_RETURN_${n}D`,
    }
    const value = nDayReturnPct(closes, n)
    if (value === null) {
      return {
        ...base,
        status: "unavailable",
        unavailableReason: `insufficient ${indexLabel} history: ${closes.length} closes available, need ${n + 1}`,
      }
    }
    return { ...base, value }
  })
}

function buildRelativeReturns(
  stockPrices: DailyPrice[],
  benchmarkPrices: IndexPrice[],
  benchmarkCode: string,
  benchmarkLabel: string,
  benchmarkPrefix: "CSI300" | "INDUSTRY",
): MetricResult[] {
  const stockCloses = stockPrices.map((p) => p.close)
  const benchCloses = indexCloses(benchmarkPrices)
  const latestDate = stockPrices.length > 0 ? stockPrices[stockPrices.length - 1].date : undefined

  return HORIZONS.map((n): MetricResult => {
    const metricId = `MKT_RELATIVE_${benchmarkPrefix}_${n}D`
    const base: MetricResult = {
      metricId,
      dimension: "market",
      name: `个股 ${n} 日收益率相对${benchmarkLabel}（百分点差）`,
      status: "available",
      value: null,
      unit: UNITS.pctPoint,
      period: latestDate,
      sourceFields: [
        { source: "fuyao", domain: "prices", field: "close_price", date: latestDate },
        indexSourceField(benchmarkCode, "close_price", latestDate),
      ],
      calculationMethod: `MKT_RETURN_${n}D - ${benchmarkPrefix === "CSI300" ? "MKT_CSI300" : "IND"}_RETURN_${n}D, in percentage points (subtraction, never division)`,
    }
    const stock = nDayReturnPct(stockCloses, n)
    const bench = nDayReturnPct(benchCloses, n)
    if (stock === null || bench === null) {
      return {
        ...base,
        status: "unavailable",
        unavailableReason: `insufficient history: stock ${stockCloses.length} closes / ${benchmarkLabel} ${benchCloses.length} closes (need ${n + 1} each)`,
      }
    }
    return { ...base, value: stock - bench }
  })
}

/**
 * 市场上下文指标全集：个股（既有）+ CSI300 基准 + 相对 CSI300 + 行业 + 相对行业。
 * 任一序列缺失只影响对应指标（unavailable + 原因），不拖垮其余。
 */
export function buildMarketContextMetrics(input: {
  stockPrices: DailyPrice[]
  csi300: IndexPrice[]
  industry?: { indexCode: string; indexName: string; prices: IndexPrice[] }
}): MetricResult[] {
  const base = buildMarketMetrics(input.stockPrices)
  const benchmark = buildBenchmarkReturns(input.csi300, "000300.SH", "沪深300", "MKT_CSI300")
  const relativeCsi300 = buildRelativeReturns(
    input.stockPrices,
    input.csi300,
    "000300.SH",
    "沪深300",
    "CSI300",
  )
  const industryMetrics: MetricResult[] = input.industry
    ? [
        ...buildBenchmarkReturns(
          input.industry.prices,
          input.industry.indexCode,
          `${input.industry.indexName}指数`,
          "IND",
        ),
        ...buildRelativeReturns(
          input.stockPrices,
          input.industry.prices,
          input.industry.indexCode,
          `${input.industry.indexName}指数`,
          "INDUSTRY",
        ),
      ]
    : [
        unavailable("IND_RETURN_20D", "行业指数 20 日收益率", "%", "industry index prices unavailable"),
        unavailable("IND_RETURN_60D", "行业指数 60 日收益率", "%", "industry index prices unavailable"),
        unavailable("IND_RETURN_120D", "行业指数 120 日收益率", "%", "industry index prices unavailable"),
        unavailable("MKT_RELATIVE_INDUSTRY_20D", "个股 20 日收益率相对行业", "pct", "industry index prices unavailable"),
        unavailable("MKT_RELATIVE_INDUSTRY_60D", "个股 60 日收益率相对行业", "pct", "industry index prices unavailable"),
        unavailable("MKT_RELATIVE_INDUSTRY_120D", "个股 120 日收益率相对行业", "pct", "industry index prices unavailable"),
      ]
  return [...base, ...benchmark, ...relativeCsi300, ...industryMetrics]
}

// ---------- 行业估值中位数（§27–29） ----------

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface IndustryValuationStat {
  peMedian: number | null
  peSampleSize: number
  pbMedian: number | null
  pbSampleSize: number
}

/** 行业估值中位数：过滤 null/NaN 与 PE<=0（亏损公司）；样本数必须保留 */
export function computeIndustryValuationStats(
  valuations: IndustryValuationSampleData,
): IndustryValuationStat {
  const pe = valuations.samples
    .map((s) => s.peTtm)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
  const pb = valuations.samples
    .map((s) => s.pb)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
  return {
    peMedian: median(pe),
    peSampleSize: pe.length,
    pbMedian: median(pb),
    pbSampleSize: pb.length,
  }
}

/** 个股估值 vs 行业中位数（差值，不做高低判断） */
export function buildIndustryValuationMetrics(input: {
  peTtm: number | null
  pb: number | null
  stats: IndustryValuationStat
  industryName: string
  date: string
}): MetricResult[] {
  const out: MetricResult[] = []
  const push = (
    metricId: string,
    name: string,
    stockValue: number | null,
    medianValue: number | null,
    unit: string,
  ): void => {
    const base: MetricResult = {
      metricId,
      dimension: "valuation",
      name,
      status: "available",
      value: null,
      unit,
      period: input.date,
      sampleSize: medianValue === null ? 0 : undefined,
      sourceFields: [
        { source: "fuyao", domain: "valuation", field: "pe_ttm/pb_mrq", date: input.date },
        { source: "fuyao", domain: "valuation", field: "industry_median", date: input.date },
      ],
      calculationMethod: "current multiple - industry median (valid samples only: PE>0, finite; median over constituents)",
    }
    if (stockValue === null || medianValue === null) {
      out.push({
        ...base,
        status: "unavailable",
        unavailableReason:
          stockValue === null
            ? "stock multiple unavailable"
            : `industry median unavailable (no valid samples)`,
      })
      return
    }
    out.push({ ...base, value: stockValue - medianValue, sampleSize: input.stats.peSampleSize })
  }
  push(
    "VAL_PE_VS_INDUSTRY_MEDIAN",
    `PE TTM 相对${input.industryName}行业中位数（倍数差）`,
    input.peTtm,
    input.stats.peMedian,
    UNITS.multiple,
  )
  push(
    "VAL_PB_VS_INDUSTRY_MEDIAN",
    `PB MRQ 相对${input.industryName}行业中位数（倍数差）`,
    input.pb,
    input.stats.pbMedian,
    UNITS.multiple,
  )
  return out
}
