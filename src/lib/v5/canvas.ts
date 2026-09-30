// Research Canvas 布局（Task 15.3 §6–§8/§11）——纯函数、确定性。
// Anchor 位置为非对称 editorial field（禁 radical/中心 hub/等距栅格）；
// scale 只由 priority 决定（禁 positive/negative 信号）；Evidence Trace 由真实证据生成。

import { stableHashUnit } from "@/lib/presentation/constellation-layout"
import type { ResearchSpacePayload } from "@/components/observatory/theme"

export type Tier = "primary" | "secondary" | "tertiary"

export interface AnchorSpec {
  dimensionId: string
  /** 画布上的序号（参考图：01–06，小号 mono） */
  index: string
  label: string
  status: "ready" | "partial" | "unknown"
  tier: Tier
  evidenceCount: number
  conflictCount: number
  /** world 坐标（非对称散布） */
  x: number
  y: number
  /** 是否有 AI 解释（§32 局部失败时本地提示） */
  hasInterpretation: boolean
  /** 锚点子条目（参考图：标题下 3 行研究方向；取自该维度真实 metric 名称） */
  aspects: string[]
}

export interface TraceNode {
  evidenceId: string
  x: number
  y: number
}

export interface TraceEdge {
  /** 二次贝塞尔路径（参考图：曲线网络，非直线放射） */
  path: string
  toX: number
  toY: number
}

export interface AnchorTrace {
  dimensionId: string
  nodes: TraceNode[]
  edges: TraceEdge[]
}

/** 世界范围（pan/zoom 作用于此空间） */
export const CANVAS = { width: 2200, height: 1320 } as const

/** tier 排版（§7：primary 28–34 / secondary 18–22 / tertiary 14–16） */
export function tierFont(tier: Tier): { size: number; meta: number } {
  switch (tier) {
    case "primary":
      return { size: 34, meta: 11 }
    case "secondary":
      return { size: 24, meta: 10.5 }
    case "tertiary":
      return { size: 17, meta: 10 }
  }
}

/** 非对称槽位：主锚点偏左右两侧、次锚点错落、末尾锚点落底部，无任何环状/均匀分布 */
const SPOTS: { x: number; y: number }[] = [
  { x: 430, y: 300 },
  { x: 900, y: 262 },
  { x: 340, y: 626 },
  { x: 1220, y: 620 },
  { x: 706, y: 830 },
  { x: 1186, y: 884 },
]

export function composeCanvas(payload: ResearchSpacePayload): AnchorSpec[] {
  const dims = [...payload.dimensions].sort((a, b) => a.priority - b.priority)
  const aspectsOf = (dimensionId: string): string[] => {
    const dim = payload.dimensions.find((d) => d.dimensionId === dimensionId)
    if (!dim) return []
    const out: string[] = []
    for (const id of [...dim.evidenceIds].sort()) {
      const ev = payload.evidence.find((e) => e.evidenceId === id)
      const metric = ev?.metricIds.map((m) => payload.metrics.find((x) => x.metricId === m)).find(Boolean)
      const name = metric?.name
      if (name && !out.includes(name)) out.push(name)
      if (out.length >= 3) break
    }
    return out
  }
  return dims.map((dim, index) => {
    const spot = index < SPOTS.length ? SPOTS[index] : SPOTS[SPOTS.length - 1]
    const jx = (stableHashUnit(`${dim.dimensionId}:ax`) - 0.5) * 90
    const jy = (stableHashUnit(`${dim.dimensionId}:ay`) - 0.5) * 70
    const isUnknown = dim.status === "unknown"
    const tier: Tier = isUnknown ? "tertiary" : index === 0 || index === 1 ? "primary" : index < 4 ? "secondary" : "tertiary"
    const claims = payload.claims.filter((c) => c.dimensionId === dim.dimensionId)
    return {
      dimensionId: dim.dimensionId,
      index: String(index + 1).padStart(2, "0"),
      label: dim.label,
      status: dim.status,
      tier,
      evidenceCount: dim.evidenceIds.length,
      conflictCount: claims.filter((c) => c.signal === "conflict").length,
      x: spot.x + (isUnknown ? 640 : jx),
      y: spot.y + (isUnknown ? 120 : jy),
      hasInterpretation: claims.filter((c) => c.type !== "unknown").length > 0,
      aspects: isUnknown ? [] : aspectsOf(dim.dimensionId),
    }
  })
}

