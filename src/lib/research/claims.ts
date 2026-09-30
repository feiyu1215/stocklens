import type { Evidence } from "@/lib/evidence/types"
import type { ResearchDimension } from "./dimension-schema"

// Research Claim（Task 12 §24/§32）：Dimension → Claim → Evidence 的操作对象层。
// Claim 必须绑定对应 Dimension 的证据包（grounded），类型规则与既有 Evidence 校验一致。

export interface ResearchClaim {
  claimId: string
  dimensionId: string
  text: string
  type: "fact" | "inference" | "unknown"
  signal: "positive" | "negative" | "conflict" | "neutral" | "unknown"
  evidenceIds: string[]
}

export interface ClaimValidationIssue {
  dimensionId: string
  claimId: string
  rule: string
  message: string
}

export interface ClaimValidationResult {
  ok: boolean
  issues: ClaimValidationIssue[]
  claims: ResearchClaim[]
}

/**
 * Claim Grounding Validator（Task 12 §35–§38）：
 * - 所有 evidenceIds 必须存在于该 Dimension 的证据包；
 * - fact claim 只能引用 fact evidence；
 * - inference claim 至少 1 条 inference evidence；
 * - unknown claim 只能引用 unknown evidence（或 dimension status = unknown）。
 */
export function validateDimensionClaims(
  rawClaims: { text: string; type: string; signal: string; evidenceIds: string[] }[],
  dimension: Pick<ResearchDimension, "dimensionId" | "status" | "evidenceIds">,
  packEvidence: Evidence[],
): ClaimValidationResult {
  const issues: ClaimValidationIssue[] = []
  const packIds = new Set(dimension.evidenceIds)
  const byId = new Map(packEvidence.map((e) => [e.evidenceId, e] as const))

  const claims: ResearchClaim[] = rawClaims.map((raw, index) => {
    const claimId = `${dimension.dimensionId}_C${String(index + 1).padStart(2, "0")}`
    return {
      claimId,
      dimensionId: dimension.dimensionId,
      text: raw.text,
      type: (raw.type as ResearchClaim["type"]) ?? "unknown",
      signal: (raw.signal as ResearchClaim["signal"]) ?? "unknown",
      evidenceIds: raw.evidenceIds,
    }
  })

  for (const claim of claims) {
    if (claim.text.trim().length === 0) {
      issues.push({ dimensionId: dimension.dimensionId, claimId: claim.claimId, rule: "empty-text", message: "claim text 不能为空" })
    }
    if (!["fact", "inference", "unknown"].includes(claim.type)) {
      issues.push({ dimensionId: dimension.dimensionId, claimId: claim.claimId, rule: "invalid-type", message: `非法 type：${claim.type}` })
    }
    // grounding：所有引用必须在 dimension 证据包内
    for (const id of claim.evidenceIds) {
      if (!packIds.has(id)) {
        issues.push({
          dimensionId: dimension.dimensionId,
          claimId: claim.claimId,
          rule: "evidence-binding",
          message: `引用的证据不在该维度证据包内：${id}`,
        })
      }
    }
    const refs = claim.evidenceIds.map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e))

    if (claim.type === "fact" && claim.evidenceIds.length > 0) {
      if (!refs.every((e) => e.type === "fact")) {
        issues.push({ dimensionId: dimension.dimensionId, claimId: claim.claimId, rule: "fact-type", message: "fact claim 只能引用 fact 证据" })
      }
    }
    if (claim.type === "inference") {
      if (claim.evidenceIds.length === 0 || !refs.some((e) => e.type === "inference")) {
        issues.push({
          dimensionId: dimension.dimensionId,
          claimId: claim.claimId,
          rule: "inference-type",
          message: "inference claim 至少引用 1 条 inference 证据",
        })
      }
    }
    if (claim.type === "unknown" && claim.evidenceIds.length > 0) {
      if (!refs.every((e) => e.type === "unknown")) {
        issues.push({ dimensionId: dimension.dimensionId, claimId: claim.claimId, rule: "unknown-type", message: "unknown claim 只能引用 unknown 证据" })
      }
    }
    // unknown claim 在 dimension status=unknown 时允许无证据（缺失信息说明）
    if (claim.type === "unknown" && claim.evidenceIds.length === 0 && dimension.status !== "unknown") {
      issues.push({
        dimensionId: dimension.dimensionId,
        claimId: claim.claimId,
        rule: "unknown-grounding",
        message: "非 unknown 维度的 unknown claim 必须引用 unknown 证据",
      })
    }
    if (claim.evidenceIds.length === 0 && claim.type !== "unknown") {
      issues.push({
        dimensionId: dimension.dimensionId,
        claimId: claim.claimId,
        rule: "missing-grounding",
        message: "非 unknown claim 必须绑定证据",
      })
    }
  }

  return { ok: issues.length === 0, issues, claims }
}
