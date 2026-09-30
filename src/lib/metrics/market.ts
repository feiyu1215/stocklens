import type { DailyPrice } from "@/lib/data/types"
import { UNITS, type MetricResult, type MetricSourceField } from "./types"

// 行情类指标（确定性计算，无语义判断）。
// 输入为已归一化的日线收盘价（date ASC）。数据不足 → unavailable，
// 禁止"有多少天算多少天"（口径漂移）。

const TRADING_DAYS_PER_YEAR = 252

function priceSource(date?: string): MetricSourceField {
  return { source: "fuyao", domain: "prices", field: "close_price", date }
}

/** N 个交易日跨度收益率（需 N+1 个收盘价）：(latest / close[N 交易日前] - 1) × 100 */
export function nDayReturnPct(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null
  const latest = closes[closes.length - 1]
  const base = closes[closes.length - 1 - n]
  if (!Number.isFinite(latest) || !Number.isFinite(base) || base === 0) return null
  return (latest / base - 1) * 100
}

/**
 * 年化波动率：最近 N 个日对数收益率的标准差 × sqrt(252)，×100 得百分比。
 * 标准差约定：sample standard deviation（分母 n-1），全代码库唯一约定。
 */
export function annualizedVolatilityPct(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null // n 个收益需要 n+1 个收盘价
  const window = closes.slice(closes.length - 1 - n)
  const returns: number[] = []
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]
    const cur = window[i]
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0 || cur <= 0) return null
    returns.push(Math.log(cur / prev))
  }
  if (returns.length < 2) return null // sample std 至少需要 2 个样本
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100
}

/** 窗口内最大回撤：min(price / running_peak - 1) × 100，输出负百分数 */
export function maxDrawdownPct(closes: number[]): number | null {
  if (closes.length < 2) return null
  let peak = closes[0]
  let minDrawdown = 0
  for (const price of closes) {
    if (!Number.isFinite(price) || price <= 0) return null
    if (price > peak) peak = price
    const drawdown = price / peak - 1
    if (drawdown < minDrawdown) minDrawdown = drawdown
  }
  return minDrawdown * 100
}

function returnMetric(closes: number[], n: number, latestDate?: string): MetricResult {
  const base: MetricResult = {
    metricId: `MKT_RETURN_${n}D`,
    dimension: "market",
    name: `${n} 个交易日区间收益率`,
    status: "available",
    value: null,
    unit: UNITS.percent,
    period: latestDate,
    sourceFields: [priceSource(latestDate)],
    calculationMethod: `(latest close / close ${n} trading days earlier - 1) × 100`,
  }
  const value = nDayReturnPct(closes, n)
  if (value === null) {
    return {
      ...base,
      status: "unavailable",
      value: null,
      unavailableReason: `insufficient price history: ${closes.length} closes available, need ${n + 1}`,
    }
  }
  return { ...base, value }
}

function volatilityMetric(closes: number[], n: number, latestDate?: string): MetricResult {
  const base: MetricResult = {
    metricId: `MKT_VOLATILITY_${n}D`,
    dimension: "market",
    name: `${n} 日年化波动率`,
    status: "available",
    value: null,
    unit: UNITS.percent,
    period: latestDate,
    sourceFields: [priceSource(latestDate)],
    calculationMethod: `annualized standard deviation of daily log returns, 252 trading days, sample std (n-1), last ${n} returns`,
  }
  const value = annualizedVolatilityPct(closes, n)
  if (value === null) {
    return {
      ...base,
      status: "unavailable",
      value: null,
      unavailableReason: `insufficient price history: ${closes.length} closes available, need ${n + 1} for ${n} log returns`,
    }
  }
  return { ...base, value }
}

function maxDrawdownMetric(closes: number[], windowDays: number, latestDate?: string): MetricResult {
  const base: MetricResult = {
    metricId: `MKT_MAX_DRAWDOWN_${windowDays}D`,
    dimension: "market",
    name: `${windowDays} 交易日最大回撤`,
    status: "available",
    value: null,
    unit: UNITS.percent,
    period: latestDate,
    sourceFields: [priceSource(latestDate)],
    calculationMethod: `min(price / running_peak - 1) × 100 over last ${windowDays} trading days, output as negative percentage`,
  }
  if (closes.length < windowDays) {
    return {
      ...base,
      status: "unavailable",
      value: null,
      unavailableReason: `insufficient price history: ${closes.length} closes available, need ${windowDays}`,
    }
  }
  const value = maxDrawdownPct(closes.slice(closes.length - windowDays))
  if (value === null) {
    return { ...base, status: "unavailable", value: null, unavailableReason: "non-finite or non-positive price in window" }
  }
  return { ...base, value }
}

export function buildMarketMetrics(prices: DailyPrice[]): MetricResult[] {
  const closes = prices.map((p) => p.close)
  const latestDate = prices.length > 0 ? prices[prices.length - 1].date : undefined
  return [
    returnMetric(closes, 20, latestDate),
    returnMetric(closes, 60, latestDate),
    returnMetric(closes, 120, latestDate),
    volatilityMetric(closes, 20, latestDate),
    volatilityMetric(closes, 60, latestDate),
    maxDrawdownMetric(closes, 120, latestDate),
  ]
}
