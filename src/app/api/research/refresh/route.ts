import { NextResponse } from "next/server"

import { refreshEvidence } from "@/lib/research/refresh"
import { rateLimitResponse } from "@/lib/http/rate-limit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

export async function POST(request: Request) {
  const limited = rateLimitResponse(request, { scope: "research-refresh", limit: 30 })
  if (limited) return limited
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 })
  }
  const { stockCode } = (body ?? {}) as Record<string, unknown>
  if (typeof stockCode !== "string" || !STOCK_CODE_PATTERN.test(stockCode.trim().toUpperCase())) {
    return NextResponse.json({ error: "无效的 stockCode" }, { status: 400 })
  }

  try {
    const resp = await refreshEvidence({ stockCode: stockCode.trim().toUpperCase() })
    return NextResponse.json(resp)
  } catch (err) {
    return NextResponse.json(
      { error: `数据刷新失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
