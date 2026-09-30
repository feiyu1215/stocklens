import "server-only"

import { randomUUID } from "node:crypto"

import { LLMConfigError, parseLLMJson, runLLM } from "@/lib/ai/model"
import { CAPABILITY_KEYS, type CapabilityKey } from "./capability"
import { matchEvidenceByCapabilities } from "./company-context"
import { buildDimensionPack } from "./composer"
import { validateDimensionClaims, type ResearchClaim } from "./claims"
import { makeDimensionId, DIMENSION_LIMITS, type ResearchDimension } from "./dimension-schema"
import { loadTruthForResearch } from "./init-space"

// Add Dimension Pipeline（Task 12 §44/§96）：
//   User text → Dimension Framing → Capability Mapping → Evidence Selection →
//   Dimension Synthesis → Validation → new Research Object
// 不重新生成整个 Research Space；无法验证时返回 status=unknown（绝不编造）。

export const ADD_DIMENSION_PROMPT_VERSION = "dimension_framer_v1"

export interface AddDimensionRequest {
  stockCode: string
  dimensionText: string
  currentDimensions: string[]
  entryQuestion?: string
}

export interface AddDimensionResponse {
  dimensionId: string
  dimension: ResearchDimension
  claims: ResearchClaim[]
  evidence: ReturnType<typeof buildDimensionPack>["evidence"]
  ai: { status: "success" | "failed"; model?: string; promptVersion?: string; latencyMs?: number; issues?: string[] }
  errors: { domain: string; message: string }[]
}

function buildAddDimensionSystemPrompt(): string {
  return [
    "你是 StockLens 的维度设计器。用户想为一个已有的公司研究空间新增一个研究角度（Research Dimension）。",
    "",
    `可用数据能力（capabilityRefs 只能从这里选）：${CAPABILITY_KEYS.join(", ")}`,
    "",
    "你的职责：",
    "1. 把用户输入转化为一个规范的研究维度：label（≤16 字）、researchQuestion（≤80 字）、rationale（≤160 字，不得包含数字）。",
    "2. 判断该研究角度需要哪些数据能力（capabilityRefs）。如果当前系统没有对应能力，也必须如实选择最接近的能力集合或给出空数组。",
    "3. 【关键】判断当前数据能力是否真的支撑研究这个角度：dataSupport = supported（能力完整覆盖）| partial（只能覆盖一部分）| unsupported（当前数据无法验证，例如分地区收入、库存、渠道等未接入的数据）。必须诚实，不得为了让维度成立而虚报。",
    "4. 若 dataSupport = unsupported 或 partial，missingInformation 必须列出缺失的数据项（例如「分地区营业收入」「存货与周转数据」）。",
    "5. 不要与已有维度重复（会收到当前维度列表）。",
    "",
    '只输出 JSON：{"label":"...","researchQuestion":"...","description":"...","capabilityRefs":["..."],"dataSupport":"supported|partial|unsupported","missingInformation":["..."],"rationale":"..."}',
  ].join("\n")
}

