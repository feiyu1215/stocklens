import type { Evidence } from "@/lib/evidence/types"
import type { CapabilityKey } from "./capability"
import type { ResearchClaim } from "./claims"
import type { ResearchDimension } from "./dimension-schema"

// Research Space Composer（Task 12 §26/§33–§34）：
// 一次 LLM 调用（不是每个维度一次）生成 space overview + 每个维度的 claims。
// 输入是「每个维度各自打包的紧凑证据」（Per-Dimension Pack），总预算受控。

export const COMPOSER_PROMPT_VERSION = "research_composer_v1"

/** 每个维度的证据包上限（Task 12 §30：4–8 条） */
export const PER_DIMENSION_PACK = { MIN: 4, MAX: 8 } as const
/** 送入 Composer 的总证据预算（§34：不要重新出现 40+ 全部送模型） */
export const COMPOSER_TOTAL_BUDGET = 32

export interface DimensionPack {
  dimension: ResearchDimension
  evidence: Evidence[]
}

/** 把证据按 capability 匹配结果打包到维度（§29–§30） */
export function buildDimensionPack(
  dimension: ResearchDimension,
  matched: Evidence[],
  maxPerDimension = PER_DIMENSION_PACK.MAX,
): DimensionPack {
  // 确定性优先级：conflict inference → inference → unknown → negative → positive → neutral
  function tier(e: Evidence): number {
    if (e.type === "inference" && e.signal === "conflict") return 0
    if (e.type === "inference") return 1
    if (e.type === "unknown") return 2
    if (e.type === "fact" && e.signal === "negative") return 3
    if (e.type === "fact" && e.signal === "positive") return 4
    return 5
  }
  const sorted = [...matched].sort((a, b) => {
    const t = tier(a) - tier(b)
    if (t !== 0) return t
    return a.evidenceId.localeCompare(b.evidenceId)
  })
  const evidence = sorted.slice(0, maxPerDimension)
  return {
    dimension: { ...dimension, evidenceIds: evidence.map((e) => e.evidenceId) },
    evidence,
  }
}

/** 总预算收紧：依次裁剪各维度尾部，直到总量 ≤ 预算（保留每个维度至少 MIN 条） */
export function applyTotalBudget(packs: DimensionPack[], budget = COMPOSER_TOTAL_BUDGET): DimensionPack[] {
  let total = packs.reduce((sum, p) => sum + p.evidence.length, 0)
  if (total <= budget) return packs
  const result = packs.map((p) => ({ ...p, evidence: [...p.evidence] }))
  // 从证据最多的维度开始裁剪
  while (total > budget) {
    const target = result
      .filter((p) => p.evidence.length > PER_DIMENSION_PACK.MIN)
      .sort((a, b) => b.evidence.length - a.evidence.length)[0]
    if (!target) break
    target.evidence.pop()
    total -= 1
  }
  return result.map((p) => ({ ...p, dimension: { ...p.dimension, evidenceIds: p.evidence.map((e) => e.evidenceId) } }))
}

export function buildComposerSystemPrompt(): string {
  return [
    "你是 StockLens 的 Research Space Composer。输入是：公司身份、研究框架（AI 已设计的维度）以及每个维度各自的紧凑证据包。",
    "",
    "你的唯一职责：为每个维度写 claim（可核查的论断），并给出整个研究空间的概述。",
    "",
    "硬性约束（违反任一将被系统拒绝）：",
    "1. 每条 claim 必须绑定该维度证据包内的 evidenceId（绝不能引用其他维度或编造的 ID）。",
    "2. claim.type 规则：fact → 只引用 type=fact 的证据；inference → 至少 1 条 type=inference 的证据；unknown → 只引用 type=unknown 的证据（若该维度没有证据，可写 unknown claim 且 evidenceIds 为空）。",
    "3. signal 只表示该论断的方向（positive/negative/conflict/neutral/unknown），不是股票评级。",
    "4. 不得编造事实、数字或数据能力；不得评价股票好坏；不得给买卖建议、目标价或涨跌预测。",
    "5. 若证据带 interpretationNote（同比解释护栏），必须保留该限制，不得仅凭极端百分比推断同等幅度的经营恶化。",
    "6. 每个维度 2–5 条 claims，按重要性排序。",
    "7. 维度的 status 由系统根据能力可用性判定，你不修改。",
    "",
    "只输出 JSON：",
    '{"overview":"…","dimensions":[{"dimensionId":"…","claims":[{"text":"…","type":"fact|inference|unknown","signal":"positive|negative|conflict|neutral|unknown","evidenceIds":["…"]}]}]}',
  ].join("\n")
}

export function buildComposerUserPrompt(input: {
  company: { stockCode: string; stockName: string; industryName?: string }
  question?: string
  packs: DimensionPack[]
}): string {
  return JSON.stringify({
    company: input.company,
    question: input.question ?? null,
    dimensions: input.packs.map((p) => ({
      dimensionId: p.dimension.dimensionId,
      label: p.dimension.label,
      researchQuestion: p.dimension.researchQuestion,
      status: p.dimension.status,
      evidence: p.evidence.map((e) => ({
        evidenceId: e.evidenceId,
        dimension: e.dimension,
        type: e.type,
        signal: e.signal,
        title: e.title,
        statement: e.statement,
        basedOn: e.basedOn,
        period: e.period ?? null,
        comparisonPeriod: e.comparisonPeriod ?? null,
        ...(e.interpretationNote ? { interpretationNote: e.interpretationNote } : {}),
      })),
    })),
  })
}

export function buildComposerRepairPrompt(previousOutput: string, issues: string[]): string {
  return [
    "你上一次的输出未通过校验：",
    ...issues.map((i) => `- ${i}`),
    "",
    "上一次输出：",
    previousOutput,
    "",
    "请重新输出完全符合要求的 JSON（只输出 JSON）。牢记：claim 只能引用其所在维度证据包中的 evidenceId，类型必须匹配证据类型。",
  ].join("\n")
}

export interface ComposerOutput {
  overview: string
  dimensions: { dimensionId: string; claims: { text: string; type: string; signal: string; evidenceIds: string[] }[] }[]
}

export function parseComposerShape(parsed: unknown): { ok: true; output: ComposerOutput } | { ok: false; issues: string[] } {
  if (typeof parsed !== "object" || parsed === null) return { ok: false, issues: ["输出必须是 JSON 对象"] }
  const obj = parsed as Record<string, unknown>
  const issues: string[] = []
  if (typeof obj.overview !== "string" || obj.overview.trim().length === 0) issues.push("overview 必须是非空字符串")
  if (!Array.isArray(obj.dimensions)) {
    issues.push("dimensions 必须是数组")
  } else {
    obj.dimensions.forEach((d, i) => {
      if (typeof d !== "object" || d === null) {
        issues.push(`dimensions[${i}] 不是对象`)
        return
      }
      const dim = d as Record<string, unknown>
      if (typeof dim.dimensionId !== "string") issues.push(`dimensions[${i}].dimensionId 缺失`)
      if (!Array.isArray(dim.claims)) issues.push(`dimensions[${i}].claims 必须是数组`)
      else if (dim.claims.length === 0 || dim.claims.length > 5) issues.push(`dimensions[${i}].claims 数量必须为 1–5`)
    })
  }
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, output: obj as unknown as ComposerOutput }
}

export type { CapabilityKey, ResearchClaim }
