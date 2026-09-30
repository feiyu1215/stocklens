import "server-only"

import type { MetricSourceField } from "@/lib/metrics/types"
import {
  FuyaoNotFoundError,
  fetchIndexConstituents,
  fetchIndexHistorical,
  fetchValuationSnapshotBatch,
  type FuyaoPriceBar,
} from "./fuyao"
import { msToShanghaiDate } from "./normalize"
import { VERIFIED_INDUSTRY_MAPPINGS, type VerifiedIndustryMapping } from "./verified-industry"
import { lookupIndustry } from "./industry-registry"

/**
 * 行业解析（Task 12 §14）：优先离线注册表（5572 只股票，真实成分股扫描生成）；
 * 未命中则回退 legacy verified 映射（000333 → 白色家电，保持 V1 行为完全一致）。
 */
function resolveIndustry(stockCode: string): VerifiedIndustryMapping | null {
  const entry = lookupIndustry(stockCode)
  if (entry) {
    return {
      stockCode: entry.stockCode,
      industryIndexCode: entry.industryIndexCode,
      industryName: entry.industryName,
      source: entry.source,
      verifiedAt: entry.verifiedAt,
      verificationMethod: "industry registry (level-1 constituents scan, scripts/build-industry-registry.mjs)",
    }
  }
  const legacy = VERIFIED_INDUSTRY_MAPPINGS.find((m) => m.stockCode === stockCode.toUpperCase())
  return legacy ?? null
}

// 市场上下文（Task 08）：基准指数 + 行业上下文。
// 与个股数据一样：只来自扶摇真实接口，失败显式暴露，不 Mock。
// 行业归属来自 verified mapping（开发期官方成分股扫描验证，见 verified-industry.ts），
// 运行期不扫描行业列表。

export interface IndexPrice {
  indexCode: string
  date: string
  close: number
  source: "fuyao"
}

export interface IndustryContext {
  stockCode: string
  industryIndexCode: string
  industryName: string
  verifiedAt: string
  source: "fuyao"
  verificationMethod: string
}

export interface IndustryValuationSample {
  thscode: string
  peTtm: number | null
  pb: number | null
}

export interface IndustryValuationSampleData {
  industryIndexCode: string
  samples: IndustryValuationSample[]
  source: "fuyao"
  updatedAt: string
}

export interface MarketContext {
  /** 基准指数（沪深300）日收盘序列（date ASC） */
  csi300: IndexPrice[]
  /** 行业上下文（仅当 verified mapping 命中且子步骤部分成功时存在） */
  industry?: {
    context: IndustryContext
    prices: IndexPrice[]
    /** 行业成分股批量估值（中位数计算在 Metric Engine，前端不重算） */
    valuations?: IndustryValuationSampleData
  }
  errors: { domain: "benchmark" | "industry"; message: string; code?: string }[]
}

export function indexSourceField(
  indexCode: string,
  field: string,
  date?: string,
): MetricSourceField {
  return { source: "fuyao", domain: "prices", field: `${indexCode}:${field}`, date }
}

