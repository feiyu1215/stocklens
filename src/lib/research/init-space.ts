import "server-only"

import { randomUUID } from "node:crypto"

import { gatherStockData } from "@/lib/data/stock-data"
import { gatherMarketContext, type MarketContext } from "@/lib/data/industry"
import { gatherEventContext, type EventContext } from "@/lib/data/events"
import { calculateMetrics, type MarketContextInput } from "@/lib/metrics/engine"
import { buildEvidence } from "@/lib/evidence/engine"
import { buildFinancialTrend } from "@/lib/metrics/trend"
import { computeIndustryValuationStats } from "@/lib/metrics/market-context"
import type { Evidence } from "@/lib/evidence/types"
import { LLMConfigError, parseLLMJson, runLLM } from "@/lib/ai/model"
import { computeCapabilityManifest } from "./capability"
import { buildCompanyContext, matchEvidenceByCapabilities, type CompanyContext } from "./company-context"
import {
  FRAMER_PROMPT_VERSION,
  buildFramerRepairPrompt,
  buildFramerSystemPrompt,
  buildFramerUserPrompt,
  validateResearchFrame,
} from "./framer"
import {
  COMPOSER_PROMPT_VERSION,
  applyTotalBudget,
  buildComposerRepairPrompt,
  buildComposerSystemPrompt,
  buildComposerUserPrompt,
  buildDimensionPack,
  parseComposerShape,
  type DimensionPack,
} from "./composer"
import { validateDimensionClaims, type ResearchClaim } from "./claims"
import { makeDimensionId, type ResearchDimension, type ResearchFrame } from "./dimension-schema"

// Research Space Orchestrator（Task 12 §95）：
//   Search/Company Context → Capability Manifest → Research Framer →
//   Capability Mapping → Truth/Metric/Evidence（复用 V1）→ Per-Dimension Packing →
//   Composer（一次调用）→ Claim Validation → ResearchSpace

const FRAMER_MAX_TOKENS = 2000
const COMPOSER_MAX_TOKENS = 3000
const TEMPERATURE = 0.2

export interface ResearchSpaceResponse {
  spaceId: string
  company: CompanyContext
  entryQuestion?: string
  frame: ResearchFrame
  dimensions: ResearchDimension[]
  claims: ResearchClaim[]
  evidence: Evidence[]
  suggestions: { label: string; researchQuestion: string; rationale: string; capabilityRefs: string[] }[]
  trend: ReturnType<typeof buildFinancialTrend>
  metrics: ReturnType<typeof calculateMetrics>["metrics"]
  ai: {
    status: "success" | "partial_failure" | "failed"
    framer?: { model: string; promptVersion: string; latencyMs: number; retries: number; status: string }
    composer?: { model: string; promptVersion: string; latencyMs: number; retries: number; status: string }
    issues?: string[]
  }
  errors: { domain: string; message: string }[]
}

interface TruthBundle {
  dataResp: Awaited<ReturnType<typeof gatherStockData>>
  marketCtx: MarketContext
  eventCtx: EventContext
  metrics: ReturnType<typeof calculateMetrics>
  evidence: Evidence[]
  trend: ReturnType<typeof buildFinancialTrend>
  industryResolved: boolean
  industryValuationAvailable: boolean
}

