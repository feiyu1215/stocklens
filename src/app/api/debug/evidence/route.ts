import { NextResponse } from "next/server"

import { DEFAULT_STOCK_CODE, gatherStockData } from "@/lib/data/stock-data"
import { calculateMetrics } from "@/lib/metrics/engine"
import { buildEvidence } from "@/lib/evidence/engine"
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

  const dataResp = await gatherStockData(rawCode)
  const metricsResp = calculateMetrics(dataResp)

  const bundle = buildEvidence({
    metrics: metricsResp.metrics,
    context: {
      stockCode: rawCode,
      stockName: dataResp.stock?.stockName ?? rawCode,
      industry: dataResp.stock?.industry ?? null,
      latestFinancialPeriod: metricsResp.latestFinancialPeriod,
      latestPriceDate: metricsResp.latestPriceDate,
      metricWarnings: metricsResp.warnings,
    },
  })

  // 与前两个 Debug API 同一语义：缺 Key 属服务端配置错误（503）；
  // 业务失败（如个股不存在）返回 200，Evidence 层以 UNKNOWN + errors[] 如实呈现。
  const configMissing = dataResp.errors.some((e) => e.code === "FUYAO_CONFIG_MISSING")
  if (configMissing && metricsResp.summary.available === 0) {
    return NextResponse.json(
      {
        stock: null,
        rulesVersion: bundle.rulesVersion,
        evidence: bundle.evidence,
        stats: bundle.stats,
        errors: dataResp.errors,
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    stock: dataResp.stock
      ? { stockCode: dataResp.stock.stockCode, stockName: dataResp.stock.stockName }
      : null,
    rulesVersion: bundle.rulesVersion,
    evidence: bundle.evidence,
    stats: bundle.stats,
    errors: dataResp.errors,
  })
}
