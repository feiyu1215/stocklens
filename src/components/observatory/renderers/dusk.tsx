"use client"

import type { ReactNode } from "react"

import { renderBackground, renderCompany, renderDimension, renderEvidenceField, renderSuggestion } from "./kit"
import type {
  CompanyRenderState,
  DimensionHandlers,
  DimensionRenderState,
  EvidenceFieldRenderState,
  RendererTokens,
  SuggestionHandlers,
  SuggestionRenderState,
  WorldRenderer,
} from "./types"

// DuskRenderer（Task 13 §5/§47）：第二 reference presentation（graphite #111419）。
// 与 Pearl 共用 contract 与全部交互；任何交互逻辑不得依赖主题。

export const DUSK_TOKENS: RendererTokens = {
  id: "dusk",
  background: "#111419",
  surface: "rgba(12,15,22,0.72)",
  surfaceBorder: "rgba(140,148,168,0.20)",
  textPrimary: "#F1F3F5",
  textSecondary: "#8C94A8",
  textFaint: "#6C7488",
  accent: "#45B8FF",
  fact: "#45B8FF",
  inference: "#9A7BFF",
  unknown: "#EAB95F",
  conflict: "#F06B5E",
  readingSurface: "#F3F0E8",
  readingInk: "#14161B",
  readingSecondary: "#676A70",
  light: false,
}

export const DuskRenderer: WorldRenderer = {
  id: "dusk",
  tokens: DUSK_TOKENS,
  renderBackground: (): ReactNode => renderBackground(DUSK_TOKENS),
  renderEvidenceField: (state: EvidenceFieldRenderState): ReactNode => renderEvidenceField(DUSK_TOKENS, state),
  renderCompany: (state: CompanyRenderState): ReactNode => renderCompany(DUSK_TOKENS, state),
  renderDimension: (state: DimensionRenderState, handlers: DimensionHandlers): ReactNode => renderDimension(DUSK_TOKENS, state, handlers),
  renderSuggestion: (state: SuggestionRenderState, handlers: SuggestionHandlers): ReactNode => renderSuggestion(DUSK_TOKENS, state, handlers),
}
