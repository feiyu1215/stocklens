import type { DiagnosisDimension, DiagnosisIntent, PlannerResult } from "@/lib/ai/types"

// Planner 校验（Task 04 §13）：
// intent / 维度枚举合法、dimensions 非空且不超量、不重复、reason 无数字与评价。

const INTENTS: DiagnosisIntent[] = [
  "overall_diagnosis",
  "growth_review",
  "profitability_review",
  "cashflow_review",
  "valuation_review",
  "market_review",
  "risk_review",
]

const DIMENSIONS: DiagnosisDimension[] = [
  "growth",
  "profitability",
  "cashflow",
  "valuation",
  "market",
  "industry",
  "risk",
]

const MAX_DIMENSIONS = 4

const PLANNER_REASON_FORBIDDEN = ["公司增长较弱", "估值较低", "毛利率下降", "风险较高", "较低", "较弱", "较高"]

function isDimensionArray(v: unknown, issues: string[], field: string): v is DiagnosisDimension[] {
  if (!Array.isArray(v)) {
    issues.push(`${field} 必须是数组`)
    return false
  }
  for (const item of v) {
    if (!DIMENSIONS.includes(item as DiagnosisDimension)) {
      issues.push(`${field} 含非法维度：${JSON.stringify(item)}`)
      return false
    }
  }
  const unique = new Set(v as string[])
  if (unique.size !== v.length) {
    issues.push(`${field} 存在重复维度`)
    return false
  }
  return true
}

export function validatePlannerResult(parsed: unknown): { ok: true; result: PlannerResult } | { ok: false; issues: string[] } {
  const issues: string[] = []
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, issues: ["输出必须是 JSON 对象"] }
  }
  const obj = parsed as Record<string, unknown>

  if (!INTENTS.includes(obj.intent as DiagnosisIntent)) {
    issues.push(`intent 非法：${JSON.stringify(obj.intent)}`)
  }

  const dimsOk = isDimensionArray(obj.dimensions, issues, "dimensions")
  if (dimsOk) {
    const dims = obj.dimensions as DiagnosisDimension[]
    if (dims.length === 0) issues.push("dimensions 不能为空")
    if (dims.length > MAX_DIMENSIONS) issues.push(`dimensions 最多 ${MAX_DIMENSIONS} 个`)
  }

  const optionalOk = isDimensionArray(obj.optionalDimensions ?? [], issues, "optionalDimensions")
  if (dimsOk && optionalOk && Array.isArray(obj.dimensions) && Array.isArray(obj.optionalDimensions)) {
    const overlap = (obj.dimensions as string[]).filter((d) => (obj.optionalDimensions as string[]).includes(d))
    if (overlap.length > 0) issues.push(`dimensions 与 optionalDimensions 重叠：${overlap.join(",")}`)
  }

  const reason = obj.reason
  if (typeof reason !== "string" || reason.trim().length === 0) {
    issues.push("reason 必须是非空字符串")
  } else {
    if (reason.length > 120) issues.push("reason 过长（>120 字符）")
    if (/\d/.test(reason)) issues.push("reason 不得包含数字（Planner 没有任何数据依据）")
    for (const phrase of PLANNER_REASON_FORBIDDEN) {
      if (reason.includes(phrase)) {
        issues.push(`reason 包含未经数据支持的评价：「${phrase}」`)
        break
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    result: {
      intent: obj.intent as DiagnosisIntent,
      dimensions: obj.dimensions as DiagnosisDimension[],
      optionalDimensions: (obj.optionalDimensions ?? []) as DiagnosisDimension[],
      reason: (reason as string).trim(),
    },
  }
}

// ---------- Planner 运行时（LLM 调用 + repair，Task 04 §8/§13） ----------

import { LLMConfigError, LLMRequestError, parseLLMJson, runLLM } from "./model"
import {
  PLANNER_PROMPT_VERSION,
  buildPlannerRepairPrompt,
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  type PlannerPromptInput,
} from "./prompts/planner"
import type { AIInvocationTrace, PlannerRunResult } from "./types"

const PLANNER_TEMPERATURE = 0
const PLANNER_MAX_TOKENS = 512

function failedTrace(trace: AIInvocationTrace, issues: string[]): AIInvocationTrace {
  return { ...trace, status: "failed", validationIssues: issues }
}

/**
 * 运行 Planner：LLM → JSON 解析 → 校验；失败 repair 一次，仍失败则 AI failure。
 * 永不抛错（除编程错误）：返回 status=failed + trace，由 orchestrator 决定降级行为。
 */
export async function runPlanner(input: PlannerPromptInput): Promise<PlannerRunResult> {
  const systemPrompt = buildPlannerSystemPrompt()
  const userPrompt = buildPlannerUserPrompt(input)

  let first: Awaited<ReturnType<typeof runLLM>>
  try {
    first = await runLLM({
      task: "planner",
      promptVersion: PLANNER_PROMPT_VERSION,
      systemPrompt,
      userPrompt,
      temperature: PLANNER_TEMPERATURE,
      maxTokens: PLANNER_MAX_TOKENS,
    })
  } catch (err) {
    // LLMConfigError（缺 Key）：直接失败，不 repair
    const trace: AIInvocationTrace = {
      task: "planner",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      promptVersion: PLANNER_PROMPT_VERSION,
      status: "failed",
      latencyMs: 0,
      retries: 0,
      validationIssues: [err instanceof LLMConfigError ? err.message : String(err)],
    }
    return { status: "failed", trace }
  }

  if (first.trace.status === "failed") {
    return {
      status: "failed",
      trace: failedTrace(first.trace, first.trace.validationIssues ?? ["LLM request failed"]),
    }
  }

  const attemptValidation = (output: string): { ok: true; result: PlannerResult } | { ok: false; issues: string[] } => {
    try {
      return validatePlannerResult(parseLLMJson(output))
    } catch (err) {
      return { ok: false, issues: [err instanceof LLMRequestError ? err.message : String(err)] }
    }
  }

  const firstValidation = attemptValidation(first.output)
  if (firstValidation.ok) {
    return { status: "success", planner: firstValidation.result, trace: first.trace }
  }

  // repair 一次
  const second = await runLLM({
    task: "planner",
    promptVersion: PLANNER_PROMPT_VERSION,
    systemPrompt,
    userPrompt: buildPlannerRepairPrompt(first.output, firstValidation.issues),
    temperature: PLANNER_TEMPERATURE,
    maxTokens: PLANNER_MAX_TOKENS,
  })

  const issues = [...firstValidation.issues]
  if (second.trace.status === "failed") {
    issues.push(...(second.trace.validationIssues ?? ["LLM request failed (repair)"]))
    return { status: "failed", trace: failedTrace(second.trace, issues) }
  }
  const secondValidation = attemptValidation(second.output)
  if (!secondValidation.ok) {
    return {
      status: "failed",
      trace: failedTrace(second.trace, [...issues, ...secondValidation.issues]),
    }
  }
  return {
    status: "success",
    planner: secondValidation.result,
    trace: { ...second.trace, retries: second.trace.retries + 1, validationIssues: issues },
  }
}