export async function addResearchDimension(input: AddDimensionRequest): Promise<AddDimensionResponse> {
  const dimensionId = makeDimensionId(input.dimensionText, 0, "user")
  const dimensionText = input.dimensionText.trim()

  const { truth, context } = await loadTruthForResearch(input.stockCode)

  // ---- Dimension Framing（LLM）----
  const systemPrompt = buildAddDimensionSystemPrompt()
  const userPrompt = JSON.stringify({
    company: {
      stockCode: context.stockCode,
      stockName: context.stockName,
      ...(context.industryName ? { industryName: context.industryName } : {}),
      capabilities: context.capabilities.map((c) => ({ key: c.key, status: c.status, description: c.description })),
    },
    userDimensionText: dimensionText,
    currentDimensions: input.currentDimensions,
    entryQuestion: input.entryQuestion ?? null,
  })

  interface Draft {
    label: string
    researchQuestion: string
    description?: string
    capabilityRefs: CapabilityKey[]
    dataSupport: "supported" | "partial" | "unsupported"
    missingInformation?: string[]
    rationale: string
  }
  const validateDraft = (parsed: unknown): { ok: true; draft: Draft } | { ok: false; issues: string[] } => {
    if (typeof parsed !== "object" || parsed === null) return { ok: false, issues: ["输出必须是 JSON 对象"] }
    const d = parsed as Record<string, unknown>
    const issues: string[] = []
    const label = typeof d.label === "string" ? d.label.trim() : ""
    const researchQuestion = typeof d.researchQuestion === "string" ? d.researchQuestion.trim() : ""
    const rationale = typeof d.rationale === "string" ? d.rationale.trim() : ""
    if (label.length === 0 || label.length > DIMENSION_LIMITS.LABEL_MAX) issues.push("label 长度非法")
    if (researchQuestion.length === 0 || researchQuestion.length > DIMENSION_LIMITS.QUESTION_MAX) issues.push("researchQuestion 长度非法")
    if (rationale.length === 0 || rationale.length > DIMENSION_LIMITS.RATIONALE_MAX) issues.push("rationale 长度非法")
    if (/\d/.test(rationale)) issues.push("rationale 不得包含数字")
    const refs = Array.isArray(d.capabilityRefs) ? d.capabilityRefs : []
    for (const ref of refs) {
      if (!CAPABILITY_KEYS.includes(ref as CapabilityKey)) issues.push(`非法 capability：${JSON.stringify(ref)}`)
    }
    if (issues.length > 0) return { ok: false, issues }
    const rawSupport = typeof d.dataSupport === "string" ? d.dataSupport : "partial"
    const dataSupport: Draft["dataSupport"] =
      rawSupport === "supported" || rawSupport === "partial" || rawSupport === "unsupported" ? rawSupport : "partial"
    return {
      ok: true,
      draft: {
        label,
        researchQuestion,
        ...(typeof d.description === "string" && d.description.trim() ? { description: d.description.trim() } : {}),
        capabilityRefs: refs as CapabilityKey[],
        dataSupport,
        rationale,
        ...(Array.isArray(d.missingInformation)
          ? { missingInformation: d.missingInformation.filter((x): x is string => typeof x === "string") }
          : {}),
      },
    }
  }

  let draft: Draft | null = null
  let aiTrace: AddDimensionResponse["ai"] = { status: "failed" }
  try {
    const call = await runLLM({
      task: "planner",
      promptVersion: ADD_DIMENSION_PROMPT_VERSION,
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxTokens: 900,
    })
    aiTrace = {
      status: call.trace.status === "success" ? "success" : "failed",
      model: call.trace.model,
      promptVersion: call.trace.promptVersion,
      latencyMs: call.trace.latencyMs,
    }
    if (call.trace.status === "success") {
      const parsed = (() => {
        try {
          return validateDraft(parseLLMJson(call.output))
        } catch (err) {
          return { ok: false as const, issues: [err instanceof Error ? err.message : String(err)] }
        }
      })()
      if (parsed.ok) draft = parsed.draft
      else aiTrace.issues = parsed.issues
    } else {
      aiTrace.issues = call.trace.validationIssues
    }
  } catch (err) {
    aiTrace.issues = [err instanceof LLMConfigError ? err.message : String(err)]
  }

  // ---- Capability Mapping + Evidence Selection（确定性）----
  const effectiveDraft: Draft = draft ?? {
    label: dimensionText.slice(0, DIMENSION_LIMITS.LABEL_MAX),
    researchQuestion: `${dimensionText}相关的研究问题`,
    capabilityRefs: [],
    dataSupport: "unsupported",
    rationale: "AI 解析失败，按用户输入原样创建维度",
  }
  const matched = matchEvidenceByCapabilities(truth.evidence, effectiveDraft.capabilityRefs)

  const baseDimension: ResearchDimension = {
    dimensionId,
    label: effectiveDraft.label,
    researchQuestion: effectiveDraft.researchQuestion,
    ...(effectiveDraft.description ? { description: effectiveDraft.description } : {}),
    origin: "user",
    capabilityRefs: effectiveDraft.capabilityRefs,
    status: matched.length === 0 ? "unknown" : "partial",
    rationale: effectiveDraft.rationale,
    priority: 99,
    evidenceIds: [],
    claimIds: [],
  }
  const pack = buildDimensionPack(baseDimension, matched)

  // ---- dataSupport=unsupported 或无证据 → UNKNOWN Dimension（§22/§31/§66/§83）----
  if (effectiveDraft.dataSupport === "unsupported" || pack.evidence.length === 0) {
    const missing =
      effectiveDraft.missingInformation && effectiveDraft.missingInformation.length > 0
        ? effectiveDraft.missingInformation
        : ["当前系统没有与该研究角度对应的数据能力"]
    const dimension: ResearchDimension = {
      ...pack.dimension,
      status: "unknown",
      missingInformation: missing,
      evidenceIds: [],
      claimIds: [`${dimensionId}_C01`],
    }
    const claim: ResearchClaim = {
      claimId: `${dimensionId}_C01`,
      dimensionId,
      text: `当前证据不足以验证「${dimension.label}」这一研究方向。`,
      type: "unknown",
      signal: "unknown",
      evidenceIds: [],
    }
    return {
      dimensionId,
      dimension,
      claims: [claim],
      evidence: [],
      ai: aiTrace,
      errors: truth.dataResp.errors.map((e) => ({ domain: e.domain, message: e.message })),
    }
  }

  // ---- Dimension Synthesis（LLM，只针对新维度）----
  const synthSystem = [
    "你是 StockLens 的维度综合器。输入是新维度与它自己的证据包。",
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
  try {
    const first = await runSynthesis(synthUser)
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
    }
  } catch {
    // 合成失败不阻塞对象创建：维度以无 claim 的 partial 状态进入空间
  }

  const dimension: ResearchDimension = {
    ...pack.dimension,
    status: effectiveDraft.dataSupport === "supported" && claims.length > 0 ? "ready" : "partial",
    claimIds: claims.map((c) => c.claimId),
    ...(effectiveDraft.missingInformation ? { missingInformation: effectiveDraft.missingInformation } : {}),
  }

  return {
    dimensionId,
    dimension,
    claims,
    evidence: pack.evidence,
    ai: {
      ...aiTrace,
      status: claims.length > 0 ? "success" : "failed",
      ...(claims.length === 0 ? { issues: [...(aiTrace.issues ?? []), "维度合成未产出可校验的 claim（证据绑定校验未通过）"] } : {}),
    },
    errors: truth.dataResp.errors.map((e) => ({ domain: e.domain, message: e.message })),
  }
}

export { randomUUID }
