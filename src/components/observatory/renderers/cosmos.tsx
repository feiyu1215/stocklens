"use client"

import type { ReactNode } from "react"

import { computeRegionGeometry } from "@/lib/world/terrain-geometry"
import { renderBackground, renderCompany, renderDimension, renderEvidenceField, renderSuggestion } from "./kit"
import type {
  CompanyRenderState,
  DimensionHandlers,
  DimensionRenderState,
  EvidenceFieldRenderState,
  RendererTokens,
  SuggestionHandlers,
  SuggestionRenderState,
  WorldMapRenderState,
  WorldRenderer,
} from "./types"

// CosmosRenderer（Task 14 §47–§54）：Cosmos Lite —— 仅用于证明
// 「同一 ResearchWorkspace 完全换世界，Interaction Physics 不需修改」。
// 视觉：abstract orbital information system —— 无写实星球、无随机星空、
// 无星云/镜头光斑/cyberpunk 紫。graphite 深底 + 克制的空间点。

export const COSMOS_TOKENS: RendererTokens = {
  id: "cosmos",
  background: "#0F1216",
  surface: "rgba(18,22,30,0.82)",
  surfaceBorder: "rgba(150,158,175,0.22)",
  textPrimary: "#E8EBF0",
  textSecondary: "#9AA2B4",
  textFaint: "#6E7686",
  accent: "#5FA8D8",
  fact: "#5FA8D8",
  inference: "#9A8BE0",
  unknown: "#C99A4E",
  conflict: "#D97A6A",
  readingSurface: "#F3F0E8",
  readingInk: "#14161B",
  readingSecondary: "#676A70",
  light: false,
}

/** 轨道层（§49–§52）：Dimension 映射为 orbital research body；
 *  UNKNOWN → 缺失轨道段；CONFLICT → 交叉轨道。 */
function renderCosmosField(state: EvidenceFieldRenderState): ReactNode {
  const layouts = state.dimensionLayouts ?? []
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      width={2400}
      height={1400}
      viewBox="-1200 -700 2400 1400"
    >
      {layouts.map(({ dimension, x, y }) => {
        const radius = Math.hypot(x, y)
        const baseAngle = Math.atan2(y, x)
        const dimmed = state.highlightedDimensionId !== null && state.highlightedDimensionId !== dimension.dimensionId
        const isUnknown = dimension.status === "unknown"
        const hasConflict = state.evidence.some(
          (e) => dimension.evidenceIds.includes(e.evidenceId) && e.signal === "conflict",
        )
        const arcSpan = Math.min(0.5 + dimension.evidenceIds.length * 0.14, 1.4)
        const r0 = Math.max(radius - 46, 130)
        const r1 = radius + 46
        const p = (r: number, angle: number) => `${(Math.cos(angle) * r).toFixed(1)} ${(Math.sin(angle) * r).toFixed(1)}`
        const arc = `M ${p(r0, baseAngle - arcSpan)} A ${r0} ${r0} 0 0 1 ${p(r0, baseAngle + arcSpan)}`
        const arcOuter = `M ${p(r1, baseAngle - arcSpan)} A ${r1} ${r1} 0 0 1 ${p(r1, baseAngle + arcSpan)}`
        return (
          <g key={dimension.dimensionId} opacity={dimmed ? 0.15 : 1} style={{ transition: "opacity 200ms ease-out" }}>
            <path
              d={arc}
              fill="none"
              stroke={isUnknown ? COSMOS_TOKENS.unknown : COSMOS_TOKENS.accent}
              strokeWidth={isUnknown ? 1 : 1.4}
              strokeDasharray={isUnknown ? "6 8" : undefined}
              opacity={0.85}
            />
            <path
              d={arcOuter}
              fill="none"
              stroke={COSMOS_TOKENS.textFaint}
              strokeWidth={0.7}
              strokeDasharray="3 6"
              opacity={0.7}
            />
            {hasConflict && (
              <path
                d={`M ${p(radius, baseAngle - 0.9)} L ${p(radius + 54, baseAngle + 0.55)}`}
                stroke={COSMOS_TOKENS.conflict}
                strokeWidth={1.2}
                strokeDasharray="4 3"
                fill="none"
              />
            )}
            <circle cx={Math.cos(baseAngle) * radius} cy={Math.sin(baseAngle) * radius} r={5} fill={COSMOS_TOKENS.accent} opacity={isUnknown ? 0.45 : 0.95} />
          </g>
        )
      })}
      {/* 克制的空间点（非随机星空：稳定网格抖动） */}
      {Array.from({ length: 28 }, (_, i) => {
        const x = ((i * 137) % 2200) - 1100
        const y = (((i * 89) % 1200) - 600) * 0.8
        return <circle key={i} cx={x} cy={y} r={1.1} fill="#8A93A6" opacity={0.28} />
      })}
    </svg>
  )
}

