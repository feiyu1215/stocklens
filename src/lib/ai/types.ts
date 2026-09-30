// AI 层共享类型 —— Planner / Synthesizer / Trace
//
// 分工铁律：
// - Planner 只决定"研究什么维度"，看不到任何金融数据；
// - Synthesizer 只组织已有 Evidence，不产生新事实、不重新分类、不输出 signal；
// - 数字与类型的权威在 Truth Layer（MetricResult / Evidence）。

export type DiagnosisDimension =
  | "growth"
  | "profitability"
  | "cashflow"
  | "valuation"
  | "market"
  | "industry"
  | "risk"

export type DiagnosisIntent =
  | "overall_diagnosis"
  | "growth_review"
  | "profitability_review"
  | "cashflow_review"
  | "valuation_review"
  | "market_review"
  | "risk_review"

export interface PlannerResult {
  intent: DiagnosisIntent
  dimensions: DiagnosisDimension[]
  optionalDimensions: DiagnosisDimension[]
  reason: string
}

export interface GroundedStatement {
  text: string
  evidenceIds: string[]
}

export interface DiagnosisSynthesis {
  summary: GroundedStatement
  confirmedFacts: GroundedStatement[]
  analysisInferences: GroundedStatement[]
  unknowns: GroundedStatement[]
  nextQuestions: string[]
}

export type LLMTask = "planner" | "diagnosis_synthesis"

export interface AIInvocationTrace {
  task: LLMTask
  model: string
  promptVersion: string
  status: "success" | "failed"
  latencyMs: number
  retries: number
  validationIssues?: string[]
}

export interface PlannerRunResult {
  status: "success" | "failed"
  planner?: PlannerResult
  trace: AIInvocationTrace
}

export interface SynthesizerRunResult {
  status: "success" | "failed"
  synthesis?: DiagnosisSynthesis
  trace: AIInvocationTrace
}
