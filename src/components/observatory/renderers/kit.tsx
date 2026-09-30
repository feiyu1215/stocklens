"use client"

import type { ReactNode } from "react"

import {
  computeAddNodeLayout,
  computeFieldNodes,
  computeSuggestionLayout,
  selectFieldEvidence,
} from "@/lib/presentation/constellation-layout"
import { claimTypeLabel, anchorGlyph } from "../theme"
import type {
  CompanyRenderState,
  DimensionHandlers,
  DimensionRenderState,
  EvidenceFieldRenderState,
  RendererTokens,
  SuggestionHandlers,
  SuggestionRenderState,
} from "./types"

// 共享渲染 kit：Pearl / Dusk 复用同一批 primitive，仅 token 不同。
// 交互（拖拽/选区/Peek）全部由 ResearchWorkspace 通过 props 注入，
// Renderer 只负责"长什么样"。

export const FIELD_SIZE = { width: 1560, height: 1000 } as const

export function renderEvidenceField(
  tokens: RendererTokens,
  state: EvidenceFieldRenderState,
): ReactNode {
  const selected = selectFieldEvidence(state.evidence)
  const nodes = computeFieldNodes(selected, FIELD_SIZE.width, FIELD_SIZE.height)
  const byId = new Map(selected.map((e) => [e.evidenceId, e] as const))
  const edges: { key: string; x1: number; y1: number; x2: number; y2: number; color: string; conflict: boolean }[] = []
  const positionById = new Map(nodes.map((n) => [n.evidenceId, n] as const))
  for (const e of selected) {
    if (e.basedOn.length === 0) continue
    const target = positionById.get(e.evidenceId)
    if (!target) continue
    for (const ref of e.basedOn) {
      const source = positionById.get(ref)
      if (!source) continue
      const color =
        e.type === "inference" && e.signal === "conflict"
          ? tokens.conflict
          : e.type === "inference"
            ? tokens.inference
            : e.type === "unknown"
              ? tokens.unknown
              : tokens.fact
      edges.push({
        key: `${e.evidenceId}->${ref}`,
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        color,
        conflict: e.signal === "conflict",
      })
    }
  }
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      width={FIELD_SIZE.width}
      height={FIELD_SIZE.height}
      viewBox={`${-FIELD_SIZE.width / 2} ${-FIELD_SIZE.height / 2} ${FIELD_SIZE.width} ${FIELD_SIZE.height}`}
    >
      {/* Task 15 §92：远距离只画冲突/强关系边，近距离才画全部 links */}
      {edges
        .filter((edge) => (state.showLabels ?? false) || edge.conflict)
        .map((edge) => (
          <line
            key={edge.key}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke={edge.color}
            strokeWidth={edge.conflict ? 1.4 : 0.85}
            strokeDasharray={edge.conflict ? "4 3" : tokens.light ? "2 4" : undefined}
            opacity={tokens.light ? 0.5 : 0.6}
          />
        ))}
      {nodes.map((node) => {
        const e = byId.get(node.evidenceId)
        if (!e) return null
        const dimmed = state.highlightedDimensionId !== null && e.dimension !== state.highlightedDimensionId
        const color =
          e.type === "inference" && e.signal === "conflict"
            ? tokens.conflict
            : e.type === "inference"
              ? tokens.inference
              : e.type === "unknown"
                ? tokens.unknown
                : tokens.fact
        const fade = dimmed ? 0.1 : 1
        if (e.type === "unknown") {
          return (
            <circle
              key={node.evidenceId}
              cx={node.x}
              cy={node.y}
              r={14}
              fill="none"
              stroke={color}
              strokeWidth={1.2}
              strokeDasharray="3 4"
              opacity={dimmed ? 0.1 : 0.85}
              style={{ transition: "opacity 200ms ease-out" }}
            />
          )
        }
        if (e.type === "inference") {
          return (
            <g key={node.evidenceId} opacity={fade} style={{ transition: "opacity 200ms ease-out" }}>
              <circle
                cx={node.x}
                cy={node.y}
                r={10}
                fill={tokens.light ? "#FFFFFF" : "rgba(10,12,16,0.9)"}
                stroke={color}
                strokeWidth={e.signal === "conflict" ? 2.6 : 1.8}
                strokeDasharray={e.signal === "conflict" ? "5 3" : undefined}
              />
              <circle cx={node.x} cy={node.y} r={3.4} fill={color} />
            </g>
          )
        }
        return (
          <circle
            key={node.evidenceId}
            cx={node.x}
            cy={node.y}
            r={5}
            fill={color}
            opacity={dimmed ? 0.12 : 1}
            style={{ transition: "opacity 200ms ease-out" }}
          />
        )
      })}
    </svg>
  )
}

