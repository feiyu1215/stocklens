import "server-only"

// 扶摇金融数据 REST 客户端 —— 唯一允许直接调用扶摇的模块。
// 只做三件事：鉴权、请求、信封校验；字段归一化一律在 normalize.ts 完成。

const FUYAO_BASE_URL = "https://fuyao.aicubes.cn"
const DEFAULT_TIMEOUT_MS = 15_000

export class FuyaoConfigError extends Error {
  readonly code = "FUYAO_CONFIG_MISSING"
  constructor(message: string) {
    super(message)
    this.name = "FuyaoConfigError"
  }
}

export class FuyaoApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "FuyaoApiError"
  }
}

export class FuyaoNotFoundError extends Error {
  readonly code = "FUYAO_NOT_FOUND"
  constructor(message: string) {
    super(message)
    this.name = "FuyaoNotFoundError"
  }
}

export class FuyaoRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FuyaoRequestError"
  }
}

interface FuyaoEnvelope<T> {
  code: number
  message: string
  data: T | null
}

async function fuyaoFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.FUYAO_API_KEY
  if (!apiKey) {
    throw new FuyaoConfigError(
      "FUYAO_API_KEY 未配置：服务端缺少扶摇 API Key，拒绝以任何默认数据代替真实金融数据",
    )
  }

  const url = new URL(path, FUYAO_BASE_URL)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  let res: Response
  try {
    res = await fetch(url, {
      headers: { "X-api-key": apiKey },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new FuyaoRequestError(`扶摇接口请求失败（${path}）：${reason}`)
  }

  if (!res.ok) {
    throw new FuyaoRequestError(`扶摇接口返回 HTTP ${res.status}（${path}）`)
  }

  const body = (await res.json()) as FuyaoEnvelope<T>
  if (body.code !== 0) {
    throw new FuyaoApiError(
      String(body.code),
      `扶摇接口返回错误 code=${body.code}：${body.message}（${path}）`,
    )
  }
  return body.data as T
}

// ---------- 原始响应类型（与扶摇真实字段一一对应） ----------

export interface FuyaoTickerItem {
  thscode: string
  ticker: string
  name: string
  asset_type: string | null
  exchange: string | null
  currency: string | null
}

export interface FuyaoTickerSearchData {
  timestamp: number
  item: FuyaoTickerItem[] | null
}

export interface FuyaoIncomeStatement {
  thscode: string
  fiscal_year: number
  fiscal_period: string
  report_date_ms: number | null
  period_end_ms: number | null
  currency: string | null
  operating_income: number | null
  operating_costs: number | null
  operating_profit: number | null
  net_profit: number | null
  parent_holder_net_profit: number | null
}

export interface FuyaoStatementData<T> {
  timestamp: number
  item: T[] | null
}

export interface FuyaoCashFlowStatement {
  thscode: string
  fiscal_year: number
  fiscal_period: string
  report_date_ms: number | null
  period_end_ms: number | null
  currency: string | null
  act_cash_flow_net: number | null
}

export interface FuyaoIndicatorEntry {
  index_id: string
  value: string | null
}

export interface FuyaoIndicatorAbility {
  ability: string
  indicators: FuyaoIndicatorEntry[]
}

export interface FuyaoIndicatorsData {
  thscode: string
  report: string
  abilities: FuyaoIndicatorAbility[]
}

export interface FuyaoValuationItem {
  thscode: string
  name: string | null
  pe_ttm: number | null
  pe_mrq: number | null
  pb_mrq: number | null
  ps_ttm: number | null
  pcf_ttm: number | null
}

export interface FuyaoValuationData {
  timestamp: number
  item: FuyaoValuationItem[] | null
}

export interface FuyaoPriceBar {
  date_ms: number
  open_price: number | null
  high_price: number | null
  low_price: number | null
  close_price: number | null
  volume: number | null
  turnover: number | null
}

export interface FuyaoPriceHistoryData {
  item: FuyaoPriceBar[] | null
}

// ---------- 各端点请求函数 ----------

export function fetchTickerSearch(query: string): Promise<FuyaoTickerSearchData> {
  return fuyaoFetch<FuyaoTickerSearchData>("/api/meta/tickers/search", {
    q: query,
    limit: "20",
  })
}

export function fetchIncomeStatements(
  thscode: string,
  limit: number,
): Promise<FuyaoStatementData<FuyaoIncomeStatement>> {
  return fuyaoFetch<FuyaoStatementData<FuyaoIncomeStatement>>(
    "/api/a-share/financials/income-statements",
    { thscode, period: "quarterly", limit: String(limit) },
  )
}

export function fetchCashFlowStatements(
  thscode: string,
  limit: number,
): Promise<FuyaoStatementData<FuyaoCashFlowStatement>> {
  return fuyaoFetch<FuyaoStatementData<FuyaoCashFlowStatement>>(
    "/api/a-share/financials/cash-flow-statements",
    { thscode, period: "quarterly", limit: String(limit) },
  )
}

export function fetchFinancialIndicators(
  thscode: string,
  report: string,
): Promise<FuyaoIndicatorsData> {
  return fuyaoFetch<FuyaoIndicatorsData>("/api/a-share/financials/indicators", {
    thscode,
    report,
  })
}

export function fetchValuationSnapshot(thscode: string): Promise<FuyaoValuationData> {
  return fuyaoFetch<FuyaoValuationData>("/api/a-share/valuations/snapshot", {
    thscodes: thscode,
  })
}

export function fetchHistoricalPrices(
  thscode: string,
  startMs: number,
  endMs: number,
): Promise<FuyaoPriceHistoryData> {
  return fuyaoFetch<FuyaoPriceHistoryData>("/api/a-share/prices/historical", {
    thscode,
    interval: "1d",
    start: String(startMs),
    end: String(endMs),
    adjust: "forward",
  })
}
