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
  origin: "ai_initial" | "ai_suggested" | "user"
  /** AI 推荐的最先研究角度（soft focal；非股票评价，§7） */
  isFocalCandidate: boolean
}

/** 设计基准世界（scale 1.00 时与 1440×900 视口 1:1） */
export const DESIGN = { width: 1440, height: 900 } as const

/**
 * 正式研究维度按编号从左到右、从上到下阅读（每三枚一行）。
 * 但**每一行的列基线都不同**，上下两行的列刻意不对齐 —— 顺序仍然跟得住编号，
 * 观感却不是九宫格。左侧留给公司身份和待加入建议；列间距足以让长标题与
 * hover 摘要不粘到相邻标签上。
 */
const ROW_COLUMN_BASES = [
  [432, 806, 1120],
  [500, 852, 1140],
  [520, 790, 1140],
  [470, 838, 1130],
  [505, 812, 1105],
] as const
const ORDERED_START_Y = 235
const ORDERED_ROW_GAP = 235
/**
 * 位置错落：四行一循环，与"每五行一轮的列基线"不同周期，看不出重复。
 * 配合列基线，同一列的落点在各行之间相差约 80px（不是"上下对齐的一竖"）；
 * 行内纵向错落 72~96px（不足行距 235 的一半，行与行仍严格分离）。
 * 横向幅度最大 48，远小于列间距，因此不会让标签粘连。
 */
const EDITORIAL_RHYTHM = [
  [{ x: 8, y: 0 }, { x: 34, y: 78 }, { x: -30, y: 22 }],
  [{ x: 30, y: 30 }, { x: 48, y: 96 }, { x: 30, y: 4 }],
  [{ x: -55, y: 64 }, { x: 20, y: 0 }, { x: -35, y: 88 }],
  [{ x: 40, y: 12 }, { x: 42, y: 84 }, { x: 30, y: 40 }],
] as const

/** 编号位 → 世界坐标（只含骨架与错落；按实际盒宽的避让在 composeCanvas 内收尾） */
export function slotPosition(slotIndex: number): { x: number; y: number } {
  const column = slotIndex % 3
  const row = Math.floor(slotIndex / 3)
  const baseX = ROW_COLUMN_BASES[row % ROW_COLUMN_BASES.length][column]
  const offset = EDITORIAL_RHYTHM[row % EDITORIAL_RHYTHM.length][column]
  return {
    x: baseX + offset.x,
    y: ORDERED_START_Y + row * ORDERED_ROW_GAP + offset.y,
  }
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
  const byPriority = (a: ResearchSpacePayload["dimensions"][number], b: ResearchSpacePayload["dimensions"][number]) =>
    a.priority - b.priority || a.label.localeCompare(b.label, "zh-CN")
  const established = payload.dimensions.filter((dimension) => dimension.origin === "ai_initial").sort(byPriority)
  // 后续确认加入的维度保持写入顺序，因此每次新增都会自然获得下一个编号。
  const additions = payload.dimensions.filter((dimension) => dimension.origin !== "ai_initial")
  const dims = [...established, ...additions]
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
  const ordered = dims.map((dim, index) => {
    const isUnknown = dim.status === "unknown"
    const tier: Tier = isUnknown ? "tertiary" : index === 0 ? "primary" : index < 4 ? "secondary" : "tertiary"
    return { dim, index, isUnknown, tier }
  })
  /**
   * 确定性避让：只在**同一行内**向右让位，绝不跨行。
   * 因此编号从左到右、行与行严格下移这两条秩序不受影响，
   * 而错落偏移只在长标题真的会撞上时才被收一点。
   */
  const settled: { x: number; y: number }[] = ordered.map(({ index }) => slotPosition(index))
  for (let rowStart = 0; rowStart < ordered.length; rowStart += 3) {
    for (let i = rowStart + 1; i < Math.min(rowStart + 3, ordered.length); i += 1) {
      const prevBox = anchorBoxSize(ordered[i - 1].dim.label, ordered[i - 1].tier)
      const box = anchorBoxSize(ordered[i].dim.label, ordered[i].tier)
      const need = settled[i - 1].x + prevBox.width + 24
      if (settled[i].x >= need) continue
      // 世界内放得下就向右让；放不下就改为向下让（幅度恒为 盒高+48，远小于行距）
      settled[i] =
        need + box.width <= DESIGN.width - 24
          ? { x: need, y: settled[i].y }
          : { x: settled[i].x, y: settled[i - 1].y + prevBox.height + 48 }
    }
  }
  return ordered.map(({ dim, index, isUnknown, tier }, i) => {
    const pos = settled[i]
    const claims = payload.claims.filter((c) => c.dimensionId === dim.dimensionId)
    return {
      dimensionId: dim.dimensionId,
      index: String(index + 1).padStart(2, "0"),
      label: dim.label,
      status: dim.status,
      tier,
      evidenceCount: dim.evidenceIds.length,
      conflictCount: claims.filter((c) => c.signal === "conflict").length,
      x: pos.x,
      y: pos.y,
      hasInterpretation: claims.filter((c) => c.type !== "unknown").length > 0,
      aspects: isUnknown ? [] : aspectsOf(dim.dimensionId),
      origin: dim.origin,
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

/** 锚点默认矩形估算（默认态只显示 index + label + count；供碰撞求解，§31） */
export function anchorBoxSize(label: string, tier: Tier): { width: number; height: number } {
  const f = tierFont(tier)
  return { width: Math.max(label.length * f.size * 0.62 + 46, 200), height: 62 }
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
