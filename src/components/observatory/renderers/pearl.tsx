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

// PearlFieldRenderer（Task 13 §3–§4/§46）：中性 reference renderer。
// 浅暖灰 editorial / scientific instrument，不是最终唯一主题。

export const PEARL_TOKENS: RendererTokens = {
  id: "pearl",
  background: "#EFEEE9",
  surface: "rgba(255,255,255,0.88)",
  surfaceBorder: "rgba(60,64,74,0.16)",
  textPrimary: "#1B1D22",
  textSecondary: "#5C6068",
  textFaint: "#8A8E97",
  accent: "#2F6FB0",
  fact: "#2F7FB8",
  inference: "#6E56C8",
  unknown: "#A9772A",
  conflict: "#C0503F",
  readingSurface: "#F3F0E8",
  readingInk: "#14161B",
  readingSecondary: "#676A70",
  light: true,
}

export const PearlFieldRenderer: WorldRenderer = {
  id: "pearl",
  tokens: PEARL_TOKENS,
  renderBackground: (): ReactNode => renderBackground(PEARL_TOKENS),
  renderEvidenceField: (state: EvidenceFieldRenderState): ReactNode => renderEvidenceField(PEARL_TOKENS, state),
  renderCompany: (state: CompanyRenderState): ReactNode => renderCompany(PEARL_TOKENS, state),
  renderDimension: (state: DimensionRenderState, handlers: DimensionHandlers): ReactNode =>
    renderDimension(PEARL_TOKENS, state, handlers),
  renderSuggestion: (state: SuggestionRenderState, handlers: SuggestionHandlers): ReactNode => renderSuggestion(PEARL_TOKENS, state, handlers),
}
