import { NextResponse } from "next/server"

import { searchStocks } from "@/lib/data/stock-search"
import { rateLimitResponse } from "@/lib/http/rate-limit"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const startedAt = Date.now()
  const limited = rateLimitResponse(request, { scope: "stock-search", limit: 60 })
  if (limited) return limited
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  if (q.length === 0) {
    return NextResponse.json({ items: [], error: "missing q" }, { status: 400 })
  }
  if (q.length > 40) {
    return NextResponse.json({ items: [], error: "q too long" }, { status: 400 })
  }
  try {
    const items = await searchStocks(q)
    const response = NextResponse.json({ items })
    // Task 16.1 延迟审计：仅开发环境附加真实耗时头；不改变响应体、状态码与行为
    if (process.env.NODE_ENV !== "production") {
      response.headers.set("Server-Timing", `total;dur=${Date.now() - startedAt}`)
    }
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const configMissing = message.includes("FUYAO_API_KEY")
    return NextResponse.json({ items: [], error: message }, { status: configMissing ? 503 : 502 })
  }
}
