import type { ResearchDimension } from "@/lib/research/dimension-schema"

// 确定性 constellation layout（Task 12 §62 + Task 12.1 §6–§12/§18/§24–§25）：
// - 位置由 priority / conflict / evidence count / stable hash 决定，两次渲染完全一致；
// - 碰撞消解：对象之间 ≥ MIN_OBJECT_GAP，任何对象 bbox 不得进入 Company Core 排除区；
// - 布局不含随机数；建议 ghost 对象沿右侧外围弧线稳定分布（非 Sidebar）。

export interface ObjectSize {
  width: number
  height: number
}

export const CONSTELLATION = {
  /** Company Core 直径（190–220px 区间） */
  CORE_SIZE: 208,
  /** Core 外缘 + 安全区，任何对象 bbox 不得进入 */
  CORE_SAFETY: 24,
  /** Dimension 对象尺寸体系（UNKNOWN 也使用同一体系，仅样式不同） */
  OBJECT_WIDTH: 172,
  OBJECT_WIDTH_PRIMARY: 186,
  OBJECT_HEIGHT: 76,
  /** 对象之间的最小视觉间隔 */
  MIN_OBJECT_GAP: 22,
  /** 高优先级对象的接近度增益 */
  PRIORITY_INSET: 46,
  /** 建议 ghost 对象（compact）尺寸 */
  SUGGESTION_WIDTH: 190,
  SUGGESTION_HEIGHT: 60,
  /** Add 节点独立对象直径 */
  ADD_NODE_DIAMETER: 52,
} as const

export interface DimensionLayout {
  dimensionId: string
  angle: number
  radius: number
  width: number
  height: number
  x: number
  y: number
  scale: number
}

/** 稳定 hash（FNV-1a 32bit）→ [0,1) */
export function stableHashUnit(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash / 0xffffffff
}

function halfDiagonal(size: ObjectSize): number {
  return Math.hypot(size.width / 2, size.height / 2)
}

/** 对象尺寸：priority 最高略大（§18）；UNKNOWN 使用同一尺寸体系（§4） */
export function dimensionObjectSize(dim: ResearchDimension, priorityRank: number): ObjectSize {
  const isPrimary = priorityRank === 0
  return {
    width: isPrimary ? CONSTELLATION.OBJECT_WIDTH_PRIMARY : CONSTELLATION.OBJECT_WIDTH,
    height: CONSTELLATION.OBJECT_HEIGHT,
  }
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function boxesOverlap(a: Box, b: Box, gap: number): boolean {
  const ax = a.x - a.width / 2
  const ay = a.y - a.height / 2
  const bx = b.x - b.width / 2
  const by = b.y - b.height / 2
  const overlapX = ax < bx + b.width + gap && bx < ax + a.width + gap
  const overlapY = ay < by + b.height + gap && by < ay + a.height + gap
  return overlapX && overlapY
}

/**
 * 确定性 radial + 碰撞消解：
 * 1) 按 priority 分配角度（自正上方顺时针）与基础半径（高优先级更靠近 Core）；
 * 2) Core 排除区：把进入安全区的对象沿径向外推；
 * 3) 迭代消解对象间碰撞（低优先级让位，沿径向微调）；
 * 4) 返回与输入同序的布局，保证稳定。
 */
export function computeDimensionLayout(
  dimensions: ResearchDimension[],
  options: { gap?: number; coreSafety?: number } = {},
): DimensionLayout[] {
  const count = dimensions.length
  if (count === 0) return []
  const gap = options.gap ?? CONSTELLATION.MIN_OBJECT_GAP
  const coreSafety = options.coreSafety ?? CONSTELLATION.CORE_SAFETY
  const coreRadius = CONSTELLATION.CORE_SIZE / 2

  const sorted = [...dimensions].sort((a, b) => a.priority - b.priority)
  const layouts: DimensionLayout[] = []

  sorted.forEach((dim, index) => {
    const size = dimensionObjectSize(dim, index)
    const baseAngle = -Math.PI / 2 + (index / count) * Math.PI * 2
    const jitter = (stableHashUnit(dim.dimensionId) - 0.5) * 0.14
    const angle = baseAngle + jitter

    const minRadius = coreRadius + coreSafety + halfDiagonal(size)
    const priorityInset =
      (1 - Math.min(index, count - 1) / Math.max(count - 1, 1)) * CONSTELLATION.PRIORITY_INSET
    const evidenceInset = Math.min(dim.evidenceIds.length, 8) * 3
    const radius = minRadius + 30 + priorityInset + evidenceInset

    layouts.push({
      dimensionId: dim.dimensionId,
      angle,
      radius,
      width: size.width,
      height: size.height,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      scale: index === 0 ? 1.08 : 1,
    })
  })

  const rankById = new Map(sorted.map((d, i) => [d.dimensionId, i] as const))

  // ---- Core 排除区 ----
  for (const l of layouts) {
    const exclusion = coreRadius + coreSafety + halfDiagonal({ width: l.width, height: l.height })
    if (l.radius < exclusion) {
      l.radius = exclusion
      l.x = Math.cos(l.angle) * l.radius
      l.y = Math.sin(l.angle) * l.radius
    }
  }

  // ---- 迭代碰撞消解（低优先级对象沿径向让位，确定性） ----
  const ITERATIONS = 48
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let moved = false
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const a = layouts[i]
        const b = layouts[j]
        if (!boxesOverlap(a, b, gap - 2)) continue
        const rankA = rankById.get(a.dimensionId) ?? 0
        const rankB = rankById.get(b.dimensionId) ?? 0
        const push = rankA <= rankB ? b : a
        push.radius += 14
        push.x = Math.cos(push.angle) * push.radius
        push.y = Math.sin(push.angle) * push.radius
        moved = true
      }
    }
    if (!moved) break
  }

  const byId = new Map(layouts.map((l) => [l.dimensionId, l] as const))
  return dimensions.map((d) => byId.get(d.dimensionId)!)
}

