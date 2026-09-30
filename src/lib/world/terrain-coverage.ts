// Terrain coverage 映射（Task 15.1 §14–§19）——纯函数，不 import 任何 renderer/React。
//
// World 必须表现 Research Coverage（§14），不是股票质量（§19 严禁 positive→高山 /
// negative→低谷 / 好→绿 / 坏→红）。本模块是「研究覆盖度 → 地形表现」的唯一映射：
// renderer 只消费这里的输出，不得自行定义另一套（与 detail.ts 同一纪律）。

import type { ResearchDimension } from "@/lib/research/dimension-schema"
import type { CameraState, Viewport } from "@/lib/spatial/camera"
import { worldToScreen } from "@/lib/spatial/camera"

export type RegionContour = "closed" | "partialDashed" | "openFog"

export interface RegionCoverageSpec {
  /** 轮廓形态：READY 闭合 / PARTIAL 半开虚线 / UNKNOWN 未闭合雾区（§15–§17） */
  contour: RegionContour
  /** 内部地形结构数（等高内圈）：覆盖越充分结构越多 */
  ringCount: number
  /** UNKNOWN → fog（§17） */
  fog: boolean
  /** CONFLICT → 小断裂线（§18：small fracture，禁止大红裂缝） */
  fracture: boolean
  /** 采样点（landmark）密度 0–1：由证据覆盖度决定 */
  landmarkDensity: number
}

/**
 * Region 覆盖度表现（§14–§18）。
 * status 决定轮廓与结构；conflictCount>0 只追加小 fracture，不改整体形态。
 */
export function regionCoverageSpec(
  dimension: Pick<ResearchDimension, "status" | "evidenceIds">,
  conflictCount = 0,
): RegionCoverageSpec {
  const evidenceCount = dimension.evidenceIds.length
  if (dimension.status === "unknown") {
    return { contour: "openFog", ringCount: 0, fog: true, fracture: false, landmarkDensity: 0.18 }
  }
  if (dimension.status === "partial") {
    return {
      contour: "partialDashed",
      ringCount: 1,
      fog: false,
      fracture: conflictCount > 0,
      landmarkDensity: evidenceCount > 0 ? 0.65 : 0.3,
    }
  }
  return {
    contour: "closed",
    ringCount: 3,
    fog: false,
    fracture: conflictCount > 0,
    landmarkDensity: 1,
  }
}

/** 每个 Region 的采样点上限（§77：全场显式节点 12–20，按 region 数分摊并封顶） */
export function regionLandmarkBudget(spec: RegionCoverageSpec, regionCount: number, fieldBudget = 16): number {
  const base = Math.max(3, Math.ceil(fieldBudget / Math.max(regionCount, 1)))
  return Math.max(1, Math.round(base * spec.landmarkDensity))
}

// ---------- Territory（§6/§9–§10） ----------

export interface TerritoryLayoutPoint {
  dimensionId: string
  x: number
  y: number
  /** 视觉半径（世界坐标） */
  radius: number
}

export interface TerritoryEnvelope {
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
}

/**
 * Company = Entire Territory（§6）：由全部 region 外包络推导整片地形。
 * 确定性（只依赖布局）；留 18% 边缘过渡带（§10 允许 valley/gap/transition zone）。
 */
export function territoryEnvelope(points: TerritoryLayoutPoint[]): TerritoryEnvelope | null {
  if (points.length === 0) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const maxRadius = Math.max(...points.map((p) => p.radius))
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
  return {
    centerX,
    centerY,
    radiusX: (Math.max(...xs) - Math.min(...xs)) / 2 + maxRadius * 1.18,
    radiusY: ((Math.max(...ys) - Math.min(...ys)) / 2 + maxRadius * 1.18) * 0.78,
  }
}

// ---------- Morph（§28–§43） ----------

export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

/** ease-in-out（morph 进度曲线，cubic-bezier 等价的纯函数版） */
export function easeInOut(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1)
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2
}

export function interpolateRect(a: ScreenRect, b: ScreenRect, t: number): ScreenRect {
  const k = easeInOut(t)
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    width: a.width + (b.width - a.width) * k,
    height: a.height + (b.height - a.height) * k,
  }
}

/**
 * Region 的屏幕矩形（morph 源，Frame 1）。
 * 输入为该 region 的世界布局与相机；输出为屏幕坐标（MorphSurface 直接可用）。
 */
export function morphRectFor(
  layout: { x: number; y: number; radius: number },
  camera: CameraState,
  viewport: Viewport,
): ScreenRect {
  const screen = worldToScreen(camera, viewport, layout.x, layout.y)
  const r = layout.radius * camera.scale
  return { x: screen.x - r, y: screen.y - r * 0.78, width: r * 2, height: r * 2 * 0.78 * 1.28 }
}

/** 阅读面目标矩形（morph 终点）：全屏减去顶部 chrome */
export function readingRectFor(viewport: Viewport, topChrome = 56): ScreenRect {
  return { x: 0, y: topChrome, width: viewport.width, height: viewport.height - topChrome }
}

/**
 * 反向 morph（§40–§43）：semantic 事件 → morph 方向。
 * 面包屑点击公司段 = 阅读面收缩回 region（collapse），不是换页。
 */
export function reverseMorphForEvent(event: { type: string }): {
  direction: "collapse" | "none"
  endScene: "SPACE_OVERVIEW" | null
} {
  if (event.type === "back" || event.type === "zoom_out" || event.type === "select_company") {
    return { direction: "collapse", endScene: "SPACE_OVERVIEW" }
  }
  return { direction: "none", endScene: null }
}

// ---------- 时序（§71–§73） ----------

/** 全部单位 ms；范围来自 Spec §71，测试锁定区间 */
export const TERRAIN_MOTION = {
  regionHover: 150, // 120–180
  regionExpanded: 300, // 240–360
  regionToReading: 600, // 500–750
  evidenceExpand: 340, // 280–420
  reverse: 520, // 相近或略快
  /** §72：任何核心动作不得让用户等待超过该阈值 */
  PRODUCTIVITY_THRESHOLD_MS: 900,
} as const

/** captureSlow 采样辅助：真实交互、真实渲染，仅放大时长便于逐帧截图（STATUS 已披露） */
export function motionScaleForQuery(query: string | null): number {
  return query === "1" ? 5 : 1
}

// ---------- Suggestion = Unexplored Region（§20–§26） ----------

export interface UnexploredSpec {
  tag: string
  baseRadius: number
  hoverRadius: number
}

export function suggestionUnexploredSpec(): UnexploredSpec {
  return { tag: "UNEXPLORED", baseRadius: 62, hoverRadius: 88 }
}
