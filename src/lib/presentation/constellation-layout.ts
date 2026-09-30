import type { ResearchDimension } from "@/lib/research/dimension-schema"

// 确定性 radial layout（Task 12 §62）：
// Dimension 位置由 priority / status / evidence count / dimensionId hash 决定，
// 每次渲染完全一致，绝不随机（禁止「每次打开位置都变」）。
// Evidence Field 同样只取最重要的 12–20 个节点（§71）。

export interface DimensionLayout {
  dimensionId: string
  /** 相对 Company Core 的角度（弧度）与半径（px，基于 640x520 空间） */
  angle: number
  radius: number
  /** 对象视觉半径（px） */
  size: number
  x: number
  y: number
}

export const LAYOUT_SPACE = { width: 720, height: 520, coreRadius: 96 } as const
export const EVIDENCE_FIELD_MAX_NODES = 18
export const EVIDENCE_FIELD_MIN_NODES = 12

/** 稳定 hash（FNV-1a 32bit）→ [0,1)，用于给每个维度一个确定性的微角度偏移 */
export function stableHashUnit(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash / 0xffffffff
}

function statusWeight(status: ResearchDimension["status"]): number {
  if (status === "ready") return 1
  if (status === "partial") return 0.7
  return 0.45
}

/**
 * 计算维度布局：
 * - 角度：按 priority 均分整圆（从正上方开始，顺时针），加 stable hash 的小偏移（±0.06 rad）；
 * - 半径：优先级越高越靠内；证据越多的略微靠外（evidence adjacency 更易读）；
 * - 大小：ready 较大，unknown 较小（半透明对象不需要大尺寸）。
 */
export function computeDimensionLayout(dimensions: ResearchDimension[]): DimensionLayout[] {
  const count = dimensions.length
  if (count === 0) return []
  const sorted = [...dimensions].sort((a, b) => a.priority - b.priority)

  return sorted.map((dim, index) => {
    const baseAngle = -Math.PI / 2 + (index / count) * Math.PI * 2
    const jitter = (stableHashUnit(dim.dimensionId) - 0.5) * 0.12
    const angle = baseAngle + jitter

    const priorityBoost = 1 - Math.min(index, count - 1) / Math.max(count - 1, 1) // 1 → 0
    const evidenceBoost = Math.min(dim.evidenceIds.length, 8) / 8
    const radius =
      150 +
      (1 - priorityBoost) * 70 -
      evidenceBoost * 24 +
      (dim.status === "unknown" ? 26 : 0)

    const size = Math.round(150 * statusWeight(dim.status) + Math.min(dim.evidenceIds.length, 6) * 6)

    return {
      dimensionId: dim.dimensionId,
      angle,
      radius,
      size,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  })
}

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
  return [...evidence].sort((a, b) => {
    const t = tier(a) - tier(b)
    if (t !== 0) return t
    return a.evidenceId.localeCompare(b.evidenceId)
  }).slice(0, max)
}

/**
 * Evidence Field 节点坐标：按 dimension 聚类成若干弧段（同一维度证据彼此相邻，
 * 支持 hover 高亮 cluster）。确定性，无随机。
 */
export function computeFieldNodes<T extends { evidenceId: string; dimension: string }>(
  evidence: T[],
  width: number = LAYOUT_SPACE.width,
  height: number = LAYOUT_SPACE.height,
): { evidenceId: string; x: number; y: number; dimension: string }[] {
  const byDimension = new Map<string, T[]>()
  for (const e of evidence) {
    const list = byDimension.get(e.dimension) ?? []
    list.push(e)
    byDimension.set(e.dimension, list)
  }
  const dimensions = [...byDimension.keys()].sort()
  const nodes: { evidenceId: string; x: number; y: number; dimension: string }[] = []
  const cx = 0
  const cy = 0
  dimensions.forEach((dimension, dimIndex) => {
    const items = byDimension.get(dimension)!
    const clusterAngle = (dimIndex / Math.max(dimensions.length, 1)) * Math.PI * 2
    items.forEach((e, itemIndex) => {
      const t = (itemIndex + 1) / (items.length + 1)
      const angle = clusterAngle + (t - 0.5) * 0.5
      const radius = 120 + (itemIndex % 3) * 46 + (dimIndex % 2) * 22
      nodes.push({
        evidenceId: e.evidenceId,
        dimension,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * (height / width) * 1.1,
      })
    })
  })
  return nodes
}
