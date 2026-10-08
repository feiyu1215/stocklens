import { NextResponse } from "next/server"

import { DEFAULT_STOCK_CODE, gatherStockData } from "@/lib/data/stock-data"
import { productionDebugRouteResponse } from "@/lib/http/rate-limit"

export const dynamic = "force-dynamic"

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

export async function GET(request: Request) {
  const blocked = productionDebugRouteResponse()
  if (blocked) return blocked
  const { searchParams } = new URL(request.url)
  const rawCode = (searchParams.get("stockCode") ?? DEFAULT_STOCK_CODE).trim().toUpperCase()

  if (!STOCK_CODE_PATTERN.test(rawCode)) {
    return NextResponse.json(
      { error: `无效的 stockCode：${rawCode}（期望格式如 000333.SZ）` },
      { status: 400 },
    )
  }

  const resp = await gatherStockData(rawCode)

  // 全域失败且根因是缺少 API Key：整个请求不可执行，属于服务端配置错误，
  // 用 503 明确上报；响应体仍为结构化结果（availability 全 false + errors），绝无假数据。
  const configMissing = resp.errors.some((e) => e.code === "FUYAO_CONFIG_MISSING")
  const allUnavailable = Object.values(resp.availability).every((ok) => !ok)
  if (configMissing && allUnavailable) {
    return NextResponse.json(resp, { status: 503 })
  }
  return NextResponse.json(resp)
}
