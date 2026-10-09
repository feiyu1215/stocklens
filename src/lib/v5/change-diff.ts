// 变化差分（M1 · 2026-10-10）
//
// 纪律（来自交叉评审，三条硬口径）：
// 1. 变化**只从结构化数据算**（MetricResult.value / period），
//    绝不拿 AI 生成的 statement 文本当变化依据——statement 差异只用于关联"哪些结论受影响"。
// 2. 纵向可比性沿用对比页同一套判据（compare.ts buildRow）：
//    同 period 且有值 → 可比，才允许算差额；period 不同 → 只报"报告期切换"，不算差；
//    任一方不可用/缺失 → 不推导。
// 3. 变化有分类、有依据、有下一步动作；舍入级波动、跨期不可比、缺失补齐一律不算"经营变化"。
//
// 纯函数：不碰存储、不碰网络、可单测。

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import type { MetricResult } from "@/lib/metrics/types"
import { COMPARE_CATALOG, type CompareGroup } from "@/lib/v5/compare"

/** 变化类型：数值变化 / 报告期变化 / 证据变化（结论需重新核验由 claimRecheckIds 表达） */
export type ChangeKind = "value" | "period" | "evidence"

export interface ChangeItem {
  kind: ChangeKind
  metricId: string
  name: string
  group: CompareGroup
  /** 口径备注（与对比页同一份 COMPARE_CATALOG） */
  note: string
  unit: string
  periodFrom: string | null
  periodTo: string | null
  valueFrom: number | null
  valueTo: number | null
  /** 仅 kind="value"：% 单位为百分点差，其余为相对变化率（0.12 = +12%） */
  delta: number | null
  deltaText: string | null
  evidenceId: string
  /** 受影响的结论（其依赖证据已变），需要重新核验 */
  claimIds: string[]
  /** 依据说明——用户看到的"变化有依据"就来自这句 */
  basis: string
  /** 解释护栏（低基数 / 正负切换 / 极端变化）：有值时不得按普通数值变化呈现 */
  guarded?: string
}

export interface ChangeSet {
  items: ChangeItem[]
  /** 需要重新核验的结论（不宣布结论反转） */
  claimRecheckIds: string[]
  /** 是否存在值得记录的变化（决定是否落盘快照） */
  hasQualifiedChange: boolean
  comparedAt: number
}

// ---- 阈值（2026-10-10 复核后收紧，见 §阈值复核）----
//
// 复核改动一：**% 类不再一刀切**。
//   COMPARE_CATALOG 里 unit="%" 的指标包含两种波动性完全不同的东西：
//   - growth 组（营收/净利润/经营现金流同比）：增速本身波动大，0.5pct 太敏感，容易把噪声当变化；
//   - profitability 组（毛利率/净利率/ROE）：水平值，季度间变 0.5pct 已经值得看，保持 0.5pct。
// 复核改动二：**相对变化率必须有"基数护栏"**。
//   倍数类（经营现金流/净利润）与估值类在**分母趋近 0**（微利、亏损边缘）时相对变化率会爆炸
//   （0.01 → 0.05 就是 +400%），这在语义上不是"经营变化"，是算术假象。
//   处理方式：不静默丢弃（那会漏掉真实修正），而是降级为 guarded（标"需核验"）并改报绝对差。
export const PCT_POINT_THRESHOLD = 0.5 // 水平比率（毛利率/净利率/ROE）
export const GROWTH_PCT_POINT_THRESHOLD = 1.0 // 同比增速（营收/净利润/现金流同比）
export const RELATIVE_THRESHOLD = 0.05 // 其余量纲相对变化
export const VALUATION_RELATIVE_THRESHOLD = 0.1 // 估值派生自价格
/** 相对变化率的基数下限：|基准值| 低于此值时，相对变化率不可解读 */
export const RELATIVE_BASELINE_MIN = 0.05

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

function formatDelta(
  metric: MetricResult,
  group: CompareGroup,
  from: number,
  to: number,
): { delta: number; text: string; guarded?: string } {
  if (metric.unit === "%") {
    const delta = to - from
    return { delta, text: `${delta >= 0 ? "增加" : "减少"} ${Math.abs(delta).toFixed(2)} 个百分点` }
  }
  const nearZeroBase = Math.abs(from) < RELATIVE_BASELINE_MIN
  const delta = from === 0 ? Number.NaN : (to - from) / Math.abs(from)
  if (nearZeroBase) {
    // 基数趋零：改报绝对差，并明确"相对变化率不可解读"
    return {
      delta: Number.isFinite(delta) ? delta : Number.NaN,
      text: `由 ${from.toFixed(2)} 变为 ${to.toFixed(2)}${metric.unit}（绝对差 ${(to - from).toFixed(2)}）`,
      guarded: `基准值 ${from.toFixed(2)}${metric.unit} 接近零，相对变化率不可解读——已改报绝对差，需人工核验`,
    }
  }
  if (!Number.isFinite(delta)) {
    return { delta: Number.NaN, text: "基数不可计算相对变化" }
  }
  return { delta, text: `${delta >= 0 ? "上升" : "下降"} ${(Math.abs(delta) * 100).toFixed(1)}%` }
}

function passesThreshold(metric: MetricResult, group: CompareGroup, delta: number): boolean {
  if (!Number.isFinite(delta)) return false
  if (metric.unit === "%") {
    return Math.abs(delta) >= (group === "growth" ? GROWTH_PCT_POINT_THRESHOLD : PCT_POINT_THRESHOLD)
  }
  return Math.abs(delta) >= (group === "valuation" ? VALUATION_RELATIVE_THRESHOLD : RELATIVE_THRESHOLD)
}

