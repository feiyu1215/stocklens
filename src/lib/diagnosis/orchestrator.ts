import "server-only"

import { randomUUID } from "node:crypto"

import { gatherStockData } from "@/lib/data/stock-data"
import { gatherMarketContext, type MarketContext } from "@/lib/data/industry"
import { calculateMetrics, type MarketContextInput } from "@/lib/metrics/engine"
import { buildEvidence } from "@/lib/evidence/engine"
import { buildFinancialTrend } from "@/lib/metrics/trend"
import { computeIndustryValuationStats } from "@/lib/metrics/market-context"
import type { Evidence } from "@/lib/evidence/types"
import { runPlanner } from "@/lib/ai/planner"
import { selectEvidenceForPlan } from "@/lib/ai/select-evidence"
import { buildSynthesisEvidencePack, toCompactEvidence } from "@/lib/ai/evidence-pack"
import { runSynthesizer } from "@/lib/ai/synthesizer"
import type { DiagnosisDimension } from "@/lib/ai/types"
import {
  COMPLIANCE_REDIRECT_MESSAGE,
  COMPLIANCE_SUGGESTED_QUESTIONS,
  detectRestrictedInvestmentRequest,
} from "@/lib/validation/compliance"
import type { DiagnosisResponse, DiagnosisStats } from "./types"

// Diagnosis Orchestrator（Task 04 §2）：
// Question → Compliance Guard → Planner → Truth Layer → Evidence Selection
//          → Synthesizer → Diagnosis Validator → DiagnosisResponse
//
// 降级纪律：AI 任何环节失败都不污染 Truth Layer——
// 证据照常返回，synthesis=null，notices 说明系统状态（不是金融结论）。

const ALL_DIMENSIONS: DiagnosisDimension[] = [
  "growth",
  "profitability",
  "cashflow",
  "valuation",
  "market",
  "industry",
  "risk",
]

const AI_UNAVAILABLE_NOTICE = "AI 解释暂不可用，已验证证据仍可查看。"

/** 趋势序列访问器（Task 08）：供 Evidence 规则使用；纯函数，基于当次真实财务期次 */
function makeTrendLookup(periods: Parameters<typeof buildFinancialTrend>[0]) {
  const trend = buildFinancialTrend(periods)
  return {
    quarterYoY: (
      field: "revenueQuarterYoY" | "netProfitQuarterYoY" | "operatingCashflowQuarterYoY",
      n: number,
    ) =>
      trend
        .filter((p) => typeof p[field] === "number")
        .map((p) => ({ period: p.period, value: p[field] as number }))
        .slice(-n),
  }
}

/** 证据选择 trace（Task 09 §20/§27）：只统计计数与序列化字符数，不含证据正文 */
function packSelectionTrace(
  full: Evidence[],
  pack: ReturnType<typeof buildSynthesisEvidencePack>,
): {
  full: number
  synthesis: number
  byDimension: Record<string, number>
  serializedEvidenceChars: number
} {
  return {
    full: full.length,
    synthesis: pack.synthesisEvidence.length,
    byDimension: pack.byDimension as Record<string, number>,
    serializedEvidenceChars: JSON.stringify(pack.synthesisEvidence.map(toCompactEvidence)).length,
  }
}

function computeStats(evidence: Evidence[]): DiagnosisStats {
  const stats: DiagnosisStats = {
    totalEvidence: evidence.length,
    fact: 0,
    inference: 0,
    unknown: 0,
    conflict: 0,
  }
  for (const e of evidence) {
    if (e.type === "fact") stats.fact += 1
    if (e.type === "inference") stats.inference += 1
    if (e.type === "unknown") stats.unknown += 1
    if (e.signal === "conflict") stats.conflict += 1
  }
  return stats
}

/**
 * 维度可用性：某维度存在 ≥1 条 fact/inference 证据才算可用；
 * 只有 unknown 的维度（如行业）对 Planner 而言不可用（其证据会随维度选择自然带上）。
 */
