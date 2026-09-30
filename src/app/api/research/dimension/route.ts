import { NextResponse } from "next/server"

import { addResearchDimension } from "@/lib/research/add-dimension"
import {
  COMPLIANCE_REDIRECT_MESSAGE,
  COMPLIANCE_SUGGESTED_QUESTIONS,
  detectRestrictedInvestmentRequest,
} from "@/lib/validation/compliance"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

export async function POST(request: Request) {
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
  return NextResponse.json({ mode: "dimension", ...resp })
}
