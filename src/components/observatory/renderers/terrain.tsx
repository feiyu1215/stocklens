"use client"

import type { ReactNode } from "react"

import { computeRegionGeometry, territoryGeometry } from "@/lib/world/terrain-geometry"
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

// TerrainRenderer（Task 14 §15–§35）：Generative Research Terrain。
// editorial topography / architectural contour / scientific landscape ——
// 非地图、无 GIS、无绿色草地、无 RPG 感；视觉映射只存在于本文件。

export const TERRAIN_TOKENS: RendererTokens = {
  id: "terrain",
  background: "#EFEEE9",
  surface: "rgba(255,255,255,0.86)",
  surfaceBorder: "rgba(60,64,74,0.18)",
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

const CONTOUR = "#A9A59A"
const CONTOUR_SOFT = "#C4C0B5"
const REGION_FILL = "rgba(255,255,255,0.72)"

/**
 * Company Research Terrain（§25–§31）：在证据层之前绘制研究区域地形，
 * 之后由 kit.renderDimension 叠加 label/交互（真实 button，保持可访问性 §81）。
 */
function renderTerrainField(state: EvidenceFieldRenderState): ReactNode {
  const layouts = state.dimensionLayouts ?? []
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        width={2400}
        height={1400}
        viewBox="-1200 -700 2400 1400"
      >
        {layouts.map(({ dimension, x, y, width }) => {
          const geometry = computeRegionGeometry(dimension, { x, y }, width ? Math.max(width / 176, 0.85) : 1)
          const dimmed =
            state.highlightedDimensionId !== null && state.highlightedDimensionId !== dimension.dimensionId
          const isUnknown = dimension.status === "unknown"
          const isPartial = dimension.status === "partial"
          return (
            <g
              key={dimension.dimensionId}
              opacity={dimmed ? 0.18 : 1}
              style={{ transition: "opacity 200ms ease-out" }}
            >
              <path
                d={geometry.path}
                fill={REGION_FILL}
                stroke={isUnknown ? TERRAIN_TOKENS.unknown : CONTOUR}
                strokeWidth={isUnknown ? 1.4 : 1.6}
                strokeDasharray={isUnknown ? "5 5" : isPartial ? "10 4" : undefined}
                style={{ pointerEvents: "auto", cursor: "pointer" }}
                onPointerEnter={() => state.onRegionPointerEnter?.(dimension.dimensionId)}
                onPointerLeave={() => state.onRegionPointerLeave?.()}
                onClick={(e) => {
                  e.stopPropagation()
                  state.onRegionClick?.(dimension.dimensionId)
                }}
              />
              {geometry.rings.map((ring, i) => (
                <path key={i} d={ring} fill="none" stroke={CONTOUR_SOFT} strokeWidth={0.7} opacity={0.8} />
              ))}
            </g>
          )
        })}
      </svg>
      {renderEvidenceField(TERRAIN_TOKENS, state)}
    </>
  )
}

/** My World Territories（§19–§22/§58–§65） */
function TerrainWorld({ state }: { state: WorldMapRenderState }): ReactNode {
  return (
    <>
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 9000,
          height: 3000,
          background: "radial-gradient(2400px 1400px at 50% 50%, #F6F5F1 0%, #EFEEE9 62%, #E7E5DE 100%)",
        }}
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
          const geometry = territoryGeometry(p.stockCode, p, company.exploredDimensionCount)
          return (
            <g key={p.stockCode} opacity={tier === "active" ? 1 : tier === "neighbor" ? 0.78 : 0.5}>
              <path
                d={geometry.path}
                fill={tier === "active" ? "rgba(255,255,255,0.72)" : REGION_FILL}
                stroke={CONTOUR}
                strokeWidth={tier === "active" ? 1.6 : 1.1}
              />
              {geometry.rings.map((ring, i) => (
                <path key={i} d={ring} fill="none" stroke={CONTOUR_SOFT} strokeWidth={0.7} opacity={0.85} />
              ))}
              {company.isSaved && (
                <g>
                  <line
                    x1={p.x}
                    y1={p.y - geometry.radius * 0.6}
                    x2={p.x}
                    y2={p.y - geometry.radius * 0.6 - 12}
                    stroke={TERRAIN_TOKENS.accent}
                    strokeWidth={1.1}
                  />
                  <circle cx={p.x} cy={p.y - geometry.radius * 0.6 - 16} r={3.2} fill={TERRAIN_TOKENS.accent} />
                </g>
              )}
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
            style={{ transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px))` }}
          >
            <button
              type="button"
              data-world-company={p.stockCode}
              aria-label={`公司：${company.stockName}${tier === "active" ? "（当前焦点）" : ""}`}
              onClick={(e) => {
                e.stopPropagation()
                state.onEnter(p.stockCode)
              }}
              className="outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FB0]/70"
            >
              {/* 标签落在等高线上会互相切割：用径向 scrim 把文字从地形里「抬」出来（§K 可读性） */}
              <span
                className="block px-5 py-2.5"
                style={{
                  background: `radial-gradient(closest-side, rgba(246,245,241,0.94) 62%, rgba(246,245,241,0) 100%)`,
                }}
              >
                <span
                  className="block text-[17px] tracking-wide"
                  style={{
                    color: TERRAIN_TOKENS.textPrimary,
                    fontWeight: tier === "active" ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  {company.stockName}
                </span>
                {tier !== "distant" && (
                  <span
                    className="mt-1 block font-mono text-[11px]"
                    style={{ color: TERRAIN_TOKENS.textFaint, whiteSpace: "nowrap" }}
                  >
                    {company.stockCode}
                    {company.industryName ? ` · ${company.industryName}` : ""}
                  </span>
                )}
                {tier === "active" && (
                  <span
                    className="mt-1.5 block text-[12px]"
                    style={{ color: TERRAIN_TOKENS.accent, whiteSpace: "nowrap" }}
                  >
                    Enter research →
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                state.onToggleSaved(p.stockCode)
              }}
              aria-label={company.isSaved ? `取消收藏 ${company.stockName}` : `收藏 ${company.stockName}`}
              className="mt-1 text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FB0]/70"
              style={{ color: company.isSaved ? TERRAIN_TOKENS.accent : TERRAIN_TOKENS.textFaint }}
            >
              {company.isSaved ? "● saved" : "○ save"}
            </button>
          </div>
        )
      })}
    </>
  )
}

export const TerrainRenderer: WorldRenderer = {
  id: "terrain",
  tokens: TERRAIN_TOKENS,
  renderBackground: (): ReactNode => (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background: "radial-gradient(1200px 700px at 47% 50%, #F6F5F1 0%, #EFEEE9 62%, #E7E5DE 100%)",
      }}
    />
  ),
  renderEvidenceField: (state: EvidenceFieldRenderState): ReactNode => renderTerrainField(state),
  renderCompany: (state: CompanyRenderState): ReactNode => renderCompany(TERRAIN_TOKENS, state),
  renderDimension: (state: DimensionRenderState, handlers: DimensionHandlers): ReactNode =>
    renderDimension(TERRAIN_TOKENS, state, handlers),
  renderSuggestion: (state: SuggestionRenderState, handlers: SuggestionHandlers): ReactNode =>
    renderSuggestion(TERRAIN_TOKENS, state, handlers),
  renderWorld: (state: WorldMapRenderState): ReactNode => <TerrainWorld state={state} />,
}

export { renderBackground }