/** My World：abstract central bodies（§48），无写实星球 */
function CosmosWorld({ state }: { state: WorldMapRenderState }): ReactNode {
  return (
    <>
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: 9000, height: 3000, background: COSMOS_TOKENS.background }}
      />
      <svg
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        width={6400}
        height={1600}
        viewBox="-3200 -800 6400 1600"
      >
        {state.positions.map((p) => {
          const company = state.companies.find((c) => c.stockCode === p.stockCode)
          if (!company) return null
          const tier = state.tierOf(p.stockCode)
          const v = computeRegionGeometry(
            {
              dimensionId: company.stockCode,
              label: company.stockName,
              researchQuestion: "",
              origin: "ai_initial",
              capabilityRefs: [],
              status: (company.exploredDimensionCount ?? 0) > 0 ? "ready" : "partial",
              rationale: "",
              priority: 1,
              evidenceIds: Array.from({ length: company.exploredDimensionCount ?? 0 }, (_, i) => `EV_${i}`),
              claimIds: [],
            },
            { x: p.x, y: p.y },
            0.9,
          )
          return (
            <g key={p.stockCode} opacity={tier === "active" ? 1 : tier === "neighbor" ? 0.7 : 0.42}>
              <circle cx={p.x} cy={p.y} r={74} fill="none" stroke={COSMOS_TOKENS.accent} strokeWidth={tier === "active" ? 1.6 : 1} />
              <circle cx={p.x} cy={p.y} r={52} fill="rgba(95,168,216,0.08)" stroke="none" />
              <circle cx={p.x} cy={p.y} r={26} fill={tier === "active" ? "rgba(95,168,216,0.22)" : "rgba(95,168,216,0.12)"} />
              <path d={v.path} fill="none" stroke={COSMOS_TOKENS.textFaint} strokeWidth={0.6} opacity={0.35} transform={`translate(${p.x}, ${p.y}) scale(0.42) translate(${-p.x}, ${-p.y})`} />
            </g>
          )
        })}
      </svg>

      {state.positions.map((p) => {
        const company = state.companies.find((c) => c.stockCode === p.stockCode)
        if (!company) return null
        const tier = state.tierOf(p.stockCode)
        return (
          <div
            key={p.stockCode}
            className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 text-center"
            style={{ transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y + 110}px))` }}
          >
            <button
              type="button"
              data-world-company={p.stockCode}
              aria-label={`公司：${company.stockName}${tier === "active" ? "（当前焦点）" : ""}`}
              onClick={(e) => {
                e.stopPropagation()
                state.onEnter(p.stockCode)
              }}
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#5FA8D8]/70"
            >
              <div className="text-[16px] tracking-wide" style={{ color: COSMOS_TOKENS.textPrimary, wordBreak: "keep-all" }}>
                {company.stockName}
              </div>
              {tier !== "distant" && (
                <div className="mt-1 font-mono text-[11px]" style={{ color: COSMOS_TOKENS.textFaint }}>
                  {company.stockCode}
                </div>
              )}
              {tier === "active" && (
                <div className="mt-1.5 text-[12px]" style={{ color: COSMOS_TOKENS.accent }}>
                  Enter research →
                </div>
              )}
            </button>
          </div>
        )
      })}
    </>
  )
}

export const CosmosRenderer: WorldRenderer = {
  id: "cosmos",
  tokens: COSMOS_TOKENS,
  renderBackground: (): ReactNode => <div aria-hidden className="absolute inset-0" style={{ background: COSMOS_TOKENS.background }} />,
  renderEvidenceField: (state: EvidenceFieldRenderState): ReactNode => renderCosmosField(state),
  renderCompany: (state: CompanyRenderState): ReactNode => renderCompany(COSMOS_TOKENS, state),
  renderDimension: (state: DimensionRenderState, handlers: DimensionHandlers): ReactNode =>
    renderDimension(COSMOS_TOKENS, state, handlers),
  renderSuggestion: (state: SuggestionRenderState, handlers: SuggestionHandlers): ReactNode =>
    renderSuggestion(COSMOS_TOKENS, state, handlers),
  renderWorld: (state: WorldMapRenderState): ReactNode => <CosmosWorld state={state} />,
}

export { renderBackground, renderEvidenceField }
