import { NextResponse } from "next/server"

import { runDiagnosis } from "@/lib/diagnosis/orchestrator"

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

  const { stockCode, question } = (body ?? {}) as Record<string, unknown>

  if (typeof stockCode !== "string" || !STOCK_CODE_PATTERN.test(stockCode.trim().toUpperCase())) {
    return NextResponse.json(
      { error: "无效的 stockCode（期望格式如 000333.SZ）" },
      { status: 400 },
    )
  }
  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "question 不能为空" }, { status: 400 })
  }
  if (question.trim().length > 500) {
    return NextResponse.json({ error: "question 过长（限 1–500 字符）" }, { status: 400 })
  }

  const resp = await runDiagnosis({
    stockCode: stockCode.trim().toUpperCase(),
    question: question.trim(),
  })

  // 缺 Fuyao Key：Truth Layer 完全不可用，属服务端配置错误
  const configMissing = resp.errors.some((e) => e.code === "FUYAO_CONFIG_MISSING")
  if (configMissing && resp.mode === "diagnosis" && resp.evidence.length === 0) {
    return NextResponse.json(resp, { status: 503 })
  }
  return NextResponse.json(resp)
}