export interface SuggestionPlacement {
  label: string
  x: number
  y: number
  angle: number
  radius: number
}

/**
 * 建议 ghost 对象的外围弧线布局（Task 12.1 §9–§12）：
 * 右侧外围（约 -35°…+35° 弧段），三档固定位置；非规则列表、非 Sidebar，确定性。
 */
export function computeSuggestionLayout(
  suggestions: { label: string }[],
  options: { baseRadius?: number } = {},
): SuggestionPlacement[] {
  if (suggestions.length === 0) return []
  const baseRadius = options.baseRadius ?? CONSTELLATION.CORE_SIZE / 2 + 170
  const angles = [-0.62, 0.0, 0.62]
  const radii = [baseRadius + 14, baseRadius, baseRadius + 14]
  return suggestions.slice(0, 3).map((s, i) => {
    const angle = angles[i] ?? 0
    const radius = radii[i] ?? baseRadius
    return { label: s.label, angle, radius, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
}

/**
 * Add 节点独立对象位置（Task 12.1 §8）：从固定候选角度中选与最近维度角距最大者，
 * 确定性，且不与任何 Dimension 卡片相贴。
 */
export function computeAddNodeLayout(
  layouts: DimensionLayout[],
  options: { radius?: number } = {},
): { x: number; y: number; angle: number; radius: number } {
  const radius = options.radius ?? CONSTELLATION.CORE_SIZE / 2 + 130
  const sortedAngles = [...layouts.map((l) => l.angle)].sort((a, b) => a - b)

  // 无维度：放在正上方
  if (sortedAngles.length === 0) {
    return { angle: -Math.PI / 2, radius, x: 0, y: -radius }
  }

  // 在相邻维度的最大角隙中点放置（确定性 → 与最近维度角距最大化）
  let bestAngle = sortedAngles[0] + Math.PI
  let bestGap = -1
  for (let i = 0; i < sortedAngles.length; i++) {
    const a = sortedAngles[i]
    const b = sortedAngles[(i + 1) % sortedAngles.length]
    const gap = i === sortedAngles.length - 1 ? b + Math.PI * 2 - a : b - a
    if (gap > bestGap) {
      bestGap = gap
      bestAngle = a + gap / 2
    }
  }
  const normalized = Math.atan2(Math.sin(bestAngle), Math.cos(bestAngle))
  return {
    angle: normalized,
    radius,
    x: Math.cos(normalized) * radius,
    y: Math.sin(normalized) * radius,
  }
}

/** 碰撞守卫（测试与运行时断言）：对象间距、对象与 Core 间距是否满足约束 */
export function verifyLayoutConstraints(
  layouts: DimensionLayout[],
  options: { gap?: number; coreSafety?: number } = {},
): { ok: boolean; violations: string[] } {
  const gap = options.gap ?? CONSTELLATION.MIN_OBJECT_GAP
  const coreSafety = options.coreSafety ?? CONSTELLATION.CORE_SAFETY
  const coreRadius = CONSTELLATION.CORE_SIZE / 2
  const violations: string[] = []
  layouts.forEach((l, i) => {
    const minCenter = coreRadius + coreSafety + halfDiagonal({ width: l.width, height: l.height })
    if (l.radius < minCenter - 0.5) {
      violations.push(
        `${l.dimensionId} 进入 Company Core 排除区（radius=${l.radius.toFixed(1)} < ${minCenter.toFixed(1)}）`,
      )
    }
    for (let j = i + 1; j < layouts.length; j++) {
      const other = layouts[j]
      if (boxesOverlap(l, other, gap - 1)) {
        violations.push(`${l.dimensionId} 与 ${other.dimensionId} 间距不足（<${gap}px）`)
      }
    }
  })
  return { ok: violations.length === 0, violations }
}

// ---------- Evidence Field ----------

export const EVIDENCE_FIELD_MAX_NODES = 18
export const EVIDENCE_FIELD_MIN_NODES = 12

/** Evidence Field：选取视觉节点（按重要性层级，最多 18 个） */
export function selectFieldEvidence<T extends { evidenceId: string; type: string; signal: string; dimension: string }>(
  evidence: T[],
  max = EVIDENCE_FIELD_MAX_NODES,
): T[] {
  function tier(e: T): number {
    if (e.type === "inference" && e.signal === "conflict") return 0
    if (e.type === "inference") return 1
    if (e.type === "unknown") return 2
    if (e.type === "fact" && e.signal === "negative") return 3
    if (e.type === "fact" && e.signal === "positive") return 4
    return 5
  }
  return [...evidence]
    .sort((a, b) => {
      const t = tier(a) - tier(b)
      if (t !== 0) return t
      return a.evidenceId.localeCompare(b.evidenceId)
    })
    .slice(0, max)
}

/**
 * Evidence Field 节点坐标（Task 12.1 §13–§15）：
 * 同一维度聚类成弧段（hover 高亮 cluster），半径覆盖主空间，使背景证据场可辨识；
 * 确定性、无随机。
 */
export function computeFieldNodes<T extends { evidenceId: string; dimension: string }>(
  evidence: T[],
  spaceWidth: number,
  spaceHeight: number,
): { evidenceId: string; x: number; y: number; dimension: string }[] {
  const byDimension = new Map<string, T[]>()
  for (const e of evidence) {
    const list = byDimension.get(e.dimension) ?? []
    list.push(e)
    byDimension.set(e.dimension, list)
  }
  const dimensions = [...byDimension.keys()].sort()
  const nodes: { evidenceId: string; x: number; y: number; dimension: string }[] = []
  const baseRadius = Math.min(spaceWidth, spaceHeight) * 0.34
  dimensions.forEach((dimension, dimIndex) => {
    const items = byDimension.get(dimension)!
    const clusterAngle = (dimIndex / Math.max(dimensions.length, 1)) * Math.PI * 2
    items.forEach((e, itemIndex) => {
      const t = (itemIndex + 1) / (items.length + 1)
      const angle = clusterAngle + (t - 0.5) * 0.58
      const radius = baseRadius * (0.72 + ((itemIndex + dimIndex) % 3) * 0.22)
      nodes.push({
        evidenceId: e.evidenceId,
        dimension,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * (spaceHeight / spaceWidth) * 1.35,
      })
    })
  })
  return nodes
}
