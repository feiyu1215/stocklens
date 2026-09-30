import type { ReactNode } from "react"

import type { Evidence } from "@/lib/evidence/types"
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

export interface WorldRenderer {
  id: string
  tokens: RendererTokens
  renderBackground(): ReactNode
  renderEvidenceField(state: EvidenceFieldRenderState): ReactNode
  renderCompany(state: CompanyRenderState): ReactNode
  renderDimension(state: DimensionRenderState, handlers: DimensionHandlers): ReactNode
  renderSuggestion(state: SuggestionRenderState, handlers: SuggestionHandlers): ReactNode
}
