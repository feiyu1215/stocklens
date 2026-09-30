import type { Evidence, EvidenceDimension } from "@/lib/evidence/types"
import type { DiagnosisIntent, PlannerResult } from "./types"

// Evidence Context Packing（Task 09）：
// UI / Drawer / Follow-up 使用完整证据集（fullEvidence，不删减）；
// LLM Synthesizer 只消费按「用户意图 + 确定性优先级」打包的紧凑证据包（synthesisEvidence）。
//
// 为什么不把 40 条直接丢给模型：模型不需要、会截断输出、且会把无关维度写进总结。
// Packing 完全确定性（无 LLM 参与选择），保证可复现、可测试。

/** 单个 Synthesis Pack 的软上限与硬上限（集中配置，禁止散落 magic number） */
export const SYNTHESIS_EVIDENCE_BUDGET = {
  SOFT_MAX: 14,
  HARD_MAX: 18,
  /** 每个维度默认最多条数（防止 market 十几条事实吃满上下文） */
  MAX_PER_DIMENSION: 4,
  /** 每个主维度至少保留条数（若该维度确有证据） */
  MIN_PER_PRIMARY_DIMENSION: 1,
} as const

/** 按 Planner 意图的打包策略（决定上限与优先维度） */
export interface PackingPolicy {
  maxEvidence: number
  maxPerDimension: number
  /** 优先维度：同优先级下这些维度先入选 */
  preferredDimensions: EvidenceDimension[]
}

export const PACKING_POLICY: Record<DiagnosisIntent, PackingPolicy> = {
  overall_diagnosis: {
    maxEvidence: SYNTHESIS_EVIDENCE_BUDGET.SOFT_MAX,
    maxPerDimension: SYNTHESIS_EVIDENCE_BUDGET.MAX_PER_DIMENSION,
    preferredDimensions: [],
  },
  growth_review: {
    maxEvidence: 12,
    maxPerDimension: 4,
    preferredDimensions: ["growth", "profitability", "cashflow"],
  },
  profitability_review: {
    maxEvidence: 12,
    maxPerDimension: 4,
    preferredDimensions: ["profitability", "growth", "cashflow"],
  },
  cashflow_review: {
    maxEvidence: 12,
    maxPerDimension: 4,
    preferredDimensions: ["cashflow", "profitability", "growth"],
  },
  valuation_review: {
    maxEvidence: 10,
    maxPerDimension: 5,
    preferredDimensions: ["valuation", "industry"],
  },
  market_review: {
    maxEvidence: 12,
    maxPerDimension: 6,
    preferredDimensions: ["market", "industry"],
  },
  risk_review: {
    maxEvidence: 12,
    maxPerDimension: 4,
    preferredDimensions: ["market", "cashflow", "profitability"],
  },
}

export interface EvidencePack {
  synthesisEvidence: Evidence[]
  /** 只统计 synthesisEvidence 的维度分布（供 Trace 展示） */
  byDimension: Partial<Record<EvidenceDimension, number>>
  /** 依赖闭包额外带入的 FACT 数量（超出优先级选择的部分） */
  closureAdded: number
}

function priorityOf(e: Evidence): number {
  if (e.type === "inference" && e.signal === "conflict") return 1
  if (e.type === "inference") return 2
  if (e.type === "unknown") return 3
  if (e.type === "fact" && e.signal === "negative") return 4
  if (e.type === "fact" && e.signal === "positive") return 5
  return 6 // neutral fact
}

/**
 * 确定性排序键：
 *   1. 优先级层级（conflict inference → inference → unknown → negative → positive → neutral）
 *   2. 主维度（Planer 的 dimensions）优先于 optionalDimensions
 *   3. policy.preferredDimensions 优先
 *   4. 原始数组顺序（稳定）
 */
function compareEvidence(
  a: Evidence,
  b: Evidence,
  ctx: { primary: Set<EvidenceDimension>; optional: Set<EvidenceDimension>; preferred: Set<EvidenceDimension>; index: Map<string, number> },
): number {
  const pa = priorityOf(a)
  const pb = priorityOf(b)
  if (pa !== pb) return pa - pb
  const rank = (e: Evidence): number => {
    if (ctx.primary.has(e.dimension)) return 0
    if (ctx.optional.has(e.dimension)) return 1
    if (ctx.preferred.has(e.dimension)) return 2
    return 3
  }
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra - rb
  return (ctx.index.get(a.evidenceId) ?? 0) - (ctx.index.get(b.evidenceId) ?? 0)
}

