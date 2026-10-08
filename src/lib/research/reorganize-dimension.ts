import "server-only"

// 重新组织单个维度（阶段 4 / P1-2 路线 A 的配套入口）。
//
// 语义：证据快刷后，受影响结论的维度可以「重新组织」——对该维度用**最新**真值
// 重新打包证据并重跑一次维度合成（单次 LLM 调用，含确定性回退），替换该维度的
// claims。维度本身的 label / researchQuestion / capabilityRefs 保持不变（不是新增维度，
// 不跑 framer）。与 add-dimension 的合成段同构，复用同一套校验与回退纪律。

import type { Evidence } from "@/lib/evidence/types"
import { parseLLMJson, runLLM } from "@/lib/ai/model"
import { matchEvidenceByCapabilities } from "./company-context"
import { buildDimensionPack } from "./composer"
import { validateDimensionClaims, type ResearchClaim } from "./claims"
import type { ResearchDimension } from "./dimension-schema"
import { loadTruthForResearch } from "./init-space"

export interface ReorganizeDimensionResponse {
  dimensionId: string
  dimension: ResearchDimension
  claims: ResearchClaim[]
  evidence: Evidence[]
  ai: { status: "success" | "failed"; model?: string; promptVersion?: string; latencyMs?: number; issues?: string[] }
  errors: { domain: string; message: string }[]
}

export async function reorganizeDimension(input: {
  stockCode: string
  dimension: ResearchDimension
}): Promise<ReorganizeDimensionResponse> {
  const { truth } = await loadTruthForResearch(input.stockCode)
  const dimension = input.dimension

  // Capability Mapping（确定性）：以最新真值重新匹配该维度声明的能力
  const matched = matchEvidenceByCapabilities(truth.evidence, dimension.capabilityRefs)
  const pack = buildDimensionPack(dimension, matched)

  const synthSystem = [
    "你是 StockLens 的维度综合器。输入是一个已有维度与它基于最新数据的证据包。",
    "为这个维度写 2–5 条 claim。" + "每条 claim 必须绑定证据包内的 evidenceId；fact 只引 fact，inference 至少 1 条 inference，unknown 只引 unknown。",
    "不得编造事实/数字/能力；不得评价股票；保留 interpretationNote 的限制。",
    '只输出 JSON：{"claims":[{"text":"...","type":"fact|inference|unknown","signal":"positive|negative|conflict|neutral|unknown","evidenceIds":["..."]}]}',
  ].join("\n")
  const synthUser = JSON.stringify({
    dimension: { label: pack.dimension.label, researchQuestion: pack.dimension.researchQuestion },
    evidence: pack.evidence.map((e) => ({
      evidenceId: e.evidenceId,
      type: e.type,
      signal: e.signal,
      title: e.title,
      statement: e.statement,
      basedOn: e.basedOn,
      ...(e.interpretationNote ? { interpretationNote: e.interpretationNote } : {}),
    })),
  })

  const runSynthesis = (prompt: string) =>
    runLLM({
      task: "diagnosis_synthesis",
      promptVersion: "dimension_synthesis_v1",
      systemPrompt: synthSystem,
      userPrompt: prompt,
      temperature: 0.2,
      maxTokens: 1600,
    })

  const validateSynthesis = (output: string) => {
    try {
      const parsed = parseLLMJson(output) as Record<string, unknown>
      if (!Array.isArray(parsed.claims)) return { ok: false as const, issues: ["claims 必须是数组"] }
      const result = validateDimensionClaims(
        parsed.claims as { text: string; type: string; signal: string; evidenceIds: string[] }[],
        pack.dimension,
        pack.evidence,
      )
      if (!result.ok) return { ok: false as const, issues: result.issues.map((i) => `${i.rule}: ${i.message}`) }
      return { ok: true as const, claims: result.claims }
    } catch (err) {
      return { ok: false as const, issues: [err instanceof Error ? err.message : String(err)] }
    }
  }

  let claims: ResearchClaim[] = []
  let aiTrace: ReorganizeDimensionResponse["ai"] = { status: "failed" }
  try {
    const first = await runSynthesis(synthUser)
    aiTrace = {
      status: first.trace.status === "success" ? "success" : "failed",
      model: first.trace.model,
      promptVersion: first.trace.promptVersion,
      latencyMs: first.trace.latencyMs,
    }
    if (first.trace.status === "success") {
      const v1 = validateSynthesis(first.output)
      if (v1.ok) {
        claims = v1.claims
      } else {
        const second = await runSynthesis(
          `上一次输出未通过校验：\n${v1.issues.join("\n")}\n\n原输出：\n${first.output}\n\n请重新输出合法 JSON。`,
        )
        if (second.trace.status === "success") {
          const v2 = validateSynthesis(second.output)
          if (v2.ok) claims = v2.claims
        }
      }
    } else {
      aiTrace.issues = first.trace.validationIssues
    }
  } catch (err) {
    aiTrace.issues = [err instanceof Error ? err.message : String(err)]
  }

  // 合成失败时的确定性回退（与 add-dimension 同纪律）：证据原文直接成为 grounded claim
  let usedFallback = false
  if (claims.length === 0 && pack.evidence.length > 0) {
    usedFallback = true
    const prioritized = [...pack.evidence].sort((a, b) => {
      const tier = (e: Evidence) => {
        if (e.type === "inference" && e.signal === "conflict") return 0
        if (e.type === "inference") return 1
        if (e.type === "unknown") return 2
        if (e.type === "fact" && e.signal === "negative") return 3
        return 4
      }
      return tier(a) - tier(b)
    })
    claims = prioritized.slice(0, 4).map((e, index) => ({
      claimId: `${dimension.dimensionId}_C${String(index + 1).padStart(2, "0")}`,
      dimensionId: dimension.dimensionId,
      text: e.statement,
      type: e.type,
      signal: e.signal,
      evidenceIds: [e.evidenceId],
    }))
  }

  const nextDimension: ResearchDimension = {
    ...pack.dimension,
    claimIds: claims.map((c) => c.claimId),
  }

  return {
    dimensionId: dimension.dimensionId,
    dimension: nextDimension,
    claims,
    evidence: pack.evidence,
    ai: {
      ...aiTrace,
      status: aiTrace.status === "success" && !usedFallback && claims.length > 0 ? "success" : "failed",
      ...(usedFallback
        ? { issues: [...(aiTrace.issues ?? []), "AI 合成未产出可校验 claim，已回退为确定性证据陈述（未新增事实）"] }
        : claims.length === 0
          ? { issues: [...(aiTrace.issues ?? []), "维度合成未产出可校验的 claim（证据绑定校验未通过）"] }
          : {}),
    },
    errors: truth.dataResp.errors.map((e) => ({ domain: e.domain, message: e.message })),
  }
}