function normalizeIndexPrices(data: { item: FuyaoPriceBar[] | null }, indexCode: string): IndexPrice[] {
  return (data.item ?? [])
    .filter(
      (bar): bar is FuyaoPriceBar & { close_price: number } =>
        typeof bar.date_ms === "number" &&
        typeof bar.close_price === "number" &&
        Number.isFinite(bar.close_price),
    )
    .map((bar) => ({
      indexCode,
      date: msToShanghaiDate(bar.date_ms),
      close: bar.close_price,
      source: "fuyao" as const,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 基准指数（沪深300）最近约 200 个交易日收盘价 */
export async function fetchCsi300Prices(): Promise<IndexPrice[]> {
  const endMs = Date.now()
  const startMs = endMs - 320 * 24 * 3_600_000
  const data = await fetchIndexHistorical("000300.SH", startMs, endMs)
  const prices = normalizeIndexPrices(data, "000300.SH")
  if (prices.length === 0) {
    throw new FuyaoNotFoundError("沪深300 指数未返回任何行情数据")
  }
  return prices
}

function fetchIndexPricesByMapping(mapping: VerifiedIndustryMapping) {
  const endMs = Date.now()
  const startMs = endMs - 320 * 24 * 3_600_000
  return fetchIndexHistorical(mapping.industryIndexCode, startMs, endMs)
}

async function fetchIndustryValuations(
  mapping: VerifiedIndustryMapping,
): Promise<IndustryValuationSampleData> {
  const constituents = await fetchIndexConstituents(mapping.industryIndexCode)
  const codes = (constituents.item ?? []).map((c) => c.thscode)
  if (codes.length === 0) {
    throw new FuyaoNotFoundError(`行业指数 ${mapping.industryIndexCode} 未返回成分股`)
  }

  // 分批（每批 20 个 code）避免超长 URL；单批失败不拖垮整体
  const batches: string[][] = []
  for (let i = 0; i < codes.length; i += 20) batches.push(codes.slice(i, i + 20))
  const results = await Promise.allSettled(
    batches.map((batch) => fetchValuationSnapshotBatch(batch.join(","))),
  )

  const samples: IndustryValuationSample[] = []
  for (const r of results) {
    if (r.status !== "fulfilled") continue
    for (const v of r.value.item ?? []) {
      samples.push({
        thscode: v.thscode,
        peTtm: typeof v.pe_ttm === "number" && Number.isFinite(v.pe_ttm) ? v.pe_ttm : null,
        pb: typeof v.pb_mrq === "number" && Number.isFinite(v.pb_mrq) ? v.pb_mrq : null,
      })
    }
  }
  if (samples.length === 0) {
    throw new FuyaoNotFoundError("行业成分股批量估值全部失败")
  }
  return {
    industryIndexCode: mapping.industryIndexCode,
    samples,
    source: "fuyao",
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 行业上下文：verified mapping 命中才继续；行情与估值两个子步骤独立容错
 * （行情失败不影响 mapping，估值失败不影响行情），失败通过返回结构内的缺失体现。
 */
export async function fetchIndustryContextData(
  stockCode: string,
): Promise<MarketContext["industry"] | null> {
  const mapping = resolveIndustry(stockCode)
  if (!mapping) return null

  const context: IndustryContext = {
    stockCode: mapping.stockCode,
    industryIndexCode: mapping.industryIndexCode,
    industryName: mapping.industryName,
    verifiedAt: mapping.verifiedAt,
    source: mapping.source,
    verificationMethod: mapping.verificationMethod,
  }

  const [pricesResult, valuationsResult] = await Promise.allSettled([
    fetchIndexPricesByMapping(mapping),
    fetchIndustryValuations(mapping),
  ])

  return {
    context,
    prices:
      pricesResult.status === "fulfilled"
        ? normalizeIndexPrices(pricesResult.value, mapping.industryIndexCode)
        : [],
    valuations: valuationsResult.status === "fulfilled" ? valuationsResult.value : undefined,
  }
}

/**
 * 汇总市场上下文：每个子域独立容错，失败记入 errors（partial failure 原则）。
 */
export async function gatherMarketContext(stockCode: string): Promise<MarketContext> {
  const errors: MarketContext["errors"] = []
  const csi300Result = await Promise.allSettled([fetchCsi300Prices()])
  const industryResult = await Promise.allSettled([fetchIndustryContextData(stockCode)])

  let csi300: IndexPrice[] = []
  if (csi300Result[0].status === "fulfilled") {
    csi300 = csi300Result[0].value
  } else {
    const err = csi300Result[0].reason
    errors.push({
      domain: "benchmark",
      message: err instanceof Error ? err.message : String(err),
      code: "BENCHMARK_UNAVAILABLE",
    })
  }

  let industry: MarketContext["industry"] | undefined
  if (industryResult[0].status === "fulfilled") {
    industry = industryResult[0].value ?? undefined
  } else {
    const err = industryResult[0].reason
    errors.push({
      domain: "industry",
      message: err instanceof Error ? err.message : String(err),
      code: "INDUSTRY_UNAVAILABLE",
    })
  }

  return { csi300, industry, errors }
}

export { VERIFIED_INDUSTRY_MAPPINGS }
