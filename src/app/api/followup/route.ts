import { NextResponse } from "next/server"

import { runFollowup } from "@/lib/ai/followup"
import {
  COMPLIANCE_REDIRECT_MESSAGE,
  COMPLIANCE_SUGGESTED_QUESTIONS,
  detectRestrictedInvestmentRequest,
} from "@/lib/validation/compliance"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 })
  }

  const { stockCode, question, evidenceIds } = (body ?? {}) as Record<string, unknown>

  if (typeof stockCode !== "string" || !STOCK_CODE_PATTERN.test(stockCode.trim().toUpperCase())) {
    return NextResponse.json({ error: "无效的 stockCode（期望格式如 000333.SZ）" }, { status: 400 })
  }
  if (typeof question !== "string" || question.trim().length === 0 || question.trim().length > 500) {
    return NextResponse.json({ error: "question 限 1–500 字符" }, { status: 400 })
  }
  const focusEvidenceIds = Array.isArray(evidenceIds)
    ? evidenceIds.filter((id): id is string => typeof id === "string")
    : []

  // 投资建议类追问在进入 LLM 前拦截（与 /api/diagnosis 同一守卫）
  const restricted = detectRestrictedInvestmentRequest(question.trim())
  if (restricted.restricted) {
    return NextResponse.json({
      followupId: null,
      mode: "compliance_redirect",
      compliance: {
        message: COMPLIANCE_REDIRECT_MESSAGE,
        suggestedQuestions: COMPLIANCE_SUGGESTED_QUESTIONS,
      },
      question: question.trim(),
      focusEvidenceIds,
      ignoredEvidenceIds: [],
      synthesis: null,
      evidence: [],
      ai: { status: "not_invoked" },
      errors: [],
    })
  }

  const resp = await runFollowup({
    stockCode: stockCode.trim().toUpperCase(),
    question: question.trim(),
    focusEvidenceIds,
  })

  return NextResponse.json(resp)
}