/**
 * 上一次有效研究 vs 本次更新后的研究，产出分类变化清单。
 * 传入的 payload 必须是**同一家公司**；不匹配时返回空集合（不猜）。
 */
export function diffPayloads(
  prev: ResearchSpacePayload,
  next: ResearchSpacePayload,
  now = Date.now(),
): ChangeSet {
  if (prev?.company?.stockCode !== next?.company?.stockCode) {
    return { items: [], claimRecheckIds: [], hasQualifiedChange: false, comparedAt: now }
  }

  const prevMetrics = new Map<string, MetricResult>((prev.metrics ?? []).map((m) => [m.metricId, m]))
  const prevEvidence = new Map((prev.evidence ?? []).map((e) => [e.evidenceId, e]))
  const nextEvidence = new Map((next.evidence ?? []).map((e) => [e.evidenceId, e]))

  const items: ChangeItem[] = []
  const touchedEvidenceIds = new Set<string>()

  for (const def of COMPARE_CATALOG) {
    const before = prevMetrics.get(def.metricId)
    const after = (next.metrics ?? []).find((m) => m.metricId === def.metricId)
    if (!before || !after) continue

    const evidenceId = `EV_FACT_${def.metricId}`
    const prevEv = prevEvidence.get(evidenceId)
    const nextEv = nextEvidence.get(evidenceId)

    const aOk = before.status === "available" && isNum(before.value)
    const bOk = after.status === "available" && isNum(after.value)

    // 任一方不可用：不推导（缺失 / 补齐属于另一类提醒，不计入变化）
    if (!aOk || !bOk) continue

    const from = before.value as number
    const to = after.value as number

    // 报告期切换：口径可能不同，只报切换、不算差额
    if (before.period && after.period && before.period !== after.period) {
      items.push({
        kind: "period",
        metricId: def.metricId,
        name: def.name,
        group: def.group,
        note: def.note,
        unit: after.unit,
        periodFrom: before.period ?? null,
        periodTo: after.period ?? null,
        valueFrom: from,
        valueTo: to,
        delta: null,
        deltaText: null,
        evidenceId,
        claimIds: [],
        basis: `报告期由 ${before.period} 切换为 ${after.period}，跨期口径不同，不直接计算差额`,
      })
      touchedEvidenceIds.add(evidenceId)
      continue
    }

    // 同口径：核心指标未变 → 只看证据是否更新
    if (from === to) {
      const statementChanged = prevEv?.statement !== nextEv?.statement
      const sourceChanged =
        JSON.stringify(prevEv?.sourceFields ?? []) !== JSON.stringify(nextEv?.sourceFields ?? [])
      const freshnessChanged = prevEv?.freshness?.retrievedAt !== nextEv?.freshness?.retrievedAt
      if (statementChanged || sourceChanged || freshnessChanged) {
        items.push({
          kind: "evidence",
          metricId: def.metricId,
          name: def.name,
          group: def.group,
          note: def.note,
          unit: after.unit,
          periodFrom: before.period ?? null,
          periodTo: after.period ?? null,
          valueFrom: from,
          valueTo: to,
          delta: null,
          deltaText: null,
          evidenceId,
          claimIds: [],
          basis: "核心指标未变，证据来源或记录已更新——仅标注证据更新，不表述为经营变化",
        })
        touchedEvidenceIds.add(evidenceId)
      }
      continue
    }

    // 同口径且数值变了：先过阈值，再过解释护栏；基数趋零时 delta 为 NaN 也要出（不可解读 ≠ 无变化）
    const { delta, text, guarded: baseGuarded } = formatDelta(before, def.group, from, to)
    const nearZero = Math.abs(from) < RELATIVE_BASELINE_MIN && after.unit !== "%"
    if (!nearZero && !passesThreshold(before, def.group, delta)) continue

    const flags = [...(after.interpretationFlags ?? []), ...(before.interpretationFlags ?? [])]
    const guarded =
      baseGuarded ??
      (flags.length > 0
        ? `该指标带解释护栏（${[...new Set(flags)].join(" / ")}），变化幅度不可直接解读为经营变化`
        : undefined)

    items.push({
      kind: "value",
      metricId: def.metricId,
      name: def.name,
      group: def.group,
      note: def.note,
      unit: after.unit,
      periodFrom: before.period ?? null,
      periodTo: after.period ?? null,
      valueFrom: from,
      valueTo: to,
      delta,
      deltaText: text,
      evidenceId,
      claimIds: [],
      basis: guarded ? guarded : `报告期与统计口径一致（${after.period ?? "—"}），经阈值规则确认达到展示标准`,
      ...(guarded ? { guarded } : {}),
    })
    touchedEvidenceIds.add(evidenceId)
  }

  // 受影响的结论：claim 依赖的证据命中上述任一类 → 需重新核验（不宣布结论反转）
  const claimRecheckIds: string[] = []
  for (const claim of next.claims ?? []) {
    if (claim.evidenceIds?.some((id) => touchedEvidenceIds.has(id))) claimRecheckIds.push(claim.claimId)
  }
  for (const item of items) {
    item.claimIds = (next.claims ?? [])
      .filter((c) => c.evidenceIds?.includes(item.evidenceId))
      .map((c) => c.claimId)
  }

  return {
    items,
    claimRecheckIds: [...new Set(claimRecheckIds)],
    hasQualifiedChange: items.length > 0,
    comparedAt: now,
  }
}

/** 展示层用：把变化类型翻成中文标签 */
export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  value: "数值变化",
  period: "报告期变化",
  evidence: "证据变化",
}
