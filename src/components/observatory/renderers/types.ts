import type { ReactNode } from "react"

import type { Evidence } from "@/lib/evidence/types"
import type { WorldCompany, WorldRendererId } from "@/lib/world/types"
import type { ObjectDetailLevel } from "@/lib/experience/detail"
import type { ResearchDimension } from "@/lib/research/dimension-schema"
import type { DimensionLayout } from "@/lib/presentation/constellation-layout"

// WorldRenderer Contract（Task 13 §2/§43–§44）：
// ResearchWorkspace 只与这些概念交互，不得包含任何 Cosmos / Terrain / Pasture 等分支。
// Renderer 决定「世界长什么样」，Interaction Model 决定「世界如何被操作」。
//
// 允许使用的空间语义属性（§44）：priority / status / evidenceCount / conflictCount /
// unknownCount / origin / isSelected / isFocused / isParked —— 视觉映射只在这里发生。

export interface RendererTokens {
  id: string
  background: string
  surface: string
  surfaceBorder: string
  textPrimary: string
  textSecondary: string
  textFaint: string
  accent: string
  fact: string
  inference: string
  unknown: string
  conflict: string
  /** 读取表面（Reading Surface）配色 */
  readingSurface: string
  readingInk: string
  readingSecondary: string
  /** 是否浅色世界（仅影响渲染，不影响任何交互逻辑，§5） */
  light: boolean
}

export interface DimensionRenderState {
  dimension: ResearchDimension
  layout: DimensionLayout
  claimCount: number
  conflictCount: number
  unknownCount: number
  selected: boolean
  focused: boolean
  dimmed: boolean
  hovered: boolean
  /** Task 15：信息密度（Experience Model 决定，Renderer 只消费） */
  detailLevel: ObjectDetailLevel
  /** §49 局部降级：证据可用但 AI 解释暂缺 */
  degraded: boolean
  /** expanded 密度下的摘要与 top claims（§89） */
  expandedSummary?: string
  expandedClaims?: string[]
  /** 拖动中的实时位置覆盖（世界坐标） */
  dragPosition?: { x: number; y: number }
  /** Task 15.1 §29–§30：inline region expansion（renderer 声明 capabilities.inlineRegionPeek 时，
      单击 region 的展开概览呈现在 region 内部，workspace 不再渲染独立 peek 卡片） */
  inlinePeek?: boolean
}

export interface SuggestionRenderState {
  label: string
  rationale: string
  x: number
  y: number
  expanded: boolean
  dragging: boolean
  overAddZone: boolean
  /** Task 15.1 §23–§26：unexplored（待探索）／adding（已提交、region seed 解析中） */
  mode?: "unexplored" | "adding"
}

export interface EvidenceFieldRenderState {
  evidence: Evidence[]
  highlightedDimensionId: string | null
  hoveredEvidenceId: string | null
  /** Task 15 §92–§93：证据节点预算随 camera scale（12–16） */
  nodeBudget?: number
  /** Task 15 §92：近距离显示 labels / links */
  showLabels?: boolean
  /** Terrain 渲染区域几何所需的世界坐标（其它 renderer 忽略） */
  dimensionLayouts?: { dimension: ResearchDimension; x: number; y: number; width: number }[]
  /** Task 15.1：选中 region（Region 扩大 §30）与 inline 展开的 region id（terrain 消费，其它忽略） */
  selectedDimensionId?: string | null
  inlinePeekDimensionId?: string | null
  /** Task 15 §37–§39：Terrain Region 自身作为 hit target（DOM button 仍作可访问性代理） */
  onRegionPointerEnter?: (dimensionId: string) => void
  onRegionPointerLeave?: () => void
  onRegionClick?: (dimensionId: string) => void
}

export interface CompanyRenderState {
  stockCode: string
  stockName: string
  industryName?: string
  /** Focus Zone 激活时的轻微强调（空间级聚焦，不进入阅读模式，§36） */
  focusZoneActive: boolean
}

/** 交互 handlers：由 InteractionController 注入，Renderer 只负责挂载（§2/§43） */
export interface DimensionHandlers {
  onPointerDown: (e: import("react").PointerEvent) => void
  onClick: (e: import("react").MouseEvent) => void
  onMouseEnter: (e: import("react").MouseEvent) => void
  onMouseLeave: () => void
  /** Task 15.1 §31：显式 Explore region →（触发 semantic morph） */
  onExplore?: (dimensionId: string) => void
}

export interface SuggestionHandlers {
  onPointerDown: (e: import("react").PointerEvent) => void
  onMouseEnter: (e: import("react").MouseEvent) => void
  onMouseLeave: () => void
  onAdd: (e: import("react").MouseEvent) => void
  onDismiss: (e: import("react").MouseEvent) => void
}

/** My World 世界层渲染状态（Task 14 §19–§22/§58–§65） */
export interface WorldMapRenderState {
  companies: WorldCompany[]
  positions: { stockCode: string; x: number; y: number }[]
  activeCode: string | null
  /** 每个公司的视觉层级（active/neighbor/distant）；只表达研究状态 */
  tierOf: (stockCode: string) => "active" | "neighbor" | "distant"
  /** 进入研究（点击/Enter 时由 Interaction 层调用，Renderer 仅触发） */
  onEnter: (stockCode: string) => void
  onToggleSaved: (stockCode: string) => void
}

// ---------- Semantic Morph（Task 15.1 §28–§43） ----------

/** morph 源对象（屏幕坐标，由 workspace 经布局+相机推导） */
export interface MorphSourceObject {
  dimensionId: string
  label: string
  /** region 中心（屏幕坐标） */
  cx: number
  cy: number
  /** region 视觉半径（屏幕坐标） */
  radius: number
  /** 轮廓种子（renderer 复现同一形状，保证边界连续 §37） */
  seed: string
}

export type MorphPhase = "expanding" | "settled" | "collapsing"

export interface MorphOverlayState {
  phase: MorphPhase
  /** 0–1（expanding/collapsing 各自的进度） */
  progress: number
  source: MorphSourceObject
  /** 阅读面目标矩形（屏幕坐标） */
  target: { x: number; y: number; width: number; height: number }
  tokens: RendererTokens
  /** 阅读面内容（MorphSurface 注入；renderer 只负责承载与边界/label 连续） */
  children: ReactNode
}

/** Renderer 能力声明（workspace 据此调整交互呈现，不出现 renderer id 分支） */
export interface RendererCapabilities {
  /** 单击 region 的展开概览呈现在 region 内部（terrain） */
  inlineRegionPeek?: boolean
}

export interface WorldRenderer {
  id: WorldRendererId
  tokens: RendererTokens
  capabilities?: RendererCapabilities
  renderBackground(): ReactNode
  renderEvidenceField(state: EvidenceFieldRenderState): ReactNode
  renderCompany(state: CompanyRenderState): ReactNode
  renderDimension(state: DimensionRenderState, handlers: DimensionHandlers): ReactNode
  renderSuggestion(state: SuggestionRenderState, handlers: SuggestionHandlers): ReactNode
  /** My World 世界层（可选能力；Pearl/Dusk 提供简化版本，Terrain/Cosmos 完整实现） */
  renderWorld?(state: WorldMapRenderState): ReactNode
  /** Semantic Morph 承载（可选；未声明时 MorphSurface 退化为简单过渡） */
  renderMorphOverlay?(state: MorphOverlayState): ReactNode
}
