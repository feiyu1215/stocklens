// 研究笔记导出（打印版）—— 数据构建纯函数（阶段 3 / P2-2）
//
// 纪律（Evidence first，缺一项宁可不做导出）：
// - 纸面文档比界面更像"确定性研报"，所以必须强制带齐：
//   ① 研究级 retrievedAt 与行情数据 dataAsOf；② 每条证据的 freshness（status/dataAsOf/reason）
//      与 statement 原文（stale 限定语直接拼在 statement 末尾，原样带出，绝不截断）；
//   ③ UNKNOWN 分区恒存在，保留 unavailableReason；④ spaceId 与导出时间；
//   ⑤ 明确的「不构成投资建议」。
// - 不复用画布 DOM / ReadingV3 渲染，直接从 payload 数据构建。
// - ai 部分失败或数据错误必须如实带出，不做修饰。

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import type { Evidence } from "@/lib/evidence/types"

export const NOTES_DISCLAIMER = "本笔记由 StockLens 自动整理，仅基于标注来源的数据，不构成投资建议。"

export interface NotesMeta {
  spaceId: string
  companyName: string
  stockCode: string
  industryName?: string
  entryQuestion?: string
  /** 证据新鲜度里的最晚取回时间；全部缺失时为 null（如实显示"未记录"） */
  retrievedAt: string | null
  /** 行情数据截至日期（marketHistory.latestDate）；缺失为 null */
  marketDataAsOf: string | null
  exportedAt: string
  aiStatus: "success" | "partial_failure" | "failed"
  aiIssues: string[]
  errors: { domain: string; message: string }[]
}

export interface NotesMetricRef {
  metricId: string
  name: string
  valueLabel: string
  period?: string
  calculationMethod: string
  sourceFields: string[]
  unavailableReason?: string
}

export interface NotesEvidenceLine {
  evidenceId: string
  title: string
  /** statement 原文，绝不截断、绝不改写（stale 限定语在原文末尾） */
  statement: string
  type: Evidence["type"]
  signal: Evidence["signal"]
  verifyStatus: Evidence["verifyStatus"]
  freshnessStatus: "fresh" | "stale" | "unknown" | null
  freshnessDataAsOf: string | null
  freshnessReason: string | null
  unavailableReason?: string
  metrics: NotesMetricRef[]
}

export interface NotesClaimLine {
  claimId: string
  text: string
  type: "fact" | "inference" | "unknown"
  signal: "positive" | "negative" | "conflict" | "neutral" | "unknown"
  evidenceIds: string[]
}

export interface NotesSection {
  dimensionId: string
  label: string
  researchQuestion: string
  /** 维度声明的缺失信息（Evidence first：纸面上也要可见"没研究到什么"） */
  missingInformation: string[]
  claims: NotesClaimLine[]
  evidence: NotesEvidenceLine[]
}

export interface NotesDocument {
  meta: NotesMeta
  sections: NotesSection[]
  /** 未被任何维度引用的证据（不能静默丢弃；正常为空、字段不出现） */
  unassigned?: NotesEvidenceLine[]
  /** UNKNOWN 证据恒导出；没有时该数组为空，但分区标题仍渲染 */
  unknowns: NotesEvidenceLine[]
  disclaimer: string
}

function valueLabelOf(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "—"
  const num = Math.abs(value) < 100 ? value.toFixed(2) : value.toFixed(0)
  return unit ? `${num}${unit}` : num
}

function sourceFieldLabel(f: { source: string; domain: string; field: string; period?: string; date?: string }): string {
  const when = f.period ?? f.date
  return when ? `${f.source}/${f.domain}/${f.field}（${when}）` : `${f.source}/${f.domain}/${f.field}`
}

