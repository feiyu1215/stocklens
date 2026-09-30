import { NextResponse } from "next/server"

import { DEFAULT_STOCK_CODE, gatherStockData } from "@/lib/data/stock-data"
import { calculateMetrics } from "@/lib/metrics/engine"

export const dynamic = "force-dynamic"

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawCode = (searchParams.get("stockCode") ?? DEFAULT_STOCK_CODE).trim().toUpperCase()

  if (!STOCK_CODE_PATTERN.test(rawCode)) {
    return NextResponse.json(
      { error: `无效的 stockCode：${rawCode}（期望格式如 000333.SZ）` },
      { status: 400 },
    )
  }

  const dataResp = await gatherStockData(rawCode)
  const metricsResp = calculateMetrics(dataResp)

  // 与 /api/debug/stock-data 同一语义：缺 Key 属服务端配置错误（503）；
  // 个股不存在等业务失败返回 200，指标以 unavailable + 原因呈现，不丢弃不造假。
  const configMissing = dataResp.errors.some((e) => e.code === "FUYAO_CONFIG_MISSING")
  const nothingAvailable = metricsResp.summary.available === 0
  if (configMissing && nothingAvailable) {
    return NextResponse.json(metricsResp, { status: 503 })
  }
  return NextResponse.json(metricsResp)
}
