// Research Canvas 布局（Task 15.3 / 15.3A §5–§11）——纯函数、确定性。
// 初始世界 = 1440×900 设计基准（scale 1.00 时世界坐标即屏幕坐标）；
// Anchor 使用固定 editorial slots（§6），禁止 radial / 均匀栅格 / 中心 hub。

import { stableHashUnit } from "@/lib/presentation/constellation-layout"
import type { ResearchSpacePayload } from "@/components/observatory/theme"

export type Tier = "primary" | "secondary" | "tertiary"

export interface AnchorSpec {
  dimensionId: string
  index: string
  label: string
  status: "ready" | "partial" | "unknown"
  tier: Tier
  evidenceCount: number
  conflictCount: number
  x: number
  y: number
  hasInterpretation: boolean
  aspects: string[]
  /** AI 推荐的最先研究角度（soft focal；非股票评价，§7） */
  isFocalCandidate: boolean
}

/** 设计基准世界（scale 1.00 时与 1440×900 视口 1:1） */
export const DESIGN = { width: 1440, height: 900 } as const

/** §6：归一化 editorial slots（primary 在 .53,.25） */
const SLOTS: { x: number; y: number }[] = [
  { x: 0.53, y: 0.25 },
  { x: 0.31, y: 0.28 },
  { x: 0.74, y: 0.54 },
  { x: 0.25, y: 0.55 },
  { x: 0.43, y: 0.74 },
  { x: 0.66, y: 0.77 },
  { x: 0.78, y: 0.17 },
  { x: 0.17, y: 0.7 },
]

export function slotPosition(slotIndex: number): { x: number; y: number } {
  const s = SLOTS[slotIndex % SLOTS.length]
  return { x: s.x * DESIGN.width, y: s.y * DESIGN.height }
}

/** §11：字号层级（1440×900、scale 1） */
export function tierFont(tier: Tier): { size: number; meta: number } {
  switch (tier) {
    case "primary":
      return { size: 34, meta: 12.5 }
    case "secondary":
      return { size: 24, meta: 12 }
    case "tertiary":
      return { size: 19, meta: 11.5 }
  }
}

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
  /** 估计盒子（用于确定性避让；非渲染值） */
  const boxOf = (label: string, size: number, aspects: number) => ({
    w: Math.max(label.length * size * 0.62 + 40, 230),
    h: 34 + 22 + aspects * 19 + 46,
  })
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const decollide = (x: number, y: number, w: number, h: number): { x: number; y: number } => {
    let px = x
    let py = y
    for (let i = 0; i < 10; i++) {
      const clash = placed.find((q) => Math.abs(q.x - px) < (q.w + w) / 2 + 24 && Math.abs(q.y - py) < (q.h + h) / 2 + 22)
      if (!clash) break
      py = clash.y + (clash.h + h) / 2 + 28
      px = px + 26
      if (py > DESIGN.height - 140) {
        py = y
        px = px + 150
      }
    }
    return { x: px, y: py }
  }
  let slot = 0
  return dims.map((dim, index) => {
    const isUnknown = dim.status === "unknown"
    // 已知维度依次占 slot；UNKNOWN 固定落到 slot 8（边缘位），不挤占主构图
    const pos = isUnknown ? slotPosition(7) : slotPosition(slot++)
    const jx = (stableHashUnit(`${dim.dimensionId}:ax`) - 0.5) * 26
    const jy = (stableHashUnit(`${dim.dimensionId}:ay`) - 0.5) * 20
    const claims = payload.claims.filter((c) => c.dimensionId === dim.dimensionId)
    const tier: Tier = isUnknown ? "tertiary" : index === 0 ? "primary" : index < 4 ? "secondary" : "tertiary"
    const aspectsForBox = isUnknown ? 0 : aspectsOf(dim.dimensionId).length
    const box = boxOf(dim.label, tierFont(tier).size, aspectsForBox)
    const settled = decollide(pos.x + jx, pos.y + jy, box.w, box.h)
    placed.push({ x: settled.x, y: settled.y, w: box.w, h: box.h })
    return {
      dimensionId: dim.dimensionId,
      index: String(index + 1).padStart(2, "0"),
      label: dim.label,
      status: dim.status,
      tier,
      evidenceCount: dim.evidenceIds.length,
      conflictCount: claims.filter((c) => c.signal === "conflict").length,
      x: settled.x,
      y: settled.y,
      hasInterpretation: claims.filter((c) => c.type !== "unknown").length > 0,
      aspects: isUnknown ? [] : aspectsOf(dim.dimensionId),
      isFocalCandidate: index === 0 && !isUnknown,
    }
  })
}

