import "server-only"

import { LLMConfigError, parseLLMJson, runLLM } from "./model"
import {
  SYNTHESIS_PROMPT_VERSION,
  buildSynthesisRepairPrompt,
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  type SynthesisPromptInput,
} from "./prompts/synthesizer"
import type { AIInvocationTrace, SynthesizerRunResult } from "./types"
import { validateDiagnosisSynthesis } from "@/lib/validation/diagnosis"

// Synthesizer（Task 04 §19–28）：
// 输入只有 Question + Stock Metadata + Context + Selected Evidence（Grounding Layer），
// 不传原始 API 响应、不重复传全部 Metric 原始数据。
// LLM 负责组织与解释；类型/数字/方向的权威仍在 Evidence。

const SYNTHESIS_TEMPERATURE = 0.2
const SYNTHESIS_MAX_TOKENS = 1500

export function buildSynthesizerInput(input: SynthesisPromptInput): SynthesisPromptInput {
  // 显式白名单构造：确保输入中不可能携带 API Key、原始扶摇响应或原始字段目录
  return {
    question: input.question,
    stock: { stockCode: input.stock.stockCode, stockName: input.stock.stockName },
    context: {
      latestFinancialPeriod: input.context.latestFinancialPeriod,
      latestTradeDate: input.context.latestTradeDate,
      availableDimensions: input.context.availableDimensions,
      unavailableDimensions: input.context.unavailableDimensions,
    },
    selectedEvidence: input.selectedEvidence.map((e) => ({
      ...e,
      sourceFields: [], // 原始字段目录不进入模型输入（statement 已含可读事实）
    })),
  }
}

function failedTrace(trace: AIInvocationTrace, issues: string[]): AIInvocationTrace {
  return { ...trace, status: "failed", validationIssues: issues }
}

/**
 * 运行 Synthesizer：LLM → JSON 解析 → Diagnosis Validation；
 * 失败 repair 一次，仍失败则 AI failure（synthesis 为空，Truth Layer 证据保留）。
 */
export async function runSynthesizer(input: SynthesisPromptInput): Promise<SynthesizerRunResult> {
  const sanitized = buildSynthesizerInput(input)
  const systemPrompt = buildSynthesisSystemPrompt()
  const userPrompt = buildSynthesisUserPrompt(sanitized)

  let first: Awaited<ReturnType<typeof runLLM>>
  try {
    first = await runLLM({
      task: "diagnosis_synthesis",
      promptVersion: SYNTHESIS_PROMPT_VERSION,
      systemPrompt,
      userPrompt,
      temperature: SYNTHESIS_TEMPERATURE,
      maxTokens: SYNTHESIS_MAX_TOKENS,
    })
  } catch (err) {
    const trace: AIInvocationTrace = {
      task: "diagnosis_synthesis",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      promptVersion: SYNTHESIS_PROMPT_VERSION,
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

  const attemptValidation = (output: string) => {
    try {
      return validateDiagnosisSynthesis(parseLLMJson(output), input.selectedEvidence)
    } catch (err) {
      return {
        ok: false as const,
        issues: [{ section: "parse", rule: "invalid-json", message: err instanceof Error ? err.message : String(err) }],
      }
    }
  }

  const firstValidation = attemptValidation(first.output)
  if (firstValidation.ok) {
    return { status: "success", synthesis: firstValidation.synthesis, trace: first.trace }
  }

  // repair 一次（附上全部校验失败原因）
  const second = await runLLM({
    task: "diagnosis_synthesis",
    promptVersion: SYNTHESIS_PROMPT_VERSION,
    systemPrompt,
    userPrompt: buildSynthesisRepairPrompt(
      first.output,
      firstValidation.issues.map((i) => `${i.section}/${i.rule}: ${i.message}`),
    ),
    temperature: SYNTHESIS_TEMPERATURE,
    maxTokens: SYNTHESIS_MAX_TOKENS,
  })

  const issues = [...firstValidation.issues]
  const mergedTrace = (trace: AIInvocationTrace, list: typeof issues): AIInvocationTrace => ({
    ...trace,
    retries: trace.retries + 1,
    status: "failed",
    validationIssues: list.map((i) => `${i.section}/${i.rule}: ${i.message}`),
  })
  if (second.trace.status === "failed") {
    issues.push(...(second.trace.validationIssues ?? []).map((m) => ({ section: "llm", rule: "request-failed", message: m })))
    return { status: "failed", trace: mergedTrace(second.trace, issues) }
  }
  const secondValidation = attemptValidation(second.output)
  if (!secondValidation.ok) {
    return {
      status: "failed",
      trace: mergedTrace(second.trace, [...issues, ...secondValidation.issues]),
    }
  }
  return {
    status: "success",
    synthesis: secondValidation.synthesis,
    trace: {
      ...second.trace,
      retries: second.trace.retries + 1,
      validationIssues: issues.map((i) => `${i.section}/${i.rule}: ${i.message}`),
    },
  }
}
