import type { MetricSourceField } from "@/lib/metrics/types"
import type { DataFreshness } from "@/lib/metrics/freshness"

// Evidence 域模型 —— StockLens 的核心数据对象。
//
// EvidenceSignal 语义约定（重要）：
//   signal 表示「这条证据自身的变化方向」，不是对股票的评价。
//   例如 20 日收益率 -8.45% → signal = negative，仅表示"20 日价格变化为负"，
//   不表示"这只股票不好"。signal ≠ 股票评级。

export type EvidenceType = "fact" | "inference" | "unknown"

export type EvidenceSignal =
  | "positive"
  | "negative"
  | "conflict"
  | "neutral"
  | "unknown"

export type EvidenceConfidence = "high" | "medium" | "low"

export type EvidenceDimension =
  | "growth"
  | "profitability"
  | "cashflow"
  | "valuation"
  | "market"
  | "industry"
  | "risk"

export interface Evidence {
  evidenceId: string
  dimension: EvidenceDimension
  title: string
  statement: string
  type: EvidenceType
  signal: EvidenceSignal
  confidence: EvidenceConfidence
  /** FACT：直接引用的指标；INFERENCE：规则输入指标；UNKNOWN：缺失的指标（可为空） */
  metricIds: string[]
  /** INFERENCE 引用的 FACT Evidence ID；FACT/UNKNOWN 恒为空 */
  basedOn: string[]
  ruleId?: string
  period?: string
  comparisonPeriod?: string
  sourceFields: MetricSourceField[]
  verifyStatus: "verified" | "unverified"
  confidenceReason: string
  /** UNKNOWN 必须给出无法验证的原因 */
  unavailableReason?: string
  /**
   * Task 10 解释护栏（additive）：同比值的解释限制（低基数/正负切换/极端变化）。
   * 只提示解释谨慎性，不改变 signal 强度。
   */
  interpretationFlags?: import("@/lib/metrics/interpretation").MetricInterpretationFlag[]
  interpretationNote?: string
  /**
   * Task 17.1 §P0：数据新鲜度。时间敏感类（行情 / 估值 / 事件核查）按数据日期与阈值判定；
   * 报告期数据以报告期为准。status=stale 时 statement 末尾必须带"当前状态无法由该数据确认"。
   */
  freshness?: DataFreshness
}

export interface EvidenceContext {
  stockCode: string
  stockName: string
  industry?: string | null
  latestFinancialPeriod?: string | null
  latestPriceDate?: string | null
  metricWarnings?: string[]
  /** 行业成分股批量估值是否可用（决定行业 UNKNOWN 拆分粒度，Task 08 §26） */
  industryValuationAvailable?: boolean
  /** 行业指数行情是否可用 */
  industryPricesAvailable?: boolean
}

export interface EvidenceStats {
  total: number
  fact: number
  inference: number
  unknown: number
  positive: number
  negative: number
  conflict: number
  neutral: number
  unknownSignal: number
}

export interface EvidenceBundle {
  evidence: Evidence[]
  stats: EvidenceStats
  rulesVersion: string
}

export interface EvidenceValidationViolation {
  evidenceId: string
  rule: string
  message: string
}

export class EvidenceValidationError extends Error {
  constructor(readonly violations: EvidenceValidationViolation[]) {
    super(`Evidence validation failed: ${violations.map((v) => `${v.evidenceId}(${v.rule})`).join(", ")}`)
    this.name = "EvidenceValidationError"
  }
}