export function renderCompany(tokens: RendererTokens, state: CompanyRenderState): ReactNode {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }}>
      {[300, 258, 224].map((d, i) => (
        <span
          key={d}
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: d,
            height: d,
            border: `1px solid ${
              tokens.light
                ? `rgba(60,64,74,${i === 0 ? 0.07 : 0.12})`
                : `rgba(140,148,168,${i === 0 ? 0.08 : 0.14})`
            }`,
          }}
        />
      ))}
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: 208,
          height: 208,
          background: tokens.light
            ? "radial-gradient(circle at 50% 42%, rgba(255,255,255,0.96) 0%, rgba(238,236,229,0.92) 62%, rgba(228,226,219,0.9) 100%)"
            : "radial-gradient(circle at 50% 42%, rgba(69,184,255,0.16) 0%, rgba(154,123,255,0.06) 46%, rgba(14,17,24,0.92) 72%)",
          border: `1px solid ${state.focusZoneActive ? tokens.accent : tokens.surfaceBorder}`,
          boxShadow: tokens.light
            ? "0 10px 40px rgba(24,26,32,0.10), 0 0 0 8px rgba(24,26,32,0.02)"
            : "0 0 70px rgba(69,184,255,0.10) inset",
          transition: "border-color 300ms ease-out, box-shadow 300ms ease-out",
        }}
      />
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="text-[22px] font-medium tracking-wide" style={{ color: tokens.textPrimary }}>
          {state.stockName}
        </div>
        <div className="mt-1.5 font-mono text-[12px]" style={{ color: tokens.textSecondary }}>
          {state.stockCode}
        </div>
        {state.industryName && (
          <div className="mt-1 text-[12px]" style={{ color: tokens.textFaint }}>
            {state.industryName}
          </div>
        )}
      </div>
    </div>
  )
}