async function loadTruth(stockCode: string): Promise<TruthBundle> {
  const [dataResp, marketCtx, eventCtx] = await Promise.all([
    gatherStockData(stockCode),
    gatherMarketContext(stockCode).catch((): MarketContext => ({ csi300: [], errors: [] })),
    gatherEventContext(stockCode).catch(
      (): EventContext => ({
        events: [],
        coverage: { anomaly: "failed", attention: "failed", corporateAction: "failed", newsDisclosure: "unavailable" },
        errors: [],
      }),
    ),
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
  const bundle = buildEvidence({
    metrics: metricsResp.metrics,
    trend: makeTrendLookup(dataResp.financial),
    events: eventCtx,
    context: {
      stockCode,
      stockName: dataResp.stock?.stockName ?? stockCode,
      industry: marketCtx.industry?.context.industryName ?? dataResp.stock?.industry ?? null,
      latestFinancialPeriod: metricsResp.latestFinancialPeriod,
      latestPriceDate: metricsResp.latestPriceDate,
      metricWarnings: metricsResp.warnings,
      industryPricesAvailable: (marketCtx.industry?.prices.length ?? 0) > 0,
      industryValuationAvailable: Boolean(marketCtx.industry?.valuations),
    },
  })
  return {
    dataResp,
    marketCtx,
    eventCtx,
    metrics: metricsResp,
    evidence: bundle.evidence,
    trend: buildFinancialTrend(dataResp.financial),
    industryResolved: Boolean(marketCtx.industry),
    industryValuationAvailable: Boolean(marketCtx.industry?.valuations),
  }
}

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

export function buildContextFromTruth(stockCode: string, truth: TruthBundle): CompanyContext {
  const capabilities = computeCapabilityManifest({
    metrics: truth.metrics.metrics,
    evidence: truth.evidence,
    events: truth.eventCtx,
    industryResolved: truth.industryResolved,
    industryValuationAvailable: truth.industryValuationAvailable,
  })
  return buildCompanyContext({
    stockCode,
    stockName: truth.dataResp.stock?.stockName ?? stockCode,
    capabilities,
    legacyIndustry: null, // buildCompanyContext 内部即走注册表 + legacy 回退
  })
}

async function runFramer(context: CompanyContext, question?: string) {
  const systemPrompt = buildFramerSystemPrompt()
  const userPrompt = buildFramerUserPrompt({ context, question })
  const first = await runLLM({
    task: "planner",
    promptVersion: FRAMER_PROMPT_VERSION,
    systemPrompt,
    userPrompt,
    temperature: TEMPERATURE,
    maxTokens: FRAMER_MAX_TOKENS,
  }).catch((err) => ({
    output: "",
    trace: {
      task: "planner" as const,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      promptVersion: FRAMER_PROMPT_VERSION,
      status: "failed" as const,
      latencyMs: 0,
      retries: 0,
      validationIssues: [err instanceof LLMConfigError ? err.message : String(err)],
    },
  }))
  if (first.trace.status === "failed") {
    return { status: "failed" as const, trace: first.trace, issues: first.trace.validationIssues ?? [] }
  }
  const attempt = (output: string) => {
    try {
      return validateResearchFrame(parseLLMJson(output), context)
    } catch (err) {
      return { ok: false as const, issues: [err instanceof Error ? err.message : String(err)] }
    }
  }
  const v1 = attempt(first.output)
  if (v1.ok && v1.frame) return { status: "success" as const, trace: first.trace, frame: v1.frame }

  const second = await runLLM({
    task: "planner",
    promptVersion: FRAMER_PROMPT_VERSION,
    systemPrompt,
    userPrompt: buildFramerRepairPrompt(first.output, v1.issues),
    temperature: TEMPERATURE,
    maxTokens: FRAMER_MAX_TOKENS,
  }).catch((err) => ({
    output: "",
    trace: {
      task: "planner" as const,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      promptVersion: FRAMER_PROMPT_VERSION,
      status: "failed" as const,
      latencyMs: 0,
      retries: 1,
      validationIssues: [String(err)],
    },
  }))
  if (second.trace.status === "failed") {
    return {
      status: "failed" as const,
      trace: { ...second.trace, retries: second.trace.retries + 1 },
      issues: [...v1.issues, ...(second.trace.validationIssues ?? [])],
    }
  }
  const v2 = attempt(second.output)
  if (v2.ok && v2.frame) {
    return {
      status: "success" as const,
      trace: { ...second.trace, retries: second.trace.retries + 1, validationIssues: v1.issues },
      frame: v2.frame,
    }
  }
  return {
    status: "failed" as const,
    trace: { ...second.trace, retries: second.trace.retries + 1 },
    issues: [...v1.issues, ...v2.issues],
  }
}

function statusFromPack(draftCapabilities: string[], context: CompanyContext, evidenceCount: number): "ready" | "partial" | "unknown" {
  if (evidenceCount === 0) return "unknown"
  const statuses = draftCapabilities.map(
    (key) => context.capabilities.find((c) => c.key === key)?.status ?? "unavailable",
  )
  if (statuses.includes("unavailable")) return "partial"
  if (statuses.every((s) => s === "ready")) return "ready"
  return "partial"
}

async function runComposer(input: {
  company: { stockCode: string; stockName: string; industryName?: string }
  question?: string
  packs: DimensionPack[]
}) {
  const systemPrompt = buildComposerSystemPrompt()
  const userPrompt = buildComposerUserPrompt(input)
  const call = (prompt: string) =>
    runLLM({
      task: "diagnosis_synthesis",
      promptVersion: COMPOSER_PROMPT_VERSION,
      systemPrompt,
      userPrompt: prompt,
      temperature: TEMPERATURE,
      maxTokens: COMPOSER_MAX_TOKENS,
    }).catch((err) => ({
      output: "",
      trace: {
        task: "diagnosis_synthesis" as const,
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        promptVersion: COMPOSER_PROMPT_VERSION,
        status: "failed" as const,
        latencyMs: 0,
        retries: 0,
        validationIssues: [err instanceof LLMConfigError ? err.message : String(err)],
      },
    }))

  const validate = (output: string) => {
    try {
      const shape = parseComposerShape(parseLLMJson(output))
      if (!shape.ok) return { ok: false as const, issues: shape.issues }
      // 维度级 grounding 校验
      const issues: string[] = []
      const claimsByDimension = new Map<string, ResearchClaim[]>()
      for (const dimOut of shape.output.dimensions) {
        const pack = input.packs.find((p) => p.dimension.dimensionId === dimOut.dimensionId)
        if (!pack) {
          issues.push(`composer 返回了未知 dimensionId：${dimOut.dimensionId}`)
          continue
        }
        const result = validateDimensionClaims(dimOut.claims, pack.dimension, pack.evidence)
        if (!result.ok) {
          issues.push(...result.issues.map((i) => `${i.claimId}/${i.rule}: ${i.message}`))
          continue
        }
        claimsByDimension.set(dimOut.dimensionId, result.claims)
      }
      if (issues.length > 0) return { ok: false as const, issues }
      return { ok: true as const, overview: shape.output.overview, claimsByDimension }
    } catch (err) {
      return { ok: false as const, issues: [err instanceof Error ? err.message : String(err)] }
    }
  }

  const first = await call(userPrompt)
  if (first.trace.status === "failed") {
    return { status: "failed" as const, trace: first.trace, issues: first.trace.validationIssues ?? [] }
  }
  const v1 = validate(first.output)
  if (v1.ok) return { status: "success" as const, trace: first.trace, overview: v1.overview, claimsByDimension: v1.claimsByDimension }

  const second = await call(buildComposerRepairPrompt(first.output, v1.issues))
  if (second.trace.status === "failed") {
    return {
      status: "failed" as const,
      trace: { ...second.trace, retries: 1 },
      issues: [...v1.issues, ...(second.trace.validationIssues ?? [])],
    }
  }
  const v2 = validate(second.output)
  if (v2.ok) {
    return {
      status: "success" as const,
      trace: { ...second.trace, retries: 1, validationIssues: v1.issues },
      overview: v2.overview,
      claimsByDimension: v2.claimsByDimension,
    }
  }
  return { status: "failed" as const, trace: { ...second.trace, retries: 1 }, issues: [...v1.issues, ...v2.issues] }
}

export async function initResearchSpace(input: {
  stockCode: string
  question?: string
}): Promise<ResearchSpaceResponse> {
  const spaceId = randomUUID()
  const truth = await loadTruth(input.stockCode)
  const context = buildContextFromTruth(input.stockCode, truth)

  const framer = await runFramer(context, input.question)
  if (framer.status === "failed") {
    // AI failure：仍然返回 Company Context + 证据（Truth Layer 不丢），无维度
    return {
      spaceId,
      company: context,
      entryQuestion: input.question,
      frame: { intent: "framing_failed", dimensions: [], suggestedDimensions: [], framingReason: "AI 研究框架生成失败" },
      dimensions: [],
      claims: [],
      evidence: truth.evidence,
      suggestions: [],
      trend: truth.trend,
      metrics: truth.metrics.metrics,
      ai: {
        status: "failed",
        framer: { model: framer.trace.model, promptVersion: framer.trace.promptVersion, latencyMs: framer.trace.latencyMs, retries: framer.trace.retries, status: "failed" },
        issues: framer.issues,
      },
      errors: truth.dataResp.errors.map((e) => ({ domain: e.domain, message: e.message })),
    }
  }

  const frame = framer.frame!

  // Capability Mapping → Evidence Matching → Per-Dimension Packing
  const packs = applyTotalBudget(
    frame.dimensions.map((draft, index) => {
      const dimensionId = makeDimensionId(draft.label, index, "ai_initial")
      const matched = matchEvidenceByCapabilities(truth.evidence, draft.capabilityRefs)
      const status = statusFromPack(draft.capabilityRefs, context, matched.length)
      const dimension: ResearchDimension = {
        dimensionId,
        label: draft.label,
        researchQuestion: draft.researchQuestion,
        ...(draft.description ? { description: draft.description } : {}),
        origin: "ai_initial",
        capabilityRefs: draft.capabilityRefs,
        status,
        rationale: draft.rationale,
        priority: index + 1,
        evidenceIds: [],
        claimIds: [],
      }
      return buildDimensionPack(dimension, matched)
    }),
  )

  const composer = await runComposer({
    company: {
      stockCode: context.stockCode,
      stockName: context.stockName,
      ...(context.industryName ? { industryName: context.industryName } : {}),
    },
    question: input.question,
    packs,
  })

  const dimensions: ResearchDimension[] = packs.map((pack, index) => ({
    ...pack.dimension,
    priority: index + 1,
    claimIds: composer.status === "success" ? (composer.claimsByDimension?.get(pack.dimension.dimensionId) ?? []).map((c) => c.claimId) : [],
  }))
  const claims: ResearchClaim[] = composer.status === "success" ? [...(composer.claimsByDimension?.values() ?? [])].flat() : []

  const usedEvidenceIds = new Set(dimensions.flatMap((d) => d.evidenceIds))
  const evidence = truth.evidence.filter((e) => usedEvidenceIds.has(e.evidenceId))

  return {
    spaceId,
    company: context,
    entryQuestion: input.question,
    frame,
    dimensions,
    claims,
    evidence,
    suggestions: frame.suggestedDimensions.map((s) => ({
      label: s.label,
      researchQuestion: s.researchQuestion,
      rationale: s.rationale,
      capabilityRefs: s.capabilityRefs,
    })),
    trend: truth.trend,
    metrics: truth.metrics.metrics,
    ai: {
      status: composer.status === "success" ? "success" : "partial_failure",
      framer: { model: framer.trace.model, promptVersion: framer.trace.promptVersion, latencyMs: framer.trace.latencyMs, retries: framer.trace.retries, status: framer.trace.status },
      composer: composer.trace
        ? { model: composer.trace.model, promptVersion: composer.trace.promptVersion, latencyMs: composer.trace.latencyMs, retries: composer.trace.retries, status: composer.trace.status }
        : undefined,
      ...(composer.status === "failed" ? { issues: composer.issues } : {}),
    },
    errors: truth.dataResp.errors.map((e) => ({ domain: e.domain, message: e.message })),
  }
}

/** 供 add-dimension 复用的真值加载（避免重复实现） */
export async function loadTruthForResearch(stockCode: string): Promise<{
  truth: TruthBundle
  context: CompanyContext
}> {
  const truth = await loadTruth(stockCode)
  return { truth, context: buildContextFromTruth(stockCode, truth) }
}

export { computeIndustryValuationStats }
