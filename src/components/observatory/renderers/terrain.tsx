"use client"

import { Fragment, type ReactNode } from "react"

import {
  regionCoverageSpec,
  regionLandmarkBudget,
  suggestionUnexploredSpec,
  territoryEnvelope,
  interpolateRect,
  easeInOut,
  type ScreenRect,
} from "@/lib/world/terrain-coverage"
import {
  computeRegionGeometry,
  contourPath,
  contourRings,
  evidenceSamplePoints,
  fogMaskPath,
  fracturePath,
  openContourPath,
  territoryContourPath,
  territoryGeometry,
} from "@/lib/world/terrain-geometry"
import { renderBackground, renderDimension as renderDimensionKit } from "./kit"
import type {
  CompanyRenderState,
  DimensionHandlers,
  DimensionRenderState,
  EvidenceFieldRenderState,
  MorphOverlayState,
  RendererTokens,
  SuggestionHandlers,
  SuggestionRenderState,
  WorldMapRenderState,
  WorldRenderer,
} from "./types"

// TerrainRenderer（Task 14 §15–§35 + Task 15.1 §5–§43）：
// Terrain 本身就是 Company Research Information Architecture ——
// Company = 整片 Territory（§6）；Dimension = Region（面积/边界/内部结构/采样点，§8–§9）；
// Evidence = Region 内 sampling landmark（§11–§13）；UNKNOWN = 未探索雾区（§17）；
// Suggestion = Territory 边缘 Unexplored Region（§20–§26）；
// Region → Reading 为 semantic morph（边界 + label 连续，§28–§43）。
// 非地图、无 GIS、无 3D 引擎；视觉映射只存在于本文件 + terrain-coverage/terrain-geometry（纯函数）。

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
const TERRITORY_FILL = "rgba(252,251,248,0.55)"

/** region 视觉半径（世界坐标）——与 renderTerrainField 的 layoutScale 保持同一口径 */
export function regionVisualRadius(width: number, evidenceCount: number): number {
  const richness = Math.min(evidenceCount / 8, 1)
  return (74 + richness * 26) * (width ? Math.max(width / 176, 0.85) : 1)
}

/** sampling landmark：按真实证据类型绘制（§12），绝不虚构（§69） */
function SamplingLandmark({
  x,
  y,
  type,
  signal,
  color,
  opacity,
}: {
  x: number
  y: number
  type: string
  signal: string
  color: string
  opacity: number
}) {
  if (type === "unknown") {
    return (
      <circle cx={x} cy={y} r={6} fill="none" stroke={color} strokeWidth={1} strokeDasharray="2 3" opacity={opacity} />
    )
  }
  if (type === "inference" && signal === "conflict") {
    return (
      <g opacity={opacity}>
        <line x1={x - 4.5} y1={y - 4.5} x2={x + 4.5} y2={y + 4.5} stroke={color} strokeWidth={1.2} />
        <line x1={x - 4.5} y1={y + 4.5} x2={x + 4.5} y2={y - 4.5} stroke={color} strokeWidth={1.2} />
      </g>
    )
  }
  if (type === "inference") {
    return (
      <g opacity={opacity}>
        <circle cx={x} cy={y} r={4.4} fill="none" stroke={color} strokeWidth={1.3} />
        <circle cx={x} cy={y} r={1.6} fill={color} />
      </g>
    )
  }
  return <circle cx={x} cy={y} r={3} fill={color} opacity={opacity} />
}

/**
 * Company Research Terrain（Task 15.1 §6–§18）：
 * 一整片 Territory → 各 Region（coverage 形态）→ Region 内采样点。
 * 交互仍由 DOM button 承担（可访问性 §76），SVG path 是 hit target（§75）。
 */
