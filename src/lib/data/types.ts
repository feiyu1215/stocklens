// StockLens 内部数据模型 —— Truth Layer 底座
//
// 数值字段约定（Missing 与 Zero 严格区分）：
//   number    = 数据源真实返回（包括真实的 0 与负数，绝不改写）
//   null      = 数据源提供了该字段但值为空/缺失
//   undefined = 本轮根本未请求该字段（JSON 序列化时键不出现）

export interface StockBasicInfo {
  stockCode: string
  stockName: string
  /** 扶摇当前接口不提供行业字段；取不到时必须为 null，禁止伪造 */
  industry?: string | null
  source: "fuyao"
  updatedAt?: string | null
}

export interface FinancialPeriodData {
  stockCode: string
  /** 报告期，格式 YYYY-Qn（如 2026-Q2）；quarterly 口径为年初至今累计 */
  period: string
  revenue?: number | null
  netProfit?: number | null
  operatingCashflow?: number | null
  grossMargin?: number | null
  netMargin?: number | null
  roe?: number | null
  source: "fuyao"
  updatedAt?: string | null
}

export interface ValuationData {
  stockCode: string
  /** 估值快照日期（上海时区） */
  date: string
  peTtm?: number | null
  pb?: number | null
  source: "fuyao"
  updatedAt?: string | null
}

export interface DailyPrice {
  stockCode: string
  date: string
  open?: number | null
  high?: number | null
  low?: number | null
  close: number
  source: "fuyao"
}

export interface DataSourceError {
  source: "fuyao"
  domain: "basic" | "financial" | "valuation" | "prices"
  code?: string
  message: string
}

export interface DebugStockDataResponse {
  stock: StockBasicInfo | null
  financial: FinancialPeriodData[]
  valuation: ValuationData | null
  prices: DailyPrice[]
  availability: {
    basic: boolean
    financial: boolean
    valuation: boolean
    prices: boolean
  }
  errors: DataSourceError[]
  meta: {
    requested_at: string
    latest_financial_period: string | null
    latest_price_date: string | null
  }
}
