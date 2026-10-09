// 条件性判断层（M4 · 2026-10-10）
//
// 三层划分（交叉评审采纳）：
//   事实        —— 毛利率 25% → 23%                      已有，直接展示
//   条件性判断  —— 按预设阈值与适用边界触发的「关注信号」  **本文件只做这一层**
//   综合评价    —— "盈利质量差""估值昂贵"                  **不做**
//
// 四条硬纪律：
// 1. 确定性规则保证的是**判定过程可复现**，不保证**判定标准合理**——
//    所以每条判断必须同时给出 threshold（阈值）与 boundary（适用边界/失效条件），
//    让使用者能判断"这条判断对我面前的公司是否成立"，而不是只能选择信或不信。
// 2. 起步信号只选**同一报告期内的关系型信号**（两个来自同一报告期的数字 + 一个阈值），
//    不选"估值偏贵"——那需要行业 / 盈利阶段基准，判定标准立不住。
// 3. **不重复证据层已有的规则**。收入同比 − 利润同比的背离已由
//    RULE_FIN_PROFIT_GROWTH_LAGS_REVENUE（阈值 1.0pct）+ RULE_FIN_REVENUE_PROFIT_DIVERGENCE
//    （收入增、利润降）覆盖，本层不再重建同义规则——重复触发等于噪音。
// 4. **未触发也必须可核验**：每条规则都要说明"为什么没触发"（实际数字 + 阈值 + 原因），
//    而不是静默消失。判定层沉默时，使用者至少要能确认"它跑过了"。
//
// 纯函数：不碰存储、不碰模型、可单测。

import type { MetricResult } from "@/lib/metrics/types"

export type JudgmentId = "cashflow_profit_mismatch" | "growth_deceleration"

export interface JudgmentResult {
  id: JudgmentId
  name: string
  /** 层级恒为 conditional——本模块不做综合评价 */
  level: "conditional"
  /** 触发的是「关注信号」，不是好坏结论 */
  signal: "watch"
  statement: string
  /** 判定依据：参与的数字 + 阈值 + 报告期，缺一不可 */
  basis: string
  /** 适用边界 / 失效条件 */
  boundary: string
  metricIds: string[]
  /** 循 compare.ts 的约定：FACT 证据 ID = EV_FACT_${metricId} */
  evidenceIds: string[]
}

/** 一条规则被检查过的结果：触发则带 judgment，未触发带 reason */
export interface CheckedRule {
  id: JudgmentId
  name: string
  fired: boolean
  /** 该规则的判定标准（阈值原文） */
  threshold: string
  /** 未触发原因；触发时为 null */
  reason: string | null
  judgment: JudgmentResult | null
}

export interface JudgmentReport {
  fired: JudgmentResult[]
  checked: CheckedRule[]
}

/** 经营现金流 / 净利润 < 该倍数 → 触发（草案阈值，可调） */
export const CFO_TO_PROFIT_MIN = 0.8
/** 累计同比 − 单季同比 ≥ 该百分点 → 触发（草案阈值，可调） */
export const DECELERATION_PCT_THRESHOLD = 10

const num = (m: MetricResult | undefined): number | null =>
  m && m.status === "available" && typeof m.value === "number" && Number.isFinite(m.value) ? m.value : null

const hasGuard = (m: MetricResult | undefined): boolean =>
  !!m && Array.isArray(m.interpretationFlags) && m.interpretationFlags.length > 0

const guardText = (m: MetricResult | undefined): string =>
  m?.interpretationFlags?.join("、") ?? ""

const pct = (v: number) => `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(2)}%`
const pctPoint = (v: number) => `${Math.abs(v).toFixed(2)} 个百分点`

const missing = (metricId: string): CheckedRule["reason"] =>
  `未触发：缺少可用指标 ${metricId}（当前不可计算）`

type RuleOutcome = { judgment: JudgmentResult | null; reason: string | null }

/**
 * 规则一：利润的现金含量（经营现金流 / 净利润）。
 * 同一报告期累计口径的倍数关系，不需要行业基准，判定标准最容易立住。
 */
const cashflowProfitMismatch = (byId: Map<string, MetricResult>): RuleOutcome => {
  const id: JudgmentId = "cashflow_profit_mismatch"
  const name = "利润的现金含量偏低"
  const threshold = `经营现金流 / 净利润 < ${CFO_TO_PROFIT_MIN} 倍（且为正值）`
  const metricId = "FIN_CFO_TO_NET_PROFIT_YTD"
  const ratioMetric = byId.get(metricId)
  const ratio = num(ratioMetric)
  if (ratio === null) return { judgment: null, reason: missing(metricId) }
  if (hasGuard(ratioMetric)) {
    return {
      judgment: null,
      reason: `未触发：该指标带解释护栏（${guardText(ratioMetric)}），按适用边界不判定`,
    }
  }
  if (ratio <= 0) {
    return {
      judgment: null,
      reason: `未触发：倍数为 ${ratio.toFixed(2)}（净利润或经营现金流为负），倍数关系不适用`,
    }
  }
  if (ratio >= CFO_TO_PROFIT_MIN) {
    return {
      judgment: null,
      reason: `未触发：经营现金流 / 净利润 = ${ratio.toFixed(2)} 倍，未低于阈值 ${CFO_TO_PROFIT_MIN}`,
    }
  }
  return {
    judgment: {
      id,
      name,
      level: "conditional",
      signal: "watch",
      statement: `经营现金流 / 净利润 = ${ratio.toFixed(2)} 倍（低于 ${CFO_TO_PROFIT_MIN}）：当期利润对应的经营现金流入偏低，建议核对应收与存货变化。`,
      basis: `依据：${metricId}=${ratio.toFixed(2)}（报告期 ${ratioMetric?.period ?? "—"}，累计口径）；阈值：${threshold}。`,
      boundary:
        "适用边界：仅适用于净利润为正、经营现金流为正的同一报告期累计口径；季度间回款节奏、预收与应收波动都会让单期倍数失真，跨期不可直接比较。它只说明两列数字的倍数关系，不评价盈利质量优劣。",
      metricIds: [metricId],
      evidenceIds: [`EV_FACT_${metricId}`],
    },
    reason: null,
  }
}

