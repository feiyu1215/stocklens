import type { ResearchDimension } from "@/lib/research/dimension-schema"
import { CONSTELLATION, computeDimensionLayout, type DimensionLayout } from "@/lib/presentation/constellation-layout"

// Layout Commands（Task 13 §13–§16/§33–§34）：Gather / Spread / Reset / Park / Restore。
// 纯函数、确定性；manualPositions 只存在于 client session（§13），不入后端。

export interface PositionOverride {
  x: number
  y: number
}

export type ManualPositions = Record<string, PositionOverride>

export interface ParkedDimension {
  dimensionId: string
  x: number
  y: number
}

export const PARK_ORBIT = {
  /** Parking orbit 半径（在世界坐标中位于维度环之外） */
  RADIUS_BASE: CONSTELLATION.CORE_SIZE / 2 + 330,
  RADIUS_STEP: 42,
} as const

/** Gather（§14）：把当前 active 维度聚合围绕 Company Core，保证 collision-free */
export function gatherLayout(dimensions: ResearchDimension[]): DimensionLayout[] {
  if (dimensions.length === 0) return []
  const sorted = [...dimensions].sort((a, b) => a.priority - b.priority)
  const compact: ResearchDimension[] = sorted.map((d, i) => ({
    ...d,
    // Gather 使用紧凑等距半径（优先级只影响角度顺序，不影响距离）：
    // 通过去除 evidence 增益、把 priority 压缩为固定值来收紧环半径
    priority: 1 + i * 0.0001,
  }))
  const layouts = computeDimensionLayout(compact)
  // 统一收缩：把半径向最小可行半径靠拢（保持 collision-free 由引擎迭代保证）
  const minRadius = CONSTELLATION.CORE_SIZE / 2 + CONSTELLATION.CORE_SAFETY + 120
  return layouts.map((l) => {
    const shrunk = Math.max(minRadius, l.radius - 56)
    return { ...l, radius: shrunk, x: Math.cos(l.angle) * shrunk, y: Math.sin(l.angle) * shrunk }
  })
}

/** Spread（§15）：按 priority / status / stable id 重新分散（AI 初始环形态） */
export function spreadLayout(dimensions: ResearchDimension[]): DimensionLayout[] {
  const ranked = [...dimensions].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    if (a.status !== b.status) return a.status.localeCompare(b.status)
    return a.dimensionId.localeCompare(b.dimensionId)
  })
  return computeDimensionLayout(ranked)
}

/** 合并 manualPositions（§13）：用户拖动过的维度保留手动位置 */
export function applyManualPositions(
  layouts: DimensionLayout[],
  manual: ManualPositions,
): DimensionLayout[] {
  return layouts.map((l) => {
    const override = manual[l.dimensionId]
    if (!override) return l
    const radius = Math.hypot(override.x, override.y)
    const angle = Math.atan2(override.y, override.x)
    return { ...l, x: override.x, y: override.y, radius, angle }
  })
}

/** Reset layout（§16）：清除 manual positions，恢复 AI 首次布局 */
export function resetLayout(dimensions: ResearchDimension[]): {
  layouts: DimensionLayout[]
  manualPositions: ManualPositions
} {
  return { layouts: computeDimensionLayout(dimensions), manualPositions: {} }
}

/** Park（§33）：维度缩为 marker 移动到 Parking Orbit（确定性角度，按 id 排序） */
export function parkOrbitPosition(dimensionId: string, parkedIds: string[]): ParkedDimension {
  const sorted = [...parkedIds].sort()
  const index = Math.max(sorted.indexOf(dimensionId), 0)
  const angle = -Math.PI / 2 + (index / Math.max(sorted.length, 1)) * Math.PI * 2
  const radius = PARK_ORBIT.RADIUS_BASE + (index % 2) * PARK_ORBIT.RADIUS_STEP
  return {
    dimensionId,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

export function parkDimension(
  dimensionId: string,
  parked: ParkedDimension[],
): ParkedDimension[] {
  if (parked.some((p) => p.dimensionId === dimensionId)) return parked
  const ids = [...parked.map((p) => p.dimensionId), dimensionId]
  return [...parked.filter((p) => p.dimensionId !== dimensionId), parkOrbitPosition(dimensionId, ids)]
}

/** Restore（§34）：从 Parking Orbit 恢复（回到 spread 布局；Park ≠ Delete） */
export function restoreDimension(
  dimensionId: string,
  parked: ParkedDimension[],
): ParkedDimension[] {
  return parked.filter((p) => p.dimensionId !== dimensionId)
}

/** Focus Zone 判定（§35–§36）：对象中心是否进入 Company Core 周围的柔性聚焦半径 */
export const FOCUS_ZONE_RADIUS = CONSTELLATION.CORE_SIZE / 2 + 150

export function isInsideFocusZone(position: { x: number; y: number }): boolean {
  return Math.hypot(position.x, position.y) <= FOCUS_ZONE_RADIUS
}

/** Dimension Proximity affordance（§40）：拖动中的维度靠近另一个维度的阈值 */
export const PROXIMITY_RADIUS = 190

export function findProximityTarget(
  dragging: { dimensionId: string; x: number; y: number },
  others: { dimensionId: string; label: string; x: number; y: number }[],
): { dimensionId: string; label: string } | null {
  let best: { dimensionId: string; label: string; distance: number } | null = null
  for (const o of others) {
    if (o.dimensionId === dragging.dimensionId) continue
    const distance = Math.hypot(o.x - dragging.x, o.y - dragging.y)
    if (distance <= PROXIMITY_RADIUS && (!best || distance < best.distance)) {
      best = { dimensionId: o.dimensionId, label: o.label, distance }
    }
  }
  return best ? { dimensionId: best.dimensionId, label: best.label } : null
}
