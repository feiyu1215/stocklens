// Terrain 几何生成（Task 14 §15–§22/§25–§35）：
// Generative Research Terrain —— 全部确定性程序生成（无随机数、无地图数据、无 3D 引擎依赖）。
// 重要：这里的几何是「视觉映射」，只存在于 Terrain Renderer 内部；
// Research domain model 不新增 terrainHeight / islandType 等字段（§26）。

import type { ResearchDimension } from "@/lib/research/dimension-schema"
import { stableHashUnit } from "@/lib/presentation/constellation-layout"

export interface Point {
  x: number
  y: number
}

/** 稳定的伪随机序列（LCG，种子来自 id → 跨渲染完全一致） */
function seededSequence(seed: number, count: number): number[] {
  let state = Math.floor(seed * 1_000_003) % 2_147_483_647 || 12_345
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    state = (state * 48_271) % 2_147_483_647
    out.push(state / 2_147_483_647)
  }
  return out
}

/** 闭合轮廓（Catmull-Rom 平滑的确定性极坐标闭合曲线） */
export function contourPath(
  center: Point,
  baseRadius: number,
  seedKey: string,
  options: { points?: number; roughness?: number } = {},
): string {
  const points = options.points ?? 14
  const roughness = options.roughness ?? 0.18
  const seed = stableHashUnit(seedKey)
  const wobble = seededSequence(seed * 7, points)
  const coords: Point[] = []
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2
    const r = baseRadius * (1 + (wobble[i] - 0.5) * 2 * roughness)
    coords.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r * 0.72 })
  }
  // 平滑闭合：二次贝塞尔经过中点
  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`
  for (let i = 1; i <= coords.length; i++) {
    const current = coords[i % coords.length]
    const next = coords[(i + 1) % coords.length]
    const midX = (current.x + next.x) / 2
    const midY = (current.y + next.y) / 2
    d += ` Q ${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`
  }
  return d + " Z"
}

/** 内圈等高线（同一形状多次收缩，形成 topography，§18） */
export function contourRings(
  center: Point,
  baseRadius: number,
  seedKey: string,
  count = 3,
): string[] {
  const rings: string[] = []
  for (let i = 0; i < count; i++) {
    const radius = baseRadius * (0.72 - i * 0.17)
    if (radius <= 4) break
    rings.push(
      contourPath({ x: center.x + i * 3, y: center.y - i * 2 }, radius, `${seedKey}:ring${i}`, {
        points: 12 - i,
        roughness: 0.14,
      }),
    )
  }
  return rings
}

export interface RegionGeometry {
  dimensionId: string
  center: Point
  /** ready/partial/unknown 对应的轮廓（unknown 为未闭合虚线轮廓） */
  path: string
  rings: string[]
  /** 地形丰富度（研究深度映射，§20）：0–1，只影响细节密度 */
  richness: number
  status: ResearchDimension["status"]
}

/**
 * Company Research Regions（§25–§31）：每个 Dimension 映射为一块研究地形。
 * 位置来自确定性 radial（与 spatial 布局同源），形状由 dimensionId / priority /
 * evidenceCount / status 决定；unknown → 未闭合轮廓 + fog 区域。
 */
export function computeRegionGeometry(
  dimension: ResearchDimension,
  position: Point,
  layoutScale = 1,
): RegionGeometry {
  const evidenceCount = dimension.evidenceIds.length
  const richness = Math.min(evidenceCount / 8, 1)
  const baseRadius = (74 + richness * 26) * layoutScale
  const seed = `${dimension.dimensionId}:${dimension.priority}`
  return {
    dimensionId: dimension.dimensionId,
    center: position,
    path: contourPath(position, baseRadius, seed, {
      points: 12 + Math.round(richness * 4),
      roughness: dimension.status === "unknown" ? 0.26 : 0.16,
    }),
    rings: dimension.status === "ready" ? contourRings(position, baseRadius, seed, 3) : contourRings(position, baseRadius, seed, 1),
    richness,
    status: dimension.status,
  }
}

/** My World Territories（§19–§21）：公司地块尺寸仅轻微映射 research depth（0.9–1.1x） */
export function territoryScale(exploredDimensionCount: number | undefined): number {
  const explored = Math.min(exploredDimensionCount ?? 0, 10)
  return 0.9 + (explored / 10) * 0.2
}

export function territoryGeometry(
  stockCode: string,
  position: Point,
  exploredDimensionCount: number | undefined,
): { path: string; rings: string[]; radius: number; scale: number } {
  const scale = territoryScale(exploredDimensionCount)
  const radius = 168 * scale
  return {
    path: contourPath(position, radius, `${stockCode}:territory`, { points: 16, roughness: 0.2 }),
    rings: contourRings(position, radius, `${stockCode}:territory`, 3),
    radius,
    scale,
  }
}

/** UNKNOWN fog 遮罩（§30–§31）：软掩码椭圆，克制、无烟雾动画 */
export function fogMaskPath(center: Point, radius: number, seedKey: string): string {
  return contourPath(center, radius * 1.05, `${seedKey}:fog`, { points: 12, roughness: 0.24 })
}

/** Evidence 采样点（§35）：由证据在区域内的确定性散布点表示 */
export function evidenceSamplePoints(
  center: Point,
  radius: number,
  evidenceIds: string[],
  max = 6,
): { evidenceId: string; point: Point; kind: number }[] {
  return evidenceIds.slice(0, max).map((id, index) => {
    const unit = stableHashUnit(`${id}:${index}`)
    const angle = unit * Math.PI * 2
    const r = radius * (0.25 + ((index % 4) / 4) * 0.5)
    return {
      evidenceId: id,
      point: { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r * 0.72 },
      // 0 fact / 1 inference / 2 unknown / 3 conflict —— 由调用方按真实类型传入
      kind: 0,
    }
  })
}

/** 背景等高线场（§18）：极稀疏、低对比，数量受控（§78） */
export function backgroundContours(
  extent: { width: number; height: number },
  seedKey: string,
  count = 7,
): string[] {
  const paths: string[] = []
  for (let i = 0; i < count; i++) {
    const unit = stableHashUnit(`${seedKey}:bg${i}`)
    const center = {
      x: (unit - 0.5) * extent.width * 0.9,
      y: (stableHashUnit(`${seedKey}:bgy${i}`) - 0.5) * extent.height * 0.8,
    }
    paths.push(
      contourPath(center, 120 + unit * 220, `${seedKey}:bg${i}`, { points: 14, roughness: 0.3 }),
    )
  }
  return paths
}