/**
 * 规则二：最近单季增速较累计增速明显放缓。
 * 现有证据层只判「单季与累计方向相反」（异号），不判同向下的幅度衰减——
 * 这里补的是幅度，不是同义重复。
 */
const growthDeceleration = (byId: Map<string, MetricResult>): RuleOutcome => {
  const id: JudgmentId = "growth_deceleration"
  const name = "最近单季增速较累计增速明显放缓"
  const threshold = `累计同比 − 单季同比 ≥ ${DECELERATION_PCT_THRESHOLD} 个百分点（两者均为正）`
  const ytdId = "FIN_REVENUE_YOY_YTD"
  const qId = "FIN_REVENUE_YOY_QUARTER"
  const ytdMetric = byId.get(ytdId)
  const qMetric = byId.get(qId)
  const ytd = num(ytdMetric)
  const q = num(qMetric)
  if (ytd === null) return { judgment: null, reason: missing(ytdId) }
  if (q === null) return { judgment: null, reason: missing(qId) }
  if (ytdMetric?.period && qMetric?.period && ytdMetric.period !== qMetric.period) {
    return { judgment: null, reason: `未触发：两者报告期不同（${ytdMetric.period} vs ${qMetric.period}），不可比较` }
  }
  if (hasGuard(ytdMetric) || hasGuard(qMetric)) {
    return {
      judgment: null,
      reason: `未触发：指标带解释护栏（${guardText(ytdMetric) || guardText(qMetric)}），按适用边界不判定`,
    }
  }
  if (ytd <= 0 || q <= 0) {
    return {
      judgment: null,
      reason: `未触发：累计同比 ${pct(ytd)} / 单季同比 ${pct(q)}，两者需同为正才判定放缓`,
    }
  }
  const gap = ytd - q
  if (gap < DECELERATION_PCT_THRESHOLD) {
    return {
      judgment: null,
      reason: `未触发：累计同比 ${pct(ytd)} − 单季同比 ${pct(q)} = ${pctPoint(gap)}，未达阈值 ${DECELERATION_PCT_THRESHOLD} 个百分点`,
    }
  }
  return {
    judgment: {
      id,
      name,
      level: "conditional",
      signal: "watch",
      statement: `累计营收同比 ${pct(ytd)}，最近单季同比 ${pct(q)}——单季较累计低 ${pctPoint(gap)}（阈值 ${DECELERATION_PCT_THRESHOLD}pct）：累计仍在增长，但最近一个季度的同比增速已明显放缓。`,
      basis: `依据：${ytdId}=${pct(ytd)}、${qId}=${pct(q)}（报告期 ${ytdMetric?.period ?? "—"}）；阈值：${threshold}。`,
      boundary:
        "适用边界：仅当两者为同一报告期、且均为正增长时成立；季节性强的公司（白酒的春节档、家电的旺季出货）单季与累计口径不可直接比较，需在同季同比的前提下看。它只说明增速衰减，不预测后续。",
      metricIds: [ytdId, qId],
      evidenceIds: [`EV_FACT_${ytdId}`, `EV_FACT_${qId}`],
    },
    reason: null,
  }
}

interface RuleDef {
  id: JudgmentId
  name: string
  threshold: string
  run: (byId: Map<string, MetricResult>) => RuleOutcome
}

const RULES: RuleDef[] = [
  {
    id: "cashflow_profit_mismatch",
    name: "利润的现金含量偏低",
    threshold: `经营现金流 / 净利润 < ${CFO_TO_PROFIT_MIN} 倍（且为正值）`,
    run: cashflowProfitMismatch,
  },
  {
    id: "growth_deceleration",
    name: "最近单季增速较累计增速明显放缓",
    threshold: `累计同比 − 单季同比 ≥ ${DECELERATION_PCT_THRESHOLD} 个百分点（两者均为正）`,
    run: growthDeceleration,
  },
]

/** 指标列表 → 按 metricId 建索引；同一 ID 保留第一条，避免后值静默覆盖 */
function indexMetrics(metrics: MetricResult[] | undefined): Map<string, MetricResult> {
  const byId = new Map<string, MetricResult>()
  if (!Array.isArray(metrics)) return byId
  for (const m of metrics) {
    if (!m?.metricId) continue
    if (!byId.has(m.metricId)) byId.set(m.metricId, m)
  }
  return byId
}

/** 对一次研究的指标做条件性判断，返回**已触发**的判断（未触发不出现，避免噪音） */
export function evaluateJudgments(metrics: MetricResult[] | undefined): JudgmentResult[] {
  return evaluateJudgmentReport(metrics).fired
}

/** 同上，但附带每条规则的检查痕迹（含未触发原因）——UI 用它来做"判定层跑过了"的可核验展示 */
export function evaluateJudgmentReport(metrics: MetricResult[] | undefined): JudgmentReport {
  const byId = indexMetrics(metrics)
  const fired: JudgmentResult[] = []
  const checked: CheckedRule[] = []
  for (const rule of RULES) {
    const { judgment, reason } = rule.run(byId)
    if (judgment) fired.push(judgment)
    checked.push({
      id: rule.id,
      name: rule.name,
      threshold: rule.threshold,
      fired: !!judgment,
      reason: judgment ? null : (reason ?? "未触发"),
      judgment,
    })
  }
  return { fired, checked }
}
