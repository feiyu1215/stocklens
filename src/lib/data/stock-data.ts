import "server-only"

import type {
  DailyPrice,
  DataSourceError,
  DebugStockDataResponse,
  FinancialPeriodData,
  StockBasicInfo,
  ValuationData,
} from "./types"
import {
  FuyaoApiError,
  FuyaoConfigError,
  FuyaoNotFoundError,
  FuyaoRequestError,
  fetchCashFlowStatements,
  fetchFinancialIndicators,
  fetchHistoricalPrices,
  fetchIncomeStatements,
  fetchTickerSearch,
  fetchValuationSnapshot,
} from "./fuyao"
import {
  normalizeBasicInfo,
  normalizePrices,
  normalizeValuation,
  periodKeyOf,
  periodToIndicatorReport,
  zipFinancialPeriods,
} from "./normalize"

export const DEFAULT_STOCK_CODE = "000333.SZ"

/** 抓取的季度报告期数量（近 8 期） */
const FINANCIAL_PERIOD_COUNT = 8
/** 历史行情回看自然日（约 200 个交易日 > 180） */
const PRICE_LOOKBACK_DAYS = 300
const DAY_MS = 24 * 3_600_000

function toDataSourceError(
  domain: DataSourceError["domain"],
  err: unknown,
): DataSourceError {
  if (err instanceof FuyaoConfigError) {
    return { source: "fuyao", domain, code: err.code, message: err.message }
  }
  if (err instanceof FuyaoApiError || err instanceof FuyaoNotFoundError) {
    return { source: "fuyao", domain, code: err.code, message: err.message }
  }
  if (err instanceof FuyaoRequestError) {
    return { source: "fuyao", domain, code: "FUYAO_REQUEST_FAILED", message: err.message }
  }
  return {
    source: "fuyao",
    domain,
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : String(err),
  }
}

async function fetchBasic(stockCode: string): Promise<StockBasicInfo> {
  const data = await fetchTickerSearch(stockCode)
  return normalizeBasicInfo(data, stockCode)
}

async function fetchFinancial(
  stockCode: string,
): Promise<{ periods: FinancialPeriodData[]; latestPeriod: string | null }> {
  // 最新报告期自动发现：取近 8 期利润表，按 (fiscal_year, fiscal_period) 取最大，
  // 不依赖接口返回顺序，也不硬编码期次。
  const income = await fetchIncomeStatements(stockCode, FINANCIAL_PERIOD_COUNT)
  const incomeItems = income.item ?? []
  if (incomeItems.length === 0) {
    throw new FuyaoNotFoundError(`财务接口未返回 ${stockCode} 的任何报告期数据`)
  }
  const latestIncome = incomeItems.reduce((acc, row) =>
    periodKeyOf(row.fiscal_year, row.fiscal_period) >
    periodKeyOf(acc.fiscal_year, acc.fiscal_period)
      ? row
      : acc,
  )
  const latestPeriod = periodKeyOf(latestIncome.fiscal_year, latestIncome.fiscal_period)
  const latestReport = periodToIndicatorReport(latestPeriod)

  // 官方指标（毛利率/净利率/ROE）按期查询；失败不拖垮报表本身（记为仅缺指标）
  const [cashflow, indicators] = await Promise.all([
    fetchCashFlowStatements(stockCode, FINANCIAL_PERIOD_COUNT),
    fetchFinancialIndicators(stockCode, latestReport).catch(() => null),
  ])

  const periods = zipFinancialPeriods(
    stockCode,
    incomeItems,
    cashflow.item ?? [],
    indicators,
    new Date(income.timestamp).toISOString(),
  )
  return { periods, latestPeriod }
}

async function fetchValuation(stockCode: string): Promise<ValuationData> {
  const data = await fetchValuationSnapshot(stockCode)
  return normalizeValuation(data, stockCode)
}

async function fetchPrices(stockCode: string): Promise<DailyPrice[]> {
  const endMs = Date.now()
  const startMs = endMs - PRICE_LOOKBACK_DAYS * DAY_MS
  const data = await fetchHistoricalPrices(stockCode, startMs, endMs)
  return normalizePrices(data, stockCode)
}

/**
 * 四类数据域相互独立获取：任一域失败只影响自身 availability 并记入 errors，
 * 绝不拖垮其它域，也绝不以默认值/假数据补位。
 */
export async function gatherStockData(
  stockCode: string = DEFAULT_STOCK_CODE,
): Promise<DebugStockDataResponse> {
  const errors: DataSourceError[] = []
  const requestedAt = new Date().toISOString()

  const [basicR, financialR, valuationR, pricesR] = await Promise.allSettled([
    fetchBasic(stockCode),
    fetchFinancial(stockCode),
    fetchValuation(stockCode),
    fetchPrices(stockCode),
  ])

  const unwrap = <T>(r: PromiseSettledResult<T>): T | null => {
    if (r.status === "fulfilled") return r.value
    return null
  }
  const record = (domain: DataSourceError["domain"], r: PromiseSettledResult<unknown>) => {
    if (r.status === "rejected") errors.push(toDataSourceError(domain, r.reason))
  }
  record("basic", basicR)
  record("financial", financialR)
  record("valuation", valuationR)
  record("prices", pricesR)

  const stock = unwrap(basicR)
  const financial = unwrap(financialR)
  const valuation = unwrap(valuationR)
  const prices = unwrap(pricesR) ?? []

  const availability = {
    basic: stock !== null,
    financial: financial !== null,
    valuation: valuation !== null,
    prices: prices.length > 0,
  }

  return {
    stock,
    financial: financial?.periods ?? [],
    valuation,
    prices,
    availability,
    errors,
    meta: {
      requested_at: requestedAt,
      latest_financial_period: financial?.latestPeriod ?? null,
      latest_price_date: prices.length > 0 ? prices[prices.length - 1].date : null,
    },
  }
}
