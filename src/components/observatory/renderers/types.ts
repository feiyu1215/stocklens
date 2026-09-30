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
}

export interface SuggestionRenderState {
  label: string
  rationale: string
  x: number
  y: number
  expanded: boolean
  dragging: boolean
  overAddZone: boolean
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

export interface WorldRenderer {
  id: WorldRendererId
  tokens: RendererTokens
  renderBackground(): ReactNode
  renderEvidenceField(state: EvidenceFieldRenderState): ReactNode
  renderCompany(state: CompanyRenderState): ReactNode
  renderDimension(state: DimensionRenderState, handlers: DimensionHandlers): ReactNode
  renderSuggestion(state: SuggestionRenderState, handlers: SuggestionHandlers): ReactNode
  /** My World 世界层（可选能力；Pearl/Dusk 提供简化版本，Terrain/Cosmos 完整实现） */
  renderWorld?(state: WorldMapRenderState): ReactNode
}