// ---------- Evidence Trace（§13） ----------

export interface TraceNode {
  evidenceId: string
  x: number
  y: number
}

export interface TraceEdge {
  path: string
  toX: number
  toY: number
}

export interface AnchorTrace {
  dimensionId: string
  nodes: TraceNode[]
  edges: TraceEdge[]
}

export function buildTrace(
  anchor: { x: number; y: number; dimensionId: string },
  evidenceIds: string[],
  max = 4,
): AnchorTrace {
  const ids = [...evidenceIds].sort().slice(0, max)
  const nodes: TraceNode[] = ids.map((id, i) => {
    const angle = (stableHashUnit(`${id}:ta`) * 0.5 + 0.08 + i * 0.14) * Math.PI * 2
    const radius = 110 + stableHashUnit(`${id}:tr`) * 130
    return {
      evidenceId: id,
      x: anchor.x + Math.cos(angle) * radius,
      y: anchor.y + Math.sin(angle) * radius * 0.66,
    }
  })
  const edges: TraceEdge[] = nodes.map((n, i) => {
    const bend = 0.18 + stableHashUnit(`${n.evidenceId}:bend`) * 0.3
    const cx = anchor.x + (n.x - anchor.x) * (0.4 + i * 0.06) + (n.y - anchor.y) * bend * 0.3
    const cy = anchor.y + (n.y - anchor.y) * (0.5 - i * 0.04) - (n.x - anchor.x) * bend * 0.2
    return {
      path: `M ${anchor.x} ${anchor.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${n.x.toFixed(1)} ${n.y.toFixed(1)}`,
      toX: n.x,
      toY: n.y,
    }
  })
  return { dimensionId: anchor.dimensionId, nodes, edges }
}

// ---------- Evidence annotations（§14） ----------

export interface EvidenceAnnotation {
  index: string
  name: string
  value: string
  type: string
  evidenceId: string
  periodLine: string
}

export function evidenceAnnotations(
  payload: ResearchSpacePayload,
  dimensionId: string,
  max = 3,
): EvidenceAnnotation[] {
  const dim = payload.dimensions.find((d) => d.dimensionId === dimensionId)
  if (!dim) return []
  const out: EvidenceAnnotation[] = []
  for (const id of [...dim.evidenceIds].sort()) {
    if (out.length >= max) break
    const ev = payload.evidence.find((e) => e.evidenceId === id)
    const metric = ev?.metricIds.map((m) => payload.metrics.find((x) => x.metricId === m)).find(Boolean)
    if (!ev || !metric) continue
    const v = metric.value
    out.push({
      index: String(out.length + 1).padStart(2, "0"),
      name: metric.name,
      evidenceId: ev.evidenceId,
      value:
        v === null || v === undefined
          ? "—"
          : `${typeof v === "number" ? (Math.abs(v) < 100 ? v.toFixed(2) : v.toFixed(0)) : v}${
              metric.unit === "%" ? "%" : metric.unit === "pct" ? " pct" : ""
            }`,
      type: ev.type,
      periodLine: [metric.period, metric.comparisonPeriod ? `vs ${metric.comparisonPeriod}` : ""]
        .filter(Boolean)
        .join(" "),
    })
  }
  return out
}

/** 环境区域标签（画布语境层；原型期为固定研究域词） */
export function ambientLabels(): { text: string; x: number; y: number }[] {
  return [
    { text: "CHINA MARKET", x: 96, y: 372 },
    { text: "GLOBAL EXPANSION", x: 96, y: 690 },
    { text: "CASH FLOW", x: 1150, y: 620 },
    { text: "VALUATION", x: 190, y: 862 },
  ]
}

/** Gather（§42）：紧凑非对称分组——两列错落，禁止围圆 */
export function gatherTargets(ids: string[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  const baseX = DESIGN.width * 0.34
  const baseY = DESIGN.height * 0.26
  ids.forEach((id, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    out[id] = { x: baseX + col * 340 + (row % 2) * 28, y: baseY + row * 190 }
  })
  return out
}
