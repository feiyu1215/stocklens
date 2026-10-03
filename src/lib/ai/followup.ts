import "server-only"

import { randomUUID } from "node:crypto"

import { gatherStockData } from "@/lib/data/stock-data"
import { gatherMarketContext, type MarketContext } from "@/lib/data/industry"
import { calculateMetrics, type MarketContextInput } from "@/lib/metrics/engine"
import { buildEvidence } from "@/lib/evidence/engine"
import { buildFinancialTrend } from "@/lib/metrics/trend"
import type { Evidence } from "@/lib/evidence/types"
import { LLMConfigError, parseLLMJson, runLLM } from "./model"
import {
  FOLLOWUP_PROMPT_VERSION,
  buildFollowupRepairPrompt,
  buildFollowupSystemPrompt,
  buildFollowupUserPrompt,
} from "./prompts/followup"
import { validateDiagnosisSynthesis } from "@/lib/validation/diagnosis"
import type { AIInvocationTrace, DiagnosisSynthesis } from "./types"

// Followup Runner（Task 06）：诊断后沿证据继续研究的追问链路。
// 复用 Truth Layer 与 DiagnosisSynthesis schema / Validator；
// 每次调用重新执行 Truth Layer（无持久化），保证证据始终是当次真实数据。

const FOLLOWUP_TEMPERATURE = 0.2
// 1800 是旧世代模型的预算；2026-09 DeepSeek 换代后（chat 别名指向推理型 Flash），
// 推理 token 会挤占输出预算导致 JSON 截断，放宽到 4000
const FOLLOWUP_MAX_TOKENS = 4000

/** 与 diagnosis 编排器同一趋势访问器（复用 Task 02 差分算法） */
function makeTrendLookup(periods: Parameters<typeof buildFinancialTrend>[0]) {
  const trend = buildFinancialTrend(periods)
  return {
    quarterYoY: (
      field: "revenueQuarterYoY" | "netProfitQuarterYoY" | "operatingCashflowQuarterYoY",
      n: number,
    ) =>
      trend
        .filter((p) => typeof p[field] === "number")
        .map((p) => ({ period: p.period, value: p[field] as number }))
        .slice(-n),
  }
}

export interface FollowupResult {
  followupId: string
  mode: "followup" | "compliance_redirect"
  compliance?: { message: string; suggestedQuestions: string[] }
  question: string
  /** 客户端焦点证据中真实存在的那部分（伪造 ID 被过滤，不进入 grounding 声明） */
  focusEvidenceIds: string[]
  /** 客户端提交但不存在于证据集的 ID（用于 UI 提示，静默过滤会掩盖问题） */
  ignoredEvidenceIds: string[]
  synthesis: DiagnosisSynthesis | null
  evidence: Evidence[]
  ai: { status: "success" | "failed"; trace?: AIInvocationTrace }
}

function failedTrace(trace: AIInvocationTrace, issues: string[]): AIInvocationTrace {
  return { ...trace, status: "failed", validationIssues: issues }
}

