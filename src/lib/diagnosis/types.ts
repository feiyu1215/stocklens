import type { PlannerResult, DiagnosisSynthesis, AIInvocationTrace } from "@/lib/ai/types"
import type { Evidence } from "@/lib/evidence/types"
import type { DataSourceError } from "@/lib/data/types"
import type { MetricResult } from "@/lib/metrics/types"
import type { FinancialTrendPoint } from "@/lib/metrics/trend"

// Diagnosis 编排层类型（Task 04 §38–40）

export interface DiagnosisContext {
  stockCode: string
  stockName: string
  question: string
  latestTradeDate?: string | null
  latestFinancialPeriod?: string | null
  availableDimensions: string[]
  unavailableDimensions: string[]
  createdAt: string
}

export interface DiagnosisStats {
  totalEvidence: number
  fact: number
  inference: number
  unknown: number
  conflict: number
}

export interface DiagnosisResponse {
  /** 请求实例 ID（UUID）；Evidence ID 仍然稳定，二者不可混淆 */
  diagnosisId: string
  mode: "diagnosis" | "compliance_redirect"
  stock?: { stockCode: string; stockName: string } | null
  context?: DiagnosisContext | null
  planner?: PlannerResult
  synthesis?: DiagnosisSynthesis | null
  evidence: Evidence[]
  stats: DiagnosisStats
  ai: {
    status: "success" | "partial_failure" | "failed" | "not_invoked"
    planner?: AIInvocationTrace
    synthesizer?: AIInvocationTrace
  }
  compliance?: {
    message: string
    suggestedQuestions: string[]
  }
  /** 系统状态说明（如「AI 解释暂不可用，已验证证据仍可查看」）——不是金融结论 */
  notices?: string[]
  errors: DataSourceError[]
  /**
   * additive extension（Task 05 §33）：仅用于 Evidence Drill-down 展示 MetricResult，
   * 来自已计算的 calculateMetrics()；前端禁止重新计算。redirect 模式为空数组。
   */
  metrics: MetricResult[]
  /** additive extension（Task 08）：单季趋势序列（来自 Metric Engine，前端只渲染不重算） */
  trend?: FinancialTrendPoint[]
  /** additive extension（Task 08）：行业上下文元数据（verified mapping 溯源） */
  industry?: {
    name: string
    indexCode: string
    verifiedAt: string
    source: "fuyao"
    verificationMethod: string
  } | null
  /** additive extension（Task 08）：行业估值样本量（UI 展示 n=…） */
  industryValuationSampleSize?: number | null
}
