import type { PlannerResult } from "@/lib/ai/types"
import type { Evidence, EvidenceDimension } from "@/lib/evidence/types"
import { buildDimensionViews, type DimensionView } from "./dimension-view"

// Question-first Research View（Task 11）：
// 把「用户问题 → 首先该看什么 → 为什么 → 证据 → 还不能确认 → 下一步」的信息层级
// 变成确定性输出。纯函数，不调用模型，不筛选/篡改证据本身的内容。

export const MAX_ATTENTION = 4
export const MAX_UNKNOWN_SPOTLIGHT = 3
export const MAX_NEXT_QUESTIONS = 3

export interface ResearchView {
  /** A. 当前回答：AI summary 实际引用的证据（用于「查看依据」） */
  answerEvidence: Evidence[]
  /** B. 值得关注：≤4 条（conflict 优先；有 negative 时至少保留一条） */
  attentionEvidence: Evidence[]
  /** C. 尚待验证：≤3 条 UNKNOWN（研究边界，不是负面证据） */
  unknownEvidence: Evidence[]
  /** 主维度（Planner 选定；UI 默认展开） */
  primaryDimensions: DimensionView[]
  /** 次维度（其余有证据的维度；UI 默认折叠） */
  secondaryDimensions: DimensionView[]
  /** 是否建议在二级区展示财务趋势（growth/profitability/cashflow 相关时） */
  showTrend: boolean
  /** 继续研究：≤3 条，来自 synthesis.nextQuestions（过滤明显不可回答的） */
  nextQuestions: string[]
}

function attentionTier(e: Evidence): number {
  if (e.type === "inference" && e.signal === "conflict") return 0
  if (e.type === "fact" && e.signal === "negative") return 1
  if (e.type === "fact" && e.signal === "positive") return 2
  if (e.type === "inference") return 3 // 中性但可解释的推断
  return 4 // 中性事实
}

/** UNKNOWN 首屏排序：越靠近「研究边界」的越靠前（估值历史位置、新闻覆盖、同行财务…） */
function unknownSpotlightRank(e: Evidence): number {
  const id = e.evidenceId
  if (id.includes("VAL_HISTORICAL_PERCENTILE")) return 0
  if (id.includes("NEWS_DISCLOSURE")) return 1
  if (id.includes("ANOMALY_COVERAGE") || id.includes("ANOMALY_UNAVAILABLE")) return 2
  if (id.includes("INDUSTRY_PEER") || id.includes("INDUSTRY_VALUATION")) return 3
  return 5
}

/** 明显无法回答的 nextQuestion 过滤（避免推荐系统没有数据能力的方向） */
const NON_ANSWERABLE_PATTERNS = [
  /公告/,
  /新闻/,
  /研报/,
  /分析师/,
  /机构调研/,
  /传闻/,
  /消息面/,
  /业绩预告/,
  /电话会议/,
]

export function buildResearchView(input: {
  planner: PlannerResult | null | undefined
  synthesis: { summary: { evidenceIds: string[] }; nextQuestions: string[] } | null | undefined
  fullEvidence: Evidence[]
}): ResearchView {
  const { planner, synthesis, fullEvidence } = input
  const byId = new Map(fullEvidence.map((e) => [e.evidenceId, e] as const))

  // A. 当前回答的依据
  const answerEvidence = (synthesis?.summary.evidenceIds ?? [])
    .map((id) => byId.get(id))
    .filter((e): e is Evidence => Boolean(e))

  // B. 值得关注（不含 UNKNOWN；UNKNOWN 单独成区）
  const candidates = fullEvidence
    .filter((e) => e.type !== "unknown")
    .slice()
    .sort((a, b) => {
      const t = attentionTier(a) - attentionTier(b)
      if (t !== 0) return t
      const ai = fullEvidence.indexOf(a)
      const bi = fullEvidence.indexOf(b)
      return ai - bi
    })

  const attention: Evidence[] = []
  const pushIfRoom = (e: Evidence) => {
    if (attention.length < MAX_ATTENTION && !attention.some((x) => x.evidenceId === e.evidenceId)) {
      attention.push(e)
    }
  }
  // 规则：真实 conflict 至少 1 条；有 negative 时至少 1 条
  const firstConflict = candidates.find((e) => e.type === "inference" && e.signal === "conflict")
  if (firstConflict) pushIfRoom(firstConflict)
  const firstNegative = candidates.find((e) => e.type === "fact" && e.signal === "negative")
  if (firstNegative) pushIfRoom(firstNegative)
  for (const e of candidates) pushIfRoom(e)

  // C. 尚待验证（UNKNOWN 单独呈现）
  const unknowns = fullEvidence
    .filter((e) => e.type === "unknown")
    .slice()
    .sort((a, b) => unknownSpotlightRank(a) - unknownSpotlightRank(b))

  // 维度主/次（primary = Planner 选定）
  const allDimensionViews = buildDimensionViews(fullEvidence)
  const primarySet = new Set<EvidenceDimension>(planner?.dimensions ?? [])
  const primaryDimensions = allDimensionViews.filter(
    (v) => v.hasEvidence && primarySet.has(v.dimension),
  )
  const secondaryDimensions = allDimensionViews.filter(
    (v) => v.hasEvidence && !primarySet.has(v.dimension),
  )

  // 趋势展示相关性
  const trendDims: EvidenceDimension[] = ["growth", "profitability", "cashflow"]
  const selected = new Set<EvidenceDimension>([
    ...(planner?.dimensions ?? []),
    ...(planner?.optionalDimensions ?? []),
  ])
  const showTrend = trendDims.some((d) => selected.has(d))

  // 继续研究：≤3，过滤明显不可回答的方向
  const nextQuestions = (synthesis?.nextQuestions ?? [])
    .filter((q) => !NON_ANSWERABLE_PATTERNS.some((p) => p.test(q)))
    .slice(0, MAX_NEXT_QUESTIONS)
  // 如果过滤后为空但有原始问题，保留一条（宁可展示，也不隐藏）
  if (nextQuestions.length === 0 && (synthesis?.nextQuestions?.length ?? 0) > 0) {
    nextQuestions.push(synthesis!.nextQuestions[0])
  }

  return {
    answerEvidence,
    attentionEvidence: attention.slice(0, MAX_ATTENTION),
    unknownEvidence: unknowns.slice(0, MAX_UNKNOWN_SPOTLIGHT),
    primaryDimensions,
    secondaryDimensions,
    showTrend,
    nextQuestions,
  }
}