function renderTerrainField(state: EvidenceFieldRenderState): ReactNode {
  const layouts = state.dimensionLayouts ?? []
  const evidenceById = new Map(state.evidence.map((e) => [e.evidenceId, e] as const))
  const conflictsByDimension = new Map<string, number>()
  for (const e of state.evidence) {
    if (e.signal !== "conflict") continue
    conflictsByDimension.set(e.dimension, (conflictsByDimension.get(e.dimension) ?? 0) + 1)
  }
  const envelope = territoryEnvelope(
    layouts.map(({ dimension, x, y, width }) => ({
      dimensionId: dimension.dimensionId,
      x,
      y,
      radius: regionVisualRadius(width, dimension.evidenceIds.length),
    })),
  )
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        width={2600}
        height={1500}
        viewBox="-1300 -750 2600 1500"
      >
        <defs>
          {layouts.map(({ dimension }) => {
            const spec = regionCoverageSpec(dimension, conflictsByDimension.get(dimension.label) ?? 0)
            if (!spec.fog) return null
            return (
              <radialGradient key={dimension.dimensionId} id={`terrain-fog-${dimension.dimensionId}`}>
                <stop offset="0%" stopColor={TERRAIN_TOKENS.unknown} stopOpacity={0.16} />
                <stop offset="70%" stopColor={TERRAIN_TOKENS.unknown} stopOpacity={0.07} />
                <stop offset="100%" stopColor={TERRAIN_TOKENS.unknown} stopOpacity={0} />
              </radialGradient>
            )
          })}
        </defs>

        {/* 一整片 Company Territory（§6/§9–§10）：region 共享这片空间，不是六座小岛 */}
        {envelope && (
          <g>
            <path
              d={territoryContourPath(envelope, `territory:${layouts.map((l) => l.dimension.dimensionId).join("|")}`)}
              fill={TERRITORY_FILL}
              stroke={CONTOUR}
              strokeWidth={1.2}
              opacity={0.9}
            />
            {[0.86, 0.7].map((k, i) => (
              <path
                key={k}
                d={territoryContourPath(
                  { ...envelope, radiusX: envelope.radiusX * k, radiusY: envelope.radiusY * k },
                  `territory:ring${i}:${layouts.map((l) => l.dimension.dimensionId).join("|")}`,
                )}
                fill="none"
                stroke={CONTOUR_SOFT}
                strokeWidth={0.7}
                opacity={0.65}
              />
            ))}
          </g>
        )}

        {layouts.map(({ dimension, x, y, width }) => {
          const conflictCount = conflictsByDimension.get(dimension.label) ?? 0
          const spec = regionCoverageSpec(dimension, conflictCount)
          const geometry = computeRegionGeometry(dimension, { x, y }, width ? Math.max(width / 176, 0.85) : 1)
          const highlighted = state.highlightedDimensionId === dimension.label
          const dimmed = state.highlightedDimensionId !== null && !highlighted
          const inlineSelected = state.inlinePeekDimensionId === dimension.dimensionId
          const marqueeSelected = state.selectedDimensionId === dimension.dimensionId
          const landmarks = evidenceSamplePoints(
            { x, y },
            geometry.path ? regionVisualRadius(width, dimension.evidenceIds.length) : 80,
            dimension.evidenceIds,
            regionLandmarkBudget(spec, layouts.length, state.nodeBudget ?? 16),
          )
          return (
            <g
              key={dimension.dimensionId}
              opacity={dimmed ? 0.18 : 1}
              style={{
                transition: "opacity 200ms ease-out, transform 300ms cubic-bezier(0.22,1,0.36,1)",
                transformBox: "fill-box",
                transformOrigin: "center",
                transform: inlineSelected ? "scale(1.8)" : marqueeSelected ? "scale(1.14)" : "scale(1)",
              }}
            >
              {/* UNKNOWN fog（§17）：软雾区 + 未闭合轮廓 */}
              {spec.fog && (
                <path
                  d={fogMaskPath({ x, y }, regionVisualRadius(width, dimension.evidenceIds.length), dimension.dimensionId)}
                  fill={`url(#terrain-fog-${dimension.dimensionId})`}
                />
              )}
              <path
                d={spec.contour === "openFog" ? openContourPath({ x, y }, regionVisualRadius(width, dimension.evidenceIds.length), dimension.dimensionId) : geometry.path}
                fill={spec.fog ? "none" : REGION_FILL}
                stroke={spec.contour === "openFog" ? TERRAIN_TOKENS.unknown : spec.contour === "partialDashed" ? CONTOUR : CONTOUR}
                strokeWidth={spec.contour === "openFog" ? 1.3 : 1.6}
                strokeDasharray={spec.contour === "partialDashed" ? "10 4" : spec.contour === "openFog" ? "5 5" : undefined}
                style={{ pointerEvents: "auto", cursor: "pointer" }}
                onPointerEnter={() => state.onRegionPointerEnter?.(dimension.dimensionId)}
                onPointerLeave={() => state.onRegionPointerLeave?.()}
                onClick={(e) => {
                  e.stopPropagation()
                  state.onRegionClick?.(dimension.dimensionId)
                }}
              />
              {/* 内部地形结构：覆盖越充分，等高内圈越多（§15–§16） */}
              {(spec.ringCount > 0
                ? contourRings({ x, y }, regionVisualRadius(width, dimension.evidenceIds.length), dimension.dimensionId, spec.ringCount)
                : []
              ).map((ring, i) => (
                <path key={i} d={ring} fill="none" stroke={CONTOUR_SOFT} strokeWidth={0.7} opacity={0.8} />
              ))}
              {/* CONFLICT 小断裂（§18）：受控尺寸，非警报 */}
              {spec.fracture && (
                <path
                  d={fracturePath({ x, y: y + regionVisualRadius(width, dimension.evidenceIds.length) * 0.34 }, regionVisualRadius(width, dimension.evidenceIds.length), `${dimension.dimensionId}:fracture`)}
                  fill="none"
                  stroke={TERRAIN_TOKENS.conflict}
                  strokeWidth={1.1}
                  opacity={0.75}
                />
              )}
              {/* Evidence → Region 内 sampling landmark（§11–§13）：hover 增强，其余退后 */}
              {landmarks.map((lm) => {
                const evidence = evidenceById.get(lm.evidenceId)
                if (!evidence) return null
                const color =
                  evidence.type === "inference" && evidence.signal === "conflict"
                    ? TERRAIN_TOKENS.conflict
                    : evidence.type === "inference"
                      ? TERRAIN_TOKENS.inference
                      : evidence.type === "unknown"
                        ? TERRAIN_TOKENS.unknown
                        : TERRAIN_TOKENS.fact
                return (
                  <g key={lm.evidenceId}>
                    {evidence.type === "inference" && evidence.signal !== "conflict" && (
                      <line
                        x1={x}
                        y1={y}
                        x2={lm.point.x}
                        y2={lm.point.y}
                        stroke={color}
                        strokeWidth={0.6}
                        opacity={highlighted ? 0.55 : 0.28}
                      />
                    )}
                    <SamplingLandmark
                      x={lm.point.x}
                      y={lm.point.y}
                      type={evidence.type}
                      signal={evidence.signal}
                      color={color}
                      opacity={highlighted ? 1 : 0.62}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      {/* 场内散点层只对非 terrain 有意义：terrain 的证据已归属 Region 采样点（§11），
          保留全局 edge/labels 会在 Territory 外画无归属的点 —— terrain 不再叠加全局场 */}
    </>
  )
}

/** Company = 地图标题（Task 15.1 §7）：删除大圆球 Core，Territory 本身就是公司 */
function renderTerrainCompany(state: CompanyRenderState): ReactNode {
  return (
    <div className="relative flex flex-col items-center text-center" style={{ width: 300 }}>
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 320,
          height: 150,
          background: "radial-gradient(closest-side, rgba(246,245,241,0.95) 40%, rgba(246,245,241,0) 100%)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center">
        <div
          className="font-mono text-[9.5px] tracking-[0.3em]"
          style={{ color: TERRAIN_TOKENS.textFaint }}
        >
          RESEARCH TERRITORY
        </div>
        <div className="mt-1.5 text-[21px] font-medium tracking-wide" style={{ color: TERRAIN_TOKENS.textPrimary }}>
          {state.stockName}
        </div>
        <div className="mt-1 font-mono text-[11.5px]" style={{ color: TERRAIN_TOKENS.textSecondary }}>
          {state.stockCode}
        </div>
        {state.industryName && (
          <div className="mt-0.5 text-[11px]" style={{ color: TERRAIN_TOKENS.textFaint }}>
            {state.industryName}
          </div>
        )}
        {state.focusZoneActive && (
          <div className="mt-2 h-px w-10" aria-hidden style={{ background: TERRAIN_TOKENS.accent, opacity: 0.6 }} />
        )}
      </div>
    </div>
  )
}

/** Terrain dimension：kit 的对象表达 + inline region expansion（§29–§31） */
function renderTerrainDimension(state: DimensionRenderState, handlers: DimensionHandlers): ReactNode {
  if (!state.inlinePeek) return renderDimensionKit(TERRAIN_TOKENS, state, handlers)
  // Expanded Region interior（Task 15.1 §29–§31）：region 放大，内容成为 region 内部纸面；
  // 标题即键盘代理 button（Tab/Enter 语义与原对象一致 §76），点击标题收起展开。
  return (
    <div
      key={state.dimension.dimensionId}
      data-region-panel={state.dimension.dimensionId}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute left-0 top-0 z-10"
      style={{
        transform: `translate(calc(-50% + ${state.layout.x}px), calc(-50% + ${state.layout.y}px))`,
        width: 238,
        background: "rgba(252,251,248,0.94)",
        border: `1px solid ${CONTOUR_SOFT}`,
        borderRadius: 4,
        boxShadow: "0 4px 16px rgba(24,26,32,0.06)",
        padding: "10px 12px 8px",
        animation: "terrain-region-expand 300ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <button
        type="button"
        data-dimension-id={state.dimension.dimensionId}
        aria-label={`收起 ${state.dimension.label} 概要`}
        onClick={handlers.onClick}
        className="flex w-full items-baseline justify-between gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FB0]/60"
      >
        <span className="text-[14.5px] font-medium" style={{ color: TERRAIN_TOKENS.readingInk, wordBreak: "keep-all" }}>
          {state.dimension.label}
        </span>
        <span className="shrink-0 font-mono text-[9.5px]" style={{ color: TERRAIN_TOKENS.textFaint }}>
          {state.dimension.evidenceIds.length} evidence
        </span>
      </button>
      {state.expandedSummary && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TERRAIN_TOKENS.readingInk }}>
          {state.expandedSummary}
        </p>
      )}
      {state.expandedClaims && state.expandedClaims.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {state.expandedClaims.slice(0, 3).map((c, i) => (
            <li key={i} className="text-[10.5px] leading-snug" style={{ color: TERRAIN_TOKENS.readingSecondary }}>
              · {c}
            </li>
          ))}
        </ul>
      )}
      <div
        className="mt-2 flex items-center justify-between border-t pt-1.5 font-mono text-[9.5px]"
        style={{ borderColor: TERRAIN_TOKENS.surfaceBorder, color: TERRAIN_TOKENS.textFaint }}
      >
        <span>
          {state.claimCount} claims
          {state.conflictCount > 0 ? ` · ${state.conflictCount} conflict` : ""}
          {state.dimension.status === "unknown" ? " · incomplete" : ""}
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            handlers.onExplore?.(state.dimension.dimensionId)
          }}
          className="font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FB0]/60"
          style={{ color: TERRAIN_TOKENS.accent }}
        >
          Explore region →
        </button>
      </div>
    </div>
  )
}

/** Suggestion = Territory 边缘的 Unexplored Region（Task 15.1 §20–§26），不是矩形卡 */
function renderTerrainSuggestion(state: SuggestionRenderState, handlers: SuggestionHandlers): ReactNode {
  const spec = suggestionUnexploredSpec()
  const radius = state.expanded || state.dragging ? spec.hoverRadius : spec.baseRadius
  return (
    <div
      key={state.label}
      data-suggestion-label={state.label}
      className="absolute left-0 top-0 select-none"
      style={{
        transform: `translate(calc(-50% + ${state.x}px), calc(-50% + ${state.y}px))`,
        opacity: state.dragging ? 0.95 : state.expanded ? 1 : 0.78,
        cursor: state.dragging ? "grabbing" : "grab",
        transition: state.dragging ? "none" : "opacity 260ms ease-out",
      }}
      onPointerDown={handlers.onPointerDown}
      onMouseEnter={handlers.onMouseEnter}
      onMouseLeave={handlers.onMouseLeave}
    >
      <svg
        aria-hidden
        width={radius * 2.6}
        height={radius * 1.9}
        viewBox={`${-radius * 1.3} ${-radius * 0.95} ${radius * 2.6} ${radius * 1.9}`}
        className="pointer-events-none absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
        style={{ overflow: "visible" }}
      >
        <path
          d={fogMaskPath({ x: 0, y: 0 }, radius, `suggestion:${state.label}`)}
          fill="rgba(169,119,42,0.10)"
          stroke={state.overAddZone ? TERRAIN_TOKENS.accent : TERRAIN_TOKENS.unknown}
          strokeWidth={state.overAddZone ? 1.4 : 1.1}
          strokeDasharray="5 5"
          opacity={0.9}
        />
        {(state.expanded ? [0.72] : []).map((k) => (
          <path
            key={k}
            d={fogMaskPath({ x: 0, y: 0 }, radius * k, `suggestion:${state.label}:ring`)}
            fill="none"
            stroke={TERRAIN_TOKENS.unknown}
            strokeWidth={0.7}
            opacity={0.5}
          />
        ))}
      </svg>
      <div className="relative z-10 flex flex-col items-center text-center" style={{ padding: "18px 20px" }}>
        <div className="font-mono text-[9px] tracking-[0.22em]" style={{ color: TERRAIN_TOKENS.unknown }}>
          {state.overAddZone ? "RELEASE TO ADD" : state.mode === "adding" ? "RESOLVING" : spec.tag}
        </div>
        <div
          className="mt-1 text-[14px] leading-snug"
          style={{ color: TERRAIN_TOKENS.textPrimary, wordBreak: "keep-all" }}
        >
          {state.label}
        </div>
        {state.expanded && (
          <div style={{ animation: "terrain-region-expand 260ms ease-out" }}>
            <div className="mt-1 max-w-[200px] text-[10.5px] leading-relaxed" style={{ color: TERRAIN_TOKENS.textFaint }}>
              {state.rationale}
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-4 text-[11.5px]">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  handlers.onAdd(e)
                }}
                style={{ color: TERRAIN_TOKENS.accent }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FB0]/60"
              >
                Explore +
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  handlers.onDismiss(e)
                }}
                style={{ color: TERRAIN_TOKENS.textFaint }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FB0]/60"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {!state.expanded && state.mode !== "adding" && (
          <div className="mt-0.5 font-mono text-[9.5px]" style={{ color: TERRAIN_TOKENS.textFaint }}>
            Explore +
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Semantic Morph overlay（Task 15.1 §28–§43） ----------

function morphSourceRect(cx: number, cy: number, radius: number): ScreenRect {
  return { x: cx - radius, y: cy - radius * 0.78, width: radius * 2, height: radius * 2 * 0.78 * 1.28 }
}

/**
 * Terrain morph：region 边界与 label 双连续（§37）。
 * Frame 1 region 放大 → Frame 2 地形后退/边界变面 → Frame 3 label 飞至标题位 →
 * Frame 4 claims reveal（children 内部 stagger）。只用 scale/translate/border-radius（§38）。
 */
function renderTerrainMorphOverlay(state: MorphOverlayState): ReactNode {
  const t = easeInOut(state.progress)
  const source = morphSourceRect(state.source.cx, state.source.cy, state.source.radius)
  const current = interpolateRect(source, state.target, t)
  const radiusCurrent = current.width / 2
  // label 连续（§34）：region 标签位 → 标题位
  const labelFrom = { x: state.source.cx, y: state.source.cy - state.source.radius * 0.18, size: 17 }
  const labelTo = { x: state.target.x + 262, y: state.target.y + 44, size: 22 }
  const label = {
    x: labelFrom.x + (labelTo.x - labelFrom.x) * t,
    y: labelFrom.y + (labelTo.y - labelFrom.y) * t,
    size: labelFrom.size + (labelTo.size - labelFrom.size) * t,
  }
  const labelOpacity = state.phase === "expanding" ? (t < 0.82 ? 1 : Math.max(0, 1 - (t - 0.82) / 0.13)) : 0
  // collapsing：内容随收缩淡出（t 1→0），veil 同步退场让 Terrain 回归（§43）
  const contentOpacity =
    state.phase === "expanding"
      ? Math.min(1, Math.max(0.12, (t - 0.45) / 0.45))
      : state.phase === "settled"
        ? 1
        : Math.max(0, t)
  const veil = t * 0.9
  const collapsing = state.phase === "collapsing"
  return (
    <div className="absolute inset-0 z-20" data-morph-phase={state.phase}>
      {/* Frame 2：周围 Terrain 后退（veil），Reading Surface 从 region 边界生长 */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "#EFEEE9", opacity: veil, transition: "none" }}
      />
      <div
        data-morph-surface
        className="absolute overflow-hidden"
        style={{
          left: current.x,
          top: current.y,
          width: current.width,
          height: current.height,
          borderRadius: `${Math.min(50, radiusCurrent / 8)}px / ${Math.min(50, radiusCurrent / 10)}px`,
          background: TERRAIN_TOKENS.readingSurface,
          border: `1px solid ${CONTOUR}`,
          boxShadow: t > 0.4 ? "0 18px 60px rgba(24,26,32,0.12)" : "none",
        }}
      >
        <div style={{ opacity: contentOpacity, height: "100%" }}>{state.children}</div>
      </div>
      {/* 边界连续（§33/§37）：region 轮廓随形缩小淡出，boundary → surface */}
      {!collapsing && t < 0.92 && (
        <svg
          aria-hidden
          className="pointer-events-none absolute left-0 top-0"
          width={state.target.x + state.target.width + 80}
          height={state.target.y + state.target.height + 80}
        >
          <path
            d={contourPath(
              { x: current.x + current.width / 2, y: current.y + current.height / 2 },
              radiusCurrent,
              state.source.seed,
              { points: 14, roughness: Math.max(0.02, 0.16 * (1 - t)) },
            )}
            fill="none"
            stroke={CONTOUR}
            strokeWidth={1.4}
            opacity={0.85 * (1 - t)}
          />
        </svg>
      )}
      {/* Frame 3：label 从 Terrain 标签 morph 到 Research Surface 标题（§34） */}
      {labelOpacity > 0 && (
        <div
          data-morph-label={state.source.label}
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-medium"
          style={{
            left: label.x,
            top: label.y,
            fontSize: label.size,
            color: TERRAIN_TOKENS.readingInk,
            opacity: labelOpacity,
          }}
        >
          {state.source.label}
        </div>
      )}
    </div>
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
  // 单击 region 的展开概览呈现在 region 内部（Task 15.1 §29–§31）
  capabilities: { inlineRegionPeek: true },
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
  renderCompany: (state: CompanyRenderState): ReactNode => renderTerrainCompany(state),
  renderDimension: (state: DimensionRenderState, handlers: DimensionHandlers): ReactNode =>
    renderTerrainDimension(state, handlers),
  renderSuggestion: (state: SuggestionRenderState, handlers: SuggestionHandlers): ReactNode =>
    renderTerrainSuggestion(state, handlers),
  renderMorphOverlay: (state: MorphOverlayState): ReactNode => renderTerrainMorphOverlay(state),
  renderWorld: (state: WorldMapRenderState): ReactNode => <TerrainWorld state={state} />,
}

export { renderBackground }