export function renderDimension(
  tokens: RendererTokens,
  state: DimensionRenderState,
  handlers: DimensionHandlers,
): ReactNode {
  const { dimension, layout } = state
  const isUnknown = dimension.status === "unknown"
  const isPartial = dimension.status === "partial"
  const detail = state.detailLevel
  const x = state.dragPosition?.x ?? layout.x
  const y = state.dragPosition?.y ?? layout.y
  const border = state.selected
    ? `1.5px solid ${tokens.accent}`
    : isUnknown
      ? `1px dashed ${tokens.unknown}`
      : isPartial
        ? `1px solid ${tokens.light ? "rgba(120,96,200,0.35)" : "rgba(154,123,255,0.30)"}`
        : `1px solid ${tokens.surfaceBorder}`
  return (
    <button
      key={dimension.dimensionId}
      type="button"
      data-dimension-id={dimension.dimensionId}
      aria-label={`研究维度：${dimension.label}`}
      onPointerDown={handlers.onPointerDown}
      onClick={handlers.onClick}
      onMouseEnter={handlers.onMouseEnter}
      onMouseLeave={handlers.onMouseLeave}
      onFocus={(e) => handlers.onMouseEnter(e as unknown as import("react").MouseEvent)}
      onBlur={handlers.onMouseLeave}
      data-detail-level={detail}
      className={`absolute left-0 top-0 cursor-grab text-left outline-none focus-visible:ring-2 active:cursor-grabbing ${
        detail === "micro" ? "rounded-lg px-2.5 py-1.5" : "px-3 py-2"
      }`}
      style={{
        width: detail === "micro" ? Math.min(layout.width, 132) : layout.width,
        minHeight: detail === "micro" ? undefined : layout.height,
        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${
          (state.dimmed ? 0.94 : 1) * layout.scale
        })`,
        opacity: state.dimmed ? 0.1 : 1,
        // Task 15 §36/§46：默认更轻薄（label + contour + focus ring），不是 card wall；
        // hover/selected/expanded 之外不给实心背景
        // §36/§K：只有 hover / selected / expanded 才聚合成「面」；idle 是对象（刻度 + 文本），不是卡片
        border:
          detail === "micro"
            ? isUnknown
              ? `1px dashed ${tokens.unknown}`
              : `1px solid ${tokens.surfaceBorder}`
            : state.hovered || state.selected || detail === "expanded"
              ? border
              : "none",
        borderRadius: 3,
        background:
          state.hovered || state.selected || detail === "expanded"
            ? tokens.light
              ? "rgba(255,255,255,0.9)"
              : isUnknown
                ? "rgba(12,15,22,0.55)"
                : "rgba(12,15,22,0.78)"
            : "transparent",
        backdropFilter:
          detail === "micro" || !(state.hovered || state.selected || detail === "expanded")
            ? undefined
            : "blur(3px)",
        boxShadow:
          detail === "micro"
            ? "none"
            : state.hovered || detail === "expanded"
              ? tokens.light
                ? "0 6px 22px rgba(24,26,32,0.10)"
                : "0 0 30px rgba(69,184,255,0.14)"
              : "none",
        pointerEvents: state.dimmed ? "none" : "auto",
        transition: state.dragPosition
          ? "opacity 200ms ease-out, box-shadow 200ms ease-out"
          : "opacity 200ms ease-out, box-shadow 200ms ease-out, transform 460ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {detail !== "micro" && (
        <span
          aria-hidden
          className="mb-1.5 block"
          style={{
            width: 16,
            height: 2,
            background: isUnknown
              ? `repeating-linear-gradient(90deg, ${tokens.unknown} 0 3px, transparent 3px 5px)`
              : isPartial
                ? `linear-gradient(90deg, ${tokens.unknown} 0%, ${tokens.accent} 100%)`
                : tokens.accent,
            opacity: 0.85,
          }}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <span
          className="text-[16px] leading-snug"
          style={{ color: tokens.textPrimary, wordBreak: "keep-all", overflowWrap: "normal" }}
        >
          {dimension.label}
        </span>
        {state.selected && (
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: tokens.accent }} aria-hidden />
        )}
      </div>
      {/* compact：subtle status；expanded：summary + top claims（§13/§14/§89） */}
      {detail !== "micro" && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px]" style={{ color: tokens.textSecondary }}>
          <span>{state.dimension.evidenceIds.length} evidence</span>
          {state.conflictCount > 0 && <span style={{ color: tokens.conflict }}>{state.conflictCount} conflict</span>}
          {isUnknown && <span style={{ color: tokens.unknown }}>incomplete</span>}
          {state.degraded && (
            <span style={{ color: tokens.textFaint }}>AI interpretation unavailable</span>
          )}
        </div>
      )}
      {detail === "expanded" && state.expandedSummary && (
        <div className="mt-2 border-t pt-1.5 text-[12px] leading-relaxed" style={{ borderColor: tokens.surfaceBorder, color: tokens.textSecondary }}>
          {state.expandedSummary}
          {state.expandedClaims && state.expandedClaims.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {state.expandedClaims.slice(0, 3).map((c, i) => (
                <li key={i}>· {c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </button>
  )
}

export function renderSuggestion(
  tokens: RendererTokens,
  state: SuggestionRenderState,
  handlers: SuggestionHandlers,
): ReactNode {
  return (
    <div
      key={state.label}
      data-suggestion-label={state.label}
      className="absolute left-0 top-0 select-none"
      style={{
        transform: `translate(calc(-50% + ${state.x}px), calc(-50% + ${state.y}px))`,
        width: state.expanded || state.dragging ? 236 : 190,
        opacity: state.dragging ? 0.92 : state.expanded ? 1 : 0.72,
        cursor: state.dragging ? "grabbing" : "grab",
        transition: state.dragging ? "none" : "width 260ms cubic-bezier(0.22,1,0.36,1), opacity 260ms ease-out",
      }}
      onPointerDown={handlers.onPointerDown}
      onMouseEnter={handlers.onMouseEnter}
      onMouseLeave={handlers.onMouseLeave}
    >
      <div
        className="rounded-xl border border-dashed px-3 py-2.5"
        style={{
          borderColor: state.overAddZone ? tokens.accent : tokens.surfaceBorder,
          background: tokens.light ? "rgba(255,255,255,0.72)" : "rgba(12,15,22,0.5)",
          backdropFilter: "blur(3px)",
        }}
      >
        <div className="font-mono text-[9.5px] tracking-[0.18em]" style={{ color: tokens.textFaint }}>
          {state.overAddZone ? "RELEASE TO ADD" : "SUGGESTED"}
        </div>
        <div className="mt-1 text-[14.5px] leading-snug" style={{ color: tokens.textPrimary, wordBreak: "keep-all" }}>
          {state.label}
        </div>
        {state.expanded && (
          <>
            <div className="mt-1 text-[11px] leading-relaxed" style={{ color: tokens.textFaint }}>
              {state.rationale}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[12px]">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  handlers.onAdd(e)
                }}
                style={{ color: tokens.accent }}
              >
                ＋ Add to research
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  handlers.onDismiss(e)
                }}
                style={{ color: tokens.textFaint }}
              >
                Dismiss
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function renderBackground(tokens: RendererTokens): ReactNode {
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background: tokens.light
          ? "radial-gradient(1100px 620px at 47% 49%, #F6F5F1 0%, #EFEEE9 62%, #E9E7E1 100%)"
          : "radial-gradient(1200px 640px at 47% 49%, #14171F 0%, #111419 68%, #0D1014 100%)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: tokens.light
            ? "radial-gradient(rgba(60,64,74,0.10) 1px, transparent 1px)"
            : "radial-gradient(rgba(140,148,168,0.08) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(circle at 47% 49%, black 28%, transparent 76%)",
          WebkitMaskImage: "radial-gradient(circle at 47% 49%, black 28%, transparent 76%)",
        }}
      />
    </div>
  )
}

export { computeAddNodeLayout, computeSuggestionLayout, claimTypeLabel, anchorGlyph }
