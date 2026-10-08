import { NextResponse } from "next/server"

import { addResearchDimension } from "@/lib/research/add-dimension"
import { rateLimitResponse } from "@/lib/http/rate-limit"
import {
  COMPLIANCE_REDIRECT_MESSAGE,
  COMPLIANCE_SUGGESTED_QUESTIONS,
  detectRestrictedInvestmentRequest,
} from "@/lib/validation/compliance"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

export async function POST(request: Request) {
  const startedAt = Date.now()
  const limited = rateLimitResponse(request, { scope: "research-dimension", limit: 15 })
  if (limited) return limited
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 })
  }
  const { stockCode, dimensionText, currentDimensions, entryQuestion } = (body ?? {}) as Record<string, unknown>

  if (typeof stockCode !== "string" || !STOCK_CODE_PATTERN.test(stockCode.trim().toUpperCase())) {
    return NextResponse.json({ error: "无效的 stockCode" }, { status: 400 })
  }
  if (typeof dimensionText !== "string" || dimensionText.trim().length === 0 || dimensionText.trim().length > 60) {
    return NextResponse.json({ error: "dimensionText 限 1–60 字符" }, { status: 400 })
  }
  const dims = Array.isArray(currentDimensions)
    ? currentDimensions.filter((d): d is string => typeof d === "string").slice(0, 12)
    : []

  // 投资建议类输入沿用原合规守卫（Task 12 §78：不得绕过）
  const restricted = detectRestrictedInvestmentRequest(dimensionText.trim())
  if (restricted.restricted) {
    return NextResponse.json({
      mode: "compliance_redirect",
      compliance: { message: COMPLIANCE_REDIRECT_MESSAGE, suggestedQuestions: COMPLIANCE_SUGGESTED_QUESTIONS },
      dimension: null,
      claims: [],
      evidence: [],
      ai: { status: "not_invoked" },
      errors: [],
    })
  }

  const resp = await addResearchDimension({
    stockCode: stockCode.trim().toUpperCase(),
    dimensionText: dimensionText.trim(),
    currentDimensions: dims,
    ...(typeof entryQuestion === "string" && entryQuestion.trim().length > 0 ? { entryQuestion: entryQuestion.trim() } : {}),
  })
  const response = NextResponse.json({ mode: "dimension", ...resp })
  // Task 16.1 延迟审计：仅开发环境附加真实耗时头；framing 为维度框定 LLM 实测耗时，
  // 其余耗时（含 truth 加载与维度合成 LLM）归入 rest。不改变响应体、状态码与行为
  if (process.env.NODE_ENV !== "production") {
    response.headers.set(
      "Server-Timing",
      [`total;dur=${Date.now() - startedAt}`, `framing;dur=${resp.ai.latencyMs ?? 0}`].join(", "),
    )
  }
  return response
}