/**
 * 构建 Synthesis Evidence Pack（纯函数，确定性）。
 *
 * 规则（Task 09 §5–§15, §26）：
 * - 优先级排序 + 主维度/偏好维度加权；
 * - 每维度不超过 policy.maxPerDimension（健康维度覆盖）；
 * - 每个主维度若有证据，至少保留 MIN_PER_PRIMARY_DIMENSION 条；
 * - Inference 依赖闭包：选中 inference 必须带入其 basedOn FACT（可轻微超过 SOFT_MAX，
 *   不超过 HARD_MAX；绝不出现「保留 inference 丢掉 basedOn」）；
 * - 选中维度内的关键 UNKNOWN（如历史估值）优先于同层级的普通 fact 进入；
 * - 去重（同一 evidenceId 只出现一次）。
 */
export function buildSynthesisEvidencePack(
  fullEvidence: Evidence[],
  plan: PlannerResult,
  policy: PackingPolicy = PACKING_POLICY[plan.intent] ?? PACKING_POLICY.overall_diagnosis,
): EvidencePack {
  const byId = new Map(fullEvidence.map((e) => [e.evidenceId, e] as const))
  const index = new Map(fullEvidence.map((e, i) => [e.evidenceId, i] as const))
  const primary = new Set<EvidenceDimension>(plan.dimensions)
  const optional = new Set<EvidenceDimension>(plan.optionalDimensions)
  const preferred = new Set<EvidenceDimension>(policy.preferredDimensions)

  const sorted = [...fullEvidence].sort((a, b) => compareEvidence(a, b, { primary, optional, preferred, index }))

  const picked: Evidence[] = []
  const pickedIds = new Set<string>()
  const perDimension = new Map<EvidenceDimension, number>()
  const closureQueue: string[] = []

  const includeWithClosure = (e: Evidence): boolean => {
    if (pickedIds.has(e.evidenceId)) return true
    // 依赖闭包：inference 的 basedOn 必须先进入（不存在于全量集合的引用跳过，validator 会兜底）
    for (const ref of e.basedOn) {
      const target = byId.get(ref)
      if (target && !pickedIds.has(ref)) {
        pickedIds.add(ref)
        picked.push(target)
        perDimension.set(target.dimension, (perDimension.get(target.dimension) ?? 0) + 1)
        closureQueue.push(ref)
      }
    }
    pickedIds.add(e.evidenceId)
    picked.push(e)
    perDimension.set(e.dimension, (perDimension.get(e.dimension) ?? 0) + 1)
    return true
  }

  // ---- 第一轮：按优先级 + 维度上限入选 ----
  for (const e of sorted) {
    if (picked.length >= policy.maxEvidence) break
    if (pickedIds.has(e.evidenceId)) continue
    const dimCount = perDimension.get(e.dimension) ?? 0
    if (dimCount >= policy.maxPerDimension) continue
    includeWithClosure(e)
  }

  // ---- 第二轮：主维度最低保障（若有证据但一条未入选）----
  for (const dim of primary) {
    if ((perDimension.get(dim) ?? 0) >= SYNTHESIS_EVIDENCE_BUDGET.MIN_PER_PRIMARY_DIMENSION) continue
    const candidate = sorted.find((e) => e.dimension === dim && !pickedIds.has(e.evidenceId))
    if (candidate && picked.length < SYNTHESIS_EVIDENCE_BUDGET.HARD_MAX) {
      includeWithClosure(candidate)
    }
  }

  // ---- 第三轮：被选中 inference 的依赖闭包补齐（若第一轮后仍有遗漏，硬上限内补）----
  for (const e of [...picked]) {
    if (e.type !== "inference") continue
    for (const ref of e.basedOn) {
      if (pickedIds.has(ref)) continue
      const target = byId.get(ref)
      if (target && picked.length < SYNTHESIS_EVIDENCE_BUDGET.HARD_MAX) {
        pickedIds.add(ref)
        picked.push(target)
        perDimension.set(target.dimension, (perDimension.get(target.dimension) ?? 0) + 1)
      }
    }
  }

  const byDimension: Partial<Record<EvidenceDimension, number>> = {}
  for (const e of picked) {
    byDimension[e.dimension] = (byDimension[e.dimension] ?? 0) + 1
  }

  return {
    synthesisEvidence: picked,
    byDimension,
    closureAdded: picked.filter((e) => closureQueue.includes(e.evidenceId)).length,
  }
}

/** 传给 LLM 的紧凑证据结构（Task 09 §17–19）：不含 sourceFields / 内部理由等 */
export interface CompactEvidenceForLLM {
  evidenceId: string
  dimension: string
  type: string
  signal: string
  title: string
  statement: string
  basedOn: string[]
  period?: string
  comparisonPeriod?: string
}

export function toCompactEvidence(e: Evidence): CompactEvidenceForLLM {
  return {
    evidenceId: e.evidenceId,
    dimension: e.dimension,
    type: e.type,
    signal: e.signal,
    title: e.title,
    statement: e.statement,
    basedOn: e.basedOn,
    ...(e.period ? { period: e.period } : {}),
    ...(e.comparisonPeriod ? { comparisonPeriod: e.comparisonPeriod } : {}),
  }
}
