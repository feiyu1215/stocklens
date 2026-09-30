import { NextResponse } from "next/server"

import { initResearchSpace } from "@/lib/research/init-space"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

export async function POST(request: Request) {
  const startedAt = Date.now()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 })
  }
  const { stockCode, question } = (body ?? {}) as Record<string, unknown>

  if (typeof stockCode !== "string" || !STOCK_CODE_PATTERN.test(stockCode.trim().toUpperCase())) {
    return NextResponse.json({ error: "无效的 stockCode（期望格式如 000333.SZ）" }, { status: 400 })
  }
  if (question !== undefined && (typeof question !== "string" || question.trim().length > 500)) {
    return NextResponse.json({ error: "question 限 1–500 字符" }, { status: 400 })
  }

  const resp = await initResearchSpace({
    stockCode: stockCode.trim().toUpperCase(),
    question: typeof question === "string" && question.trim().length > 0 ? question.trim() : undefined,
  })

  // Fuyao 缺 Key 且无任何证据 → 服务端配置错误
  const configMissing = resp.evidence.length === 0 && resp.company.availableCapabilities.length === 0
  const response = NextResponse.json(resp, configMissing ? { status: 503 } : undefined)
  // Task 16.1 延迟审计：仅开发环境附加真实耗时头（framer/composer 取自流水线自带 trace）；
  // 不改变响应体、状态码与行为
  if (process.env.NODE_ENV !== "production") {
    response.headers.set(
      "Server-Timing",
      [
        `total;dur=${Date.now() - startedAt}`,
        `framer;dur=${resp.ai.framer?.latencyMs ?? 0}`,
        `composer;dur=${resp.ai.composer?.latencyMs ?? 0}`,
      ].join(", "),
    )
  }
  return response
}