function computeDimensionAvailability(evidence: Evidence[]): {
  available: DiagnosisDimension[]
  unavailable: DiagnosisDimension[]
} {
  const supported = new Set<DiagnosisDimension>(
    evidence.filter((e) => e.type === "fact" || e.type === "inference").map((e) => e.dimension),
  )
  const available = ALL_DIMENSIONS.filter((d) => supported.has(d))
  const unavailable = ALL_DIMENSIONS.filter((d) => !available.includes(d))
  return { available, unavailable }
}

export async function runDiagnosis(input: {
  stockCode: string
  question: string
}): Promise<DiagnosisResponse> {
  const diagnosisId = randomUUID()

  // ---------- 1. Compliance Pre-check（先于 Planner，§14–15）----------
  const restricted = detectRestrictedInvestmentRequest(input.question)
  if (restricted.restricted) {
    return {
      diagnosisId,
      mode: "compliance_redirect",
      stock: null,
      context: null,
      evidence: [],
      stats: { totalEvidence: 0, fact: 0, inference: 0, unknown: 0, conflict: 0 },
      ai: { status: "not_invoked" },
      compliance: {
        message: COMPLIANCE_REDIRECT_MESSAGE,
        suggestedQuestions: COMPLIANCE_SUGGESTED_QUESTIONS,
      },
      notices: [`请求已按合规策略拦截（匹配：${restricted.matchedPattern}）。`],
      errors: [],
      metrics: [],
    }
  }

  // ---------- 2. Truth Layer（不重构，直接复用）----------
  const [dataResp, marketCtx] = await Promise.all([
    gatherStockData(input.stockCode),
    gatherMarketContext(input.stockCode).catch((): MarketContext => ({ csi300: [], errors: [] })),
  ])
  const marketInput: MarketContextInput = {
    csi300: marketCtx.csi300,
    industry: marketCtx.industry
      ? {
          indexCode: marketCtx.industry.context.industryIndexCode,
          indexName: marketCtx.industry.context.industryName,
          prices: marketCtx.industry.prices,
          valuations: marketCtx.industry.valuations,
        }
      : undefined,
  }
  const metricsResp = calculateMetrics(dataResp, marketInput)

  const trend = buildFinancialTrend(dataResp.financial)
  const industryMeta = marketCtx.industry
    ? {
        name: marketCtx.industry.context.industryName,
        indexCode: marketCtx.industry.context.industryIndexCode,
        verifiedAt: marketCtx.industry.context.verifiedAt,
        source: marketCtx.industry.context.source,
        verificationMethod: marketCtx.industry.context.verificationMethod,
      }
    : null
  const industryValuationSampleSize = marketCtx.industry?.valuations
    ? computeIndustryValuationStats(marketCtx.industry.valuations).peSampleSize
    : null

  let evidence: Evidence[]
  try {
    const bundle = buildEvidence({
      metrics: metricsResp.metrics,
      trend: makeTrendLookup(dataResp.financial),
      context: {
        stockCode: input.stockCode,
        stockName: dataResp.stock?.stockName ?? input.stockCode,
        industry: marketCtx.industry?.context.industryName ?? dataResp.stock?.industry ?? null,
        latestFinancialPeriod: metricsResp.latestFinancialPeriod,
        latestPriceDate: metricsResp.latestPriceDate,
        metricWarnings: metricsResp.warnings,
        industryPricesAvailable: (marketCtx.industry?.prices.length ?? 0) > 0,
        industryValuationAvailable: Boolean(marketCtx.industry?.valuations),
      },
    })
    evidence = bundle.evidence
  } catch (err) {
    return {
      diagnosisId,
      mode: "diagnosis",
      stock: dataResp.stock ? { stockCode: dataResp.stock.stockCode, stockName: dataResp.stock.stockName } : null,
      context: null,
      evidence: [],
      stats: { totalEvidence: 0, fact: 0, inference: 0, unknown: 0, conflict: 0 },
      ai: { status: "not_invoked" },
      notices: ["证据构建失败，请稍后重试。"],
      errors: [
        ...dataResp.errors,
        {
          source: "fuyao",
          domain: "basic",
          code: "EVIDENCE_BUILD_FAILED",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      metrics: metricsResp.metrics,
      trend,
      industry: industryMeta,
      industryValuationSampleSize,
    }
  }

  const dimensionAvailability = computeDimensionAvailability(evidence)
  const context = {
    stockCode: input.stockCode,
    stockName: dataResp.stock?.stockName ?? input.stockCode,
    question: input.question,
    latestTradeDate: metricsResp.latestPriceDate,
    latestFinancialPeriod: metricsResp.latestFinancialPeriod,
    availableDimensions: dimensionAvailability.available,
    unavailableDimensions: dimensionAvailability.unavailable,
    createdAt: new Date().toISOString(),
  }

  // ---------- 3. Planner ----------
  const plannerRun = await runPlanner({
    stockCode: input.stockCode,
    stockName: dataResp.stock?.stockName ?? input.stockCode,
    question: input.question,
    availableCapabilities: context.availableDimensions,
    unavailableCapabilities: context.unavailableDimensions,
  })

  if (plannerRun.status === "failed") {
    // Planner failed：仍返回全部 Truth Layer Evidence，不自己编 summary
    return {
      diagnosisId,
      mode: "diagnosis",
      stock: dataResp.stock ? { stockCode: dataResp.stock.stockCode, stockName: dataResp.stock.stockName } : null,
      context,
      planner: undefined,
      synthesis: null,
      evidence,
      stats: computeStats(evidence),
      ai: { status: "failed", planner: plannerRun.trace },
      notices: [AI_UNAVAILABLE_NOTICE],
      errors: dataResp.errors,
      metrics: metricsResp.metrics,
      trend,
      industry: industryMeta,
      industryValuationSampleSize,
    }
  }

  // ---------- 4. Evidence Selection（代码完成）----------
  // fullEvidence：完整选中集 → UI / Drawer / Follow-up（不删减）
  // synthesisEvidence：确定性打包的紧凑证据包 → 只给 LLM Synthesizer（Task 09）
  const selected = selectEvidenceForPlan(evidence, plannerRun.planner!)
  const pack = buildSynthesisEvidencePack(selected, plannerRun.planner!)

  // ---------- 5. Synthesizer ----------
  const synthRun = await runSynthesizer({
    question: input.question,
    stock: { stockCode: input.stockCode, stockName: dataResp.stock?.stockName ?? input.stockCode },
    context: {
      latestFinancialPeriod: metricsResp.latestFinancialPeriod,
      latestTradeDate: metricsResp.latestPriceDate,
      availableDimensions: context.availableDimensions,
      unavailableDimensions: context.unavailableDimensions,
    },
    selectedEvidence: pack.synthesisEvidence,
  })

  if (synthRun.status === "failed") {
    return {
      diagnosisId,
      mode: "diagnosis",
      stock: dataResp.stock ? { stockCode: dataResp.stock.stockCode, stockName: dataResp.stock.stockName } : null,
      context,
      planner: plannerRun.planner,
      synthesis: null,
      evidence: selected,
      stats: computeStats(selected),
      ai: { status: "partial_failure", planner: plannerRun.trace, synthesizer: synthRun.trace },
      notices: [AI_UNAVAILABLE_NOTICE],
      errors: dataResp.errors,
      metrics: metricsResp.metrics,
      trend,
      industry: industryMeta,
      industryValuationSampleSize,
      evidenceSelection: packSelectionTrace(selected, pack),
    }
  }

  return {
    diagnosisId,
    mode: "diagnosis",
    stock: dataResp.stock ? { stockCode: dataResp.stock.stockCode, stockName: dataResp.stock.stockName } : null,
    context,
    planner: plannerRun.planner,
    synthesis: synthRun.synthesis,
    evidence: selected,
    stats: computeStats(selected),
    ai: { status: "success", planner: plannerRun.trace, synthesizer: synthRun.trace },
    errors: dataResp.errors,
    metrics: metricsResp.metrics,
    trend,
    industry: industryMeta,
    industryValuationSampleSize,
    evidenceSelection: packSelectionTrace(selected, pack),
  }
}