function evidenceLine(e: Evidence, payload: ResearchSpacePayload): NotesEvidenceLine {
  const metrics = e.metricIds
    .map((id) => payload.metrics.find((m) => m.metricId === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({
      metricId: m.metricId,
      name: m.name,
      valueLabel: valueLabelOf(m.value, m.unit),
      period: m.period,
      calculationMethod: m.calculationMethod,
      sourceFields: m.sourceFields.map(sourceFieldLabel),
      ...(m.unavailableReason ? { unavailableReason: m.unavailableReason } : {}),
    }))
  return {
    evidenceId: e.evidenceId,
    title: e.title,
    statement: e.statement,
    type: e.type,
    signal: e.signal,
    verifyStatus: e.verifyStatus,
    freshnessStatus: e.freshness?.status ?? null,
    freshnessDataAsOf: e.freshness?.dataAsOf ?? null,
    freshnessReason: e.freshness?.reason ?? null,
    ...(e.unavailableReason ? { unavailableReason: e.unavailableReason } : {}),
    metrics,
  }
}

/**
 * 从 payload 构建打印文档的全部数据。
 * exportedAt 仅在组件打开覆盖层时生成一次，保证同一次导出内时间一致（测试可注入固定值）。
 */
export function buildNotesDocument(payload: ResearchSpacePayload, exportedAt?: string): NotesDocument {
  const retrievedTimes = payload.evidence
    .map((e) => e.freshness?.retrievedAt)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .sort()
  const meta: NotesMeta = {
    spaceId: payload.spaceId,
    companyName: payload.company.stockName,
    stockCode: payload.company.stockCode,
    ...(payload.company.industryName ? { industryName: payload.company.industryName } : {}),
    ...(payload.entryQuestion ? { entryQuestion: payload.entryQuestion } : {}),
    retrievedAt: retrievedTimes.length > 0 ? retrievedTimes[retrievedTimes.length - 1] : null,
    marketDataAsOf: payload.marketHistory?.latestDate ?? null,
    exportedAt: exportedAt ?? new Date().toISOString(),
    aiStatus: payload.ai.status,
    aiIssues: payload.ai.issues ?? [],
    errors: payload.errors,
  }

  const sectionMap = new Map<string, NotesSection>()
  for (const dim of payload.dimensions) {
    sectionMap.set(dim.dimensionId, {
      dimensionId: dim.dimensionId,
      label: dim.label,
      researchQuestion: dim.researchQuestion,
      missingInformation: dim.missingInformation ?? [],
      claims: [],
      evidence: [],
    })
  }

  for (const claim of payload.claims) {
    const section = sectionMap.get(claim.dimensionId)
    if (!section) continue
    section.claims.push({
      claimId: claim.claimId,
      text: claim.text,
      type: claim.type,
      signal: claim.signal,
      evidenceIds: claim.evidenceIds,
    })
  }

  // 归属铁律：Evidence.dimension 是七值枚举，与动态 dimensionId（DIM_AI_INITIAL_xx）对不上，
  // 必须用 ResearchDimension.evidenceIds 反查，否则证据会整批丢失。
  const evidenceById = new Map(payload.evidence.map((e) => [e.evidenceId, e]))
  const assigned = new Set<string>()
  for (const dim of payload.dimensions) {
    const section = sectionMap.get(dim.dimensionId)
    if (!section) continue
    for (const id of dim.evidenceIds) {
      const e = evidenceById.get(id)
      if (!e || assigned.has(id)) continue
      assigned.add(id)
      // UNKNOWN 统一进独立分区（跨维度集中呈现，分区恒存在）
      if (e.type === "unknown") continue
      section.evidence.push(evidenceLine(e, payload))
    }
  }

  // 未被任何维度引用的证据（理论不该发生，但不能静默丢弃——归入"其他证据"由 UI 兜底）
  const unassigned: NotesEvidenceLine[] = []
  for (const e of payload.evidence) {
    if (assigned.has(e.evidenceId)) continue
    const line = evidenceLine(e, payload)
    if (e.type === "unknown") continue
    unassigned.push(line)
  }

  const unknowns: NotesEvidenceLine[] = payload.evidence
    .filter((e) => e.type === "unknown")
    .map((e) => evidenceLine(e, payload))

  return {
    meta,
    sections: [...sectionMap.values()].filter((s) => s.claims.length > 0 || s.evidence.length > 0),
    ...(unassigned.length > 0 ? { unassigned } : {}),
    unknowns,
    disclaimer: NOTES_DISCLAIMER,
  }
}