/**
 * Evidence Trace（§11）：由该维度真实证据生成的细线 + 节点。
 * 默认几乎不可见；hover/focus 时显现。节点位置确定性（非随机散点）。
 */
export function buildTrace(anchor: AnchorSpec, evidenceIds: string[], max = 4): AnchorTrace {
  const ids = [...evidenceIds].sort().slice(0, max)
  const nodes: TraceNode[] = ids.map((id, i) => {
    const angle = (stableHashUnit(`${id}:ta`) * 0.5 + 0.06 + i * 0.13) * Math.PI * 2
    const radius = 130 + stableHashUnit(`${id}:tr`) * 150
    return {
      evidenceId: id,
      x: anchor.x + Math.cos(angle) * radius,
      y: anchor.y + Math.sin(angle) * radius * 0.7,
    }
  })
  const mid = { x: anchor.x, y: anchor.y + 60 }
  const edges: TraceEdge[] = nodes.map((n, i) => {
    // 控制点：沿中点方向偏移（确定性），产生参考图中的有机弧线
    const bend = 0.18 + stableHashUnit(`${n.evidenceId}:bend`) * 0.3
    const cx = mid.x + (n.x - mid.x) * (0.4 + i * 0.06) + (n.y - mid.y) * bend * 0.35
    const cy = mid.y + (n.y - mid.y) * (0.5 - i * 0.04) - (n.x - mid.x) * bend * 0.22
    return { path: `M ${anchor.x} ${anchor.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${n.x.toFixed(1)} ${n.y.toFixed(1)}`, toX: n.x, toY: n.y }
  })
  return { dimensionId: anchor.dimensionId, nodes, edges }
}

/** 环境区域标签（参考图：极淡 caps，作为画布语境层；原型阶段为固定研究域词） */
export function ambientLabels(payload: ResearchSpacePayload): { text: string; x: number; y: number }[] {
  const industry = payload.company.industryName ?? ""
  return [
    { text: "CHINA MARKET", x: 150, y: 470 },
    { text: "GLOBAL EXPANSION", x: 180, y: 800 },
    { text: "CASH FLOW", x: 1330, y: 760 },
    { text: "VALUATION", x: 1300, y: 1070 },
  ]
}

export interface EvidenceAnnotation {
  index: string
  name: string
  value: string
  type: string
  /** 参考图：`2024Q2 vs 2023Q2` 形式的期间行（真实 metric 字段） */
  periodLine: string
}

/** §11：hover 时显示 2–3 条最高价值证据（真实 metric 名称与数值） */
export function evidenceAnnotations(payload: ResearchSpacePayload, dimensionId: string, max = 3): EvidenceAnnotation[] {
  const dim = payload.dimensions.find((d) => d.dimensionId === dimensionId)
  if (!dim) return []
  const out: EvidenceAnnotation[] = []
  for (const id of [...dim.evidenceIds].sort()) {
    if (out.length >= max) break
    const ev = payload.evidence.find((e) => e.evidenceId === id)
    const metric = payload.evidence
      .filter((e) => e.evidenceId === id)
      .flatMap((e) => e.metricIds)
      .map((m) => payload.metrics.find((x) => x.metricId === m))
      .find((m) => Boolean(m))
    if (!ev || !metric) continue
    const v = metric.value
    out.push({
      index: String(out.length + 1).padStart(2, "0"),
      name: metric.name,
      periodLine: [metric.period, metric.comparisonPeriod ? `vs ${metric.comparisonPeriod}` : null].filter(Boolean).join(" "),
      value:
        v === null || v === undefined
          ? "—"
          : `${typeof v === "number" ? (Math.abs(v) < 100 ? v.toFixed(2) : v.toFixed(0)) : v}${metric.unit === "%" ? "%" : metric.unit === "pct" ? " pct" : ""}`,
      type: ev.type,
    })
  }
  return out
}
