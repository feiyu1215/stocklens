// 证据快刷——前端合并纯函数（阶段 4 / P1-2，路线 A）
//
// 合并纪律：
// - 只有 freshness.timeSensitive 的证据做原地替换（行情/估值/事件类）；财务报告期类
//   证据不参与快刷（它们按报告期判定，报告期没变就不该动）——这也是反例测试的依据。
// - metrics / marketHistory / trend 与 evidence **同源**替换（都来自同一次服务端重算），
//   否则会出现"证据是新的、指标是旧的"的另一种撕裂。
// - 合并后重跑 validateEvidenceBundle；校验不过就抛错，调用方不得写入 state（天然回滚）。
// - spaceId 保持不变（刷新不产生新研究空间）。

import { validateEvidenceBundle } from "@/lib/evidence/validate"
import type { ResearchSpacePayload } from "@/components/observatory/theme"
import type { Evidence } from "@/lib/evidence/types"
import type { ResearchClaim } from "@/lib/research/claims"

/**
 * 受影响 claim 判定（路线 A 的核心口径，纯函数，客户端合并时调用）：
 * claim.evidenceIds 中存在「statement 变化」的证据 → 该结论为更新前生成。
 * 只比较 statement：数字变化与 stale 限定语增删都体现在 statement 原文；
 * retrievedAt 必然变化、不参与比较，否则全部误标。
 */
export function affectedClaimIds(
  claims: ResearchClaim[],
  oldEvidence: Evidence[],
  newEvidence: Evidence[],
): Set<string> {
  const oldById = new Map(oldEvidence.map((e) => [e.evidenceId, e]))
  const changed = new Set<string>()
  for (const next of newEvidence) {
    const prev = oldById.get(next.evidenceId)
    if (!prev) continue
    if (prev.statement !== next.statement) changed.add(next.evidenceId)
  }
  const affected = new Set<string>()
  for (const claim of claims) {
    if (claim.evidenceIds.some((id) => changed.has(id))) affected.add(claim.claimId)
  }
  return affected
}

/**
 * Evidence first 闸门（差分校验口径）：
 * payload 里的证据是维度引用的子集，INFERENCE.basedOn 引用被裁剪掉的 FACT 是既有常态
 * （init 时校验跑在服务端全集上），所以不能对子集直接跑全量规则——会误报 broken-reference。
 * 正确口径：对合并前后各跑一遍校验，**新增的 violation** 才意味着刷新真正损坏了证据结构。
 */
function assertNoNewViolations(before: Evidence[], after: Evidence[], action: string): void {
  const violationsOf = (list: Evidence[]) =>
    new Set(validateEvidenceBundle(list).violations.map((v) => `${v.evidenceId}(${v.rule})`))
  const beforeSet = violationsOf(before)
  const afterSet = violationsOf(after)
  const fresh = [...afterSet].filter((v) => !beforeSet.has(v))
  if (fresh.length > 0) {
    throw new Error(`${action}后的证据校验未通过（新增违规）：${fresh.join("、")}`)
  }
}

export interface RefreshResponseLike {
  stockCode: string
  retrievedAt: string
  metrics: ResearchSpacePayload["metrics"]
  evidence: Evidence[]
  marketHistory: NonNullable<ResearchSpacePayload["marketHistory"]>
  trend: ResearchSpacePayload["trend"]
  errors: { domain: string; message: string }[]
}

export interface RefreshMergeResult {
  payload: ResearchSpacePayload
  /** 受影响 claim（引用了 statement 变化的证据）→ 打可见标记 */
  updatedClaimIds: string[]
  /** 实际被替换的证据 ID */
  refreshedEvidenceIds: string[]
  /** 服务端返回但未合并的证据 ID（非 timeSensitive 或本地不存在） */
  skippedEvidenceIds: string[]
}

export function mergeRefreshedTruth(
  payload: ResearchSpacePayload,
  refresh: RefreshResponseLike,
): RefreshMergeResult {
  if (refresh.stockCode !== payload.company.stockCode) {
    throw new Error(`刷新返回的是 ${refresh.stockCode} 的数据，与当前公司 ${payload.company.stockCode} 不一致`)
  }

  const newById = new Map(refresh.evidence.map((e) => [e.evidenceId, e]))
  const refreshed: string[] = []
  const skipped: string[] = []

  const mergedEvidence: Evidence[] = payload.evidence.map((old) => {
    const next = newById.get(old.evidenceId)
    if (!next) return old
    // 只有时间敏感类证据参与快刷；报告期类证据原地保留
    if (!old.freshness?.timeSensitive) {
      skipped.push(old.evidenceId)
      return old
    }
    refreshed.push(old.evidenceId)
    return next
  })

  // Evidence first 闸门：合并不得引入新的证据损坏，否则整体拒绝写入
  assertNoNewViolations(payload.evidence, mergedEvidence, "刷新")

  const updatedClaimIds = [...affectedClaimIds(payload.claims, payload.evidence, mergedEvidence)]

  return {
    payload: {
      ...payload,
      metrics: refresh.metrics,
      evidence: mergedEvidence,      marketHistory: refresh.marketHistory,
      trend: refresh.trend,
      errors: refresh.errors,
    },
    updatedClaimIds,
    refreshedEvidenceIds: refreshed,
    skippedEvidenceIds: skipped,
  }
}

/** 快刷入口的可见条件：存在确属 stale 的行情类（timeSensitive）证据 */
export function hasStaleTimeSensitiveEvidence(payload: ResearchSpacePayload): boolean {
  return payload.evidence.some((e) => e.freshness?.timeSensitive && e.freshness.status === "stale")
}

/** 入口提示用的最新行情数据日期 */
export function latestTimeSensitiveDataAsOf(payload: ResearchSpacePayload): string | null {
  const dates = payload.evidence
    .filter((e) => e.freshness?.timeSensitive && e.freshness.status === "stale")
    .map((e) => e.freshness?.dataAsOf)
    .filter((d): d is string => typeof d === "string")
    .sort()
  return dates[dates.length - 1] ?? null
}

export interface ReorganizeResponseLike {
  dimensionId: string
  dimension: ResearchSpacePayload["dimensions"][number]
  claims: ResearchSpacePayload["claims"]
  evidence: Evidence[]
}

/** 「重新组织该维度」的合并：替换维度、整体替换该维度 claims、按 ID 合并最新证据 */
export function applyReorganizedDimension(
  payload: ResearchSpacePayload,
  resp: ReorganizeResponseLike,
): ResearchSpacePayload {
  if (!payload.dimensions.some((d) => d.dimensionId === resp.dimensionId)) {
    throw new Error(`重新组织返回了未知维度：${resp.dimensionId}`)
  }
  const evidenceById = new Map(payload.evidence.map((e) => [e.evidenceId, e]))
  for (const e of resp.evidence) evidenceById.set(e.evidenceId, e)
  const mergedList = [...evidenceById.values()]
  assertNoNewViolations(payload.evidence, mergedList, "重新组织")
  return {
    ...payload,
    dimensions: payload.dimensions.map((d) => (d.dimensionId === resp.dimensionId ? resp.dimension : d)),
    claims: [...payload.claims.filter((c) => c.dimensionId !== resp.dimensionId), ...resp.claims],
    evidence: [...evidenceById.values()],
  }
}
