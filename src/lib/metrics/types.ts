// StockLens 确定性指标层 —— MetricResult 契约
//
// 原则：Metric Engine 只计算、不解释。
// 这里不允许出现 signal / positive / negative / score / rating 等语义字段，
// "改善/承压/矛盾"等判断属于后续 Evidence Engine。

export type MetricStatus = "available" | "unavailable"

export type MetricDimension =
  | "growth"
  | "profitability"
  | "cashflow"
  | "valuation"
  | "market"

export interface MetricSourceField {
  source: "fuyao"
  domain: "financial" | "valuation" | "prices"
  field: string
  /** 财务/估值指标对应的报告期或数据日期 */
  period?: string
  /** 行情类字段对应的数据日期 */
  date?: string
}

export interface MetricResult {
  metricId: string
  dimension: MetricDimension
  name: string
  status: MetricStatus
  /** 原始计算值（不做展示层舍入）；null 表示 unavailable */
  value: number | null
  unit: string
  /** 本指标所属报告期/数据日期 */
  period?: string
  /** 对比期（YoY / 变化类指标） */
  comparisonPeriod?: string
  sourceFields: MetricSourceField[]
  calculationMethod: string
  /** status=unavailable 时必须给出原因 */
  unavailableReason?: string
  /** 统计类指标的样本量（如行业 PE 中位数的有效公司数），必须随指标展示 */
  sampleSize?: number
  /**
   * 同比解释护栏（Task 10，additive）：低基数/正负切换/极端变化提示。
   * 注意：只增加解释元数据，绝不修改 value。
   */
  interpretationFlags?: import("./interpretation").MetricInterpretationFlag[]
  interpretationNote?: string
}

export interface MetricsSummary {
  total: number
  available: number
  unavailable: number
}

export interface DebugMetricsResponse {
  stock: {
    stockCode: string
    stockName: string
  } | null
  latestFinancialPeriod: string | null
  latestPriceDate: string | null
  metrics: MetricResult[]
  summary: MetricsSummary
  warnings: string[]
}

/** 单位规范：金额 CNY；倍数 x；百分比 %；百分点变化 pct */
export const UNITS = {
  percent: "%",
  pctPoint: "pct",
  multiple: "x",
  currency: "CNY",
} as const