export async function runFollowup(input: {
  stockCode: string
  question: string
  focusEvidenceIds?: string[]
}): Promise<FollowupResult> {
  const followupId = randomUUID()
  const [dataResp, marketCtx] = await Promise.all([
    gatherStockData(input.stockCode),
    gatherMarketContext(input.stockCode).catch((): MarketContext => ({ csi300: [], errors: [] })),
  ])
  const marketInput: MarketContextInput = {
    csi300: marketCtx.csi300,
    industry: marketCtx.industry
      ? {
          indexCode: marketCtx.industry.context.industryIndexCode,
          indexName: marketCtx.industry.context.industryName,
          prices: marketCtx.industry.prices,
          valuations: marketCtx.industry.valuations,
        }
      : undefined,
  }
  const metricsResp = calculateMetrics(dataResp, marketInput)
  const bundle = buildEvidence({
    metrics: metricsResp.metrics,
    trend: makeTrendLookup(dataResp.financial),
    context: {
      stockCode: input.stockCode,
      stockName: dataResp.stock?.stockName ?? input.stockCode,
      industry: marketCtx.industry?.context.industryName ?? dataResp.stock?.industry ?? null,
      latestFinancialPeriod: metricsResp.latestFinancialPeriod,
      latestPriceDate: metricsResp.latestPriceDate,
      metricWarnings: metricsResp.warnings,
      industryPricesAvailable: (marketCtx.industry?.prices.length ?? 0) > 0,
      industryValuationAvailable: Boolean(marketCtx.industry?.valuations),
    },
  })

  const requested = input.focusEvidenceIds ?? []
  const focusEvidenceIds = requested.filter((id) => bundle.evidence.some((e) => e.evidenceId === id))
  const ignoredEvidenceIds = requested.filter((id) => !focusEvidenceIds.includes(id))

  const base = {
    followupId,
    question: input.question,
    focusEvidenceIds,
    ignoredEvidenceIds,
    evidence: bundle.evidence,
  }

  // 焦点证据为空：没有可锚定的追问上下文，直接以失败返回（不编造）
  if (focusEvidenceIds.length === 0) {
    return {
      ...base,
      mode: "followup",
      synthesis: null,
      ai: { status: "failed" },
    }
  }

  let first: Awaited<ReturnType<typeof runLLM>>
  try {
    first = await runLLM({
      task: "diagnosis_synthesis",
      promptVersion: FOLLOWUP_PROMPT_VERSION,
      systemPrompt: buildFollowupSystemPrompt(),
      userPrompt: buildFollowupUserPrompt({
        question: input.question,
        stock: { stockCode: input.stockCode, stockName: dataResp.stock?.stockName ?? input.stockCode },
        context: {
          latestFinancialPeriod: metricsResp.latestFinancialPeriod,
          latestTradeDate: metricsResp.latestPriceDate,
        },
        focusEvidenceIds,
        evidence: bundle.evidence,
      }),
      temperature: FOLLOWUP_TEMPERATURE,
      maxTokens: FOLLOWUP_MAX_TOKENS,
    })
  } catch (err) {
    return {
      ...base,
      mode: "followup",
      synthesis: null,
      ai: {
        status: "failed",
        trace: {
          task: "diagnosis_synthesis",
          model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
          promptVersion: FOLLOWUP_PROMPT_VERSION,
          status: "failed",
          latencyMs: 0,
          retries: 0,
          validationIssues: [err instanceof LLMConfigError ? err.message : String(err)],
        },
      },
    }
  }

  const attemptValidation = (output: string) => {
    try {
      return validateDiagnosisSynthesis(parseLLMJson(output), bundle.evidence)
    } catch (err) {
      return {
        ok: false as const,
        issues: [{ section: "parse", rule: "invalid-json", message: err instanceof Error ? err.message : String(err) }],
      }
    }
  }

  if (first.trace.status === "failed") {
    return {
      ...base,
      mode: "followup",
      synthesis: null,
      ai: { status: "failed", trace: failedTrace(first.trace, first.trace.validationIssues ?? []) },
    }
  }

  const firstValidation = attemptValidation(first.output)
  if (firstValidation.ok) {
    return { ...base, mode: "followup", synthesis: firstValidation.synthesis, ai: { status: "success", trace: first.trace } }
  }

  const second = await runLLM({
    task: "diagnosis_synthesis",
    promptVersion: FOLLOWUP_PROMPT_VERSION,
    systemPrompt: buildFollowupSystemPrompt(),
    userPrompt: buildFollowupRepairPrompt(
      first.output,
      firstValidation.issues.map((i) => `${i.section}/${i.rule}: ${i.message}`),
    ),
    temperature: FOLLOWUP_TEMPERATURE,
    maxTokens: FOLLOWUP_MAX_TOKENS,
  })

  const issues = [...firstValidation.issues]
  if (second.trace.status === "failed") {
    issues.push(...(second.trace.validationIssues ?? []).map((m) => ({ section: "llm", rule: "request-failed", message: m })))
    return {
      ...base,
      mode: "followup",
      synthesis: null,
      ai: { status: "failed", trace: failedTrace(second.trace, issues.map((i) => `${i.section}/${i.rule}: ${i.message}`)) },
    }
  }
  const secondValidation = attemptValidation(second.output)
  if (!secondValidation.ok) {
    return {
      ...base,
      mode: "followup",
      synthesis: null,
      ai: {
        status: "failed",
        trace: failedTrace(second.trace, [...issues, ...secondValidation.issues].map((i) => `${i.section}/${i.rule}: ${i.message}`)),
      },
    }
  }
  return {
    ...base,
    mode: "followup",
    synthesis: secondValidation.synthesis,
    ai: {
      status: "success",
      trace: { ...second.trace, retries: second.trace.retries + 1, validationIssues: issues.map((i) => `${i.section}/${i.rule}: ${i.message}`) },
    },
  }
}
