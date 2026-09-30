import type { CameraState, Viewport } from "@/lib/spatial/camera"
import { worldToScreen } from "@/lib/spatial/camera"
import type { WorldCompany } from "./types"

// Company Traversal（Task 14 §9–§13/§58–§64）：公司沿横向空间分布，
// 用户移动的是 world camera（不是 carousel 翻页）；active company 由
// 视口焦点区中心决定；snap 是轻磁吸不是锁定。纯函数，确定性。

export const TRAVERSAL = {
  /** 公司之间的水平间距（世界坐标） */
  SPACING_X: 620,
  /** 焦点判定：距离视口中心该世界距离内视为候选 */
  FOCUS_RADIUS: 200,
  /** 轻磁吸：进入该距离后向中心吸附的最大比例 */
  SNAP_RADIUS: 120,
  SNAP_STRENGTH: 0.35,
} as const

export interface CompanyPosition {
  stockCode: string
  x: number
  y: number
}

/**
 * My World 布局（§58/§60）：按稳定索引横向排列；
 * recent 靠前（更靠近原点），saved 固定在同一序列中（不单独成环）。
 * 同一列表重复进入结果一致。
 */
export function computeWorldLayout(companies: WorldCompany[]): CompanyPosition[] {
  return companies.map((c, index) => ({
    stockCode: c.stockCode,
    x: index * TRAVERSAL.SPACING_X,
    y: 0,
  }))
}

/** active company（§11）：世界坐标中最接近视口中心者（无候选返回 null） */
export function activeCompanyAtCenter(
  camera: CameraState,
  viewport: Viewport,
  positions: CompanyPosition[],
  focusRadius = TRAVERSAL.FOCUS_RADIUS,
): string | null {
  if (positions.length === 0) return null
  let best: { stockCode: string; distance: number } | null = null
  for (const p of positions) {
    const screen = worldToScreen(camera, viewport, p.x, p.y)
    const distance = Math.hypot(screen.x - viewport.width / 2, screen.y - viewport.height / 2)
    if (!best || distance < best.distance) best = { stockCode: p.stockCode, distance }
  }
  if (!best) return null
  return best.distance <= focusRadius ? best.stockCode : null
}

/** 最近邻（§10）：previous / current / next，全部是空间中的真实对象 */
export function neighborCompanies(
  activeCode: string | null,
  companies: WorldCompany[],
): { previous: WorldCompany | null; current: WorldCompany | null; next: WorldCompany | null } {
  if (companies.length === 0) return { previous: null, current: null, next: null }
  const index = activeCode ? companies.findIndex((c) => c.stockCode === activeCode) : 0
  const i = index >= 0 ? index : 0
  return {
    previous: i > 0 ? companies[i - 1] : null,
    current: companies[i] ?? null,
    next: i + 1 < companies.length ? companies[i + 1] : null,
  }
}

/**
 * 轻磁吸（§63）：当公司接近视口中心时给出建议 camera.x（最多吸附 35% 距离），
 * 不锁定、不改变用户主动的横滑。
 */
export function magneticSnapTarget(
  camera: CameraState,
  viewport: Viewport,
  positions: CompanyPosition[],
): number | null {
  let best: { x: number; distance: number } | null = null
  for (const p of positions) {
    const screen = worldToScreen(camera, viewport, p.x, p.y)
    const distance = Math.abs(screen.x - viewport.width / 2)
    if (distance <= TRAVERSAL.SNAP_RADIUS && (!best || distance < best.distance)) {
      best = { x: p.x, distance }
    }
  }
  if (!best) return null
  return camera.x + (best.x - camera.x) * TRAVERSAL.SNAP_STRENGTH
}

/** 键盘 ← → 穿行（§62）：移到上一个/下一个公司的 camera.x（世界坐标） */
export function stepCompanyTarget(
  activeCode: string | null,
  companies: WorldCompany[],
  positions: CompanyPosition[],
  direction: -1 | 1,
): number | null {
  const { previous, next } = neighborCompanies(activeCode, companies)
  const target = direction === -1 ? previous : next
  if (!target) return null
  return positions.find((p) => p.stockCode === target.stockCode)?.x ?? null
}

/**
 * 视觉层级（§11/§65）：active 提高、邻居正常、远处只留名字。
 * 只表达"研究状态"（active/saved/最近），绝不表达股票好坏（§6）。
 */
export type CompanyVisualTier = "active" | "neighbor" | "distant"

export function companyVisualTier(
  stockCode: string,
  activeCode: string | null,
  companies: WorldCompany[],
): CompanyVisualTier {
  if (!activeCode) return "distant"
  const { previous, next } = neighborCompanies(activeCode, companies)
  if (stockCode === activeCode) return "active"
  if (stockCode === previous?.stockCode || stockCode === next?.stockCode) return "neighbor"
  return "distant"
}
