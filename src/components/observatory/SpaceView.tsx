"use client"

import { useEffect, useMemo, useState } from "react"

import type { Evidence } from "@/lib/evidence/types"
import type { ResearchDimension } from "@/lib/research/dimension-schema"
import { computeDimensionLayout, computeFieldNodes, selectFieldEvidence, LAYOUT_SPACE } from "@/lib/presentation/constellation-layout"
import { OBSERVATORY_COLORS, STATUS_LABEL, anchorGlyph, evidenceColor, type ResearchSpacePayload } from "./theme"

// Scene C｜Space Overview（Visual Spec §20–§26/§54–§65/§71–§76）：
// Company Core 居中 + 确定性 radial 维度对象 + Evidence Field（真实节点/边/unknown 虚线与 conflict 分裂笔画）
// + AI 建议 ghost 对象 + 「＋ Add research angle」节点。

const FIELD_W = 1500
const FIELD_H = 900

function EvidenceField({
  evidence,
  highlightedDimension,
  onNodeHover,
}: {
  evidence: Evidence[]
  highlightedDimension: string | null
  onNodeHover: (id: string | null) => void
}) {
  const selected = useMemo(() => selectFieldEvidence(evidence), [evidence])
  const nodes = useMemo(() => computeFieldNodes(selected, FIELD_W, FIELD_H), [selected])
  const byId = useMemo(() => new Map(selected.map((e) => [e.evidenceId, e] as const)), [selected])

  const edges = useMemo(() => {
    const positionById = new Map(nodes.map((n) => [n.evidenceId, n] as const))
    const lines: { key: string; x1: number; y1: number; x2: number; y2: number; color: string; conflict: boolean }[] = []
    for (const e of selected) {
      if (e.basedOn.length === 0) continue
      const target = positionById.get(e.evidenceId)
      if (!target) continue
      for (const ref of e.basedOn) {
        const source = positionById.get(ref)
        if (!source) continue
        lines.push({
          key: `${e.evidenceId}->${ref}`,
          x1: source.x,
          y1: source.y,
          x2: target.x,
          y2: target.y,
          color: evidenceColor(e),
          conflict: e.signal === "conflict",
        })
      }
    }
    return lines
  }, [selected, nodes])

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      width={FIELD_W}
      height={FIELD_H}
      viewBox={`${-FIELD_W / 2} ${-FIELD_H / 2} ${FIELD_W} ${FIELD_H}`}
      style={{ opacity: 0.9 }}
    >
      {edges.map((edge) => (
        <line
          key={edge.key}
          x1={edge.x1}
          y1={edge.y1}
          x2={edge.x2}
          y2={edge.y2}
          stroke={edge.color}
          strokeWidth={edge.conflict ? 1.4 : 0.7}
          strokeDasharray={edge.conflict ? "3 3" : undefined}
          opacity={0.5}
        />
      ))}
      {nodes.map((node) => {
        const e = byId.get(node.evidenceId)
        if (!e) return null
        const dimmed = highlightedDimension !== null && e.dimension !== highlightedDimension
        const color = evidenceColor(e)
        if (e.type === "unknown") {
          return (
            <circle
              key={node.evidenceId}
              cx={node.x}
              cy={node.y}
              r={13}
              fill="none"
              stroke={color}
              strokeWidth={1}
              strokeDasharray="2.5 3.5"
              opacity={dimmed ? 0.12 : 0.75}
              style={{ transition: "opacity 160ms ease-out" }}
            />
          )
        }
        if (e.type === "inference") {
          return (
            <g key={node.evidenceId} opacity={dimmed ? 0.12 : 0.95} style={{ transition: "opacity 160ms ease-out" }}>
              <circle
                onMouseEnter={() => onNodeHover(node.evidenceId)}
                onMouseLeave={() => onNodeHover(null)}
                cx={node.x}
                cy={node.y}
                r={9}
                fill="rgba(7,9,14,0.9)"
                stroke={color}
                strokeWidth={e.signal === "conflict" ? 2.4 : 1.6}
                strokeDasharray={e.signal === "conflict" ? "4 2.5" : undefined}
                className="pointer-events-auto"
              />
              <circle cx={node.x} cy={node.y} r={3} fill={color} />
            </g>
          )
        }
        return (
          <circle
            key={node.evidenceId}
            onMouseEnter={() => onNodeHover(node.evidenceId)}
            onMouseLeave={() => onNodeHover(null)}
            cx={node.x}
            cy={node.y}
            r={4.5}
            fill={color}
            opacity={dimmed ? 0.15 : 0.9}
            style={{ transition: "opacity 160ms ease-out", pointerEvents: "auto" }}
          />
        )
      })}
    </svg>
  )
}

function dimensionSummaryLine(dim: ResearchDimension, claims: ResearchSpacePayload["claims"]): string {
  const own = claims.filter((c) => c.dimensionId === dim.dimensionId)
  const conflict = own.find((c) => c.signal === "conflict")
  if (conflict) return conflict.text
  if (own.length > 0) return own[0].text
  if (dim.status === "unknown") return "当前证据不足以验证这一研究方向。"
  return dim.researchQuestion
}

export function SpaceView({
  space,
  selectedDimensionId,
  addLensOpen = false,
  onDimensionSelect,
  onAddDimension,
  onSuggestionAdd,
  onSuggestionDismiss,
  dismissedSuggestions,
  addingDimensionId,
  onOpenCommandLens,
}: {
  space: ResearchSpacePayload
  selectedDimensionId: string | null
  onDimensionSelect: (dimensionId: string) => void
  onAddDimension: () => void
  onSuggestionAdd: (label: string) => void
  onSuggestionDismiss: (label: string) => void
  dismissedSuggestions: string[]
  addingDimensionId: string | null
  onOpenCommandLens: () => void
  addLensOpen?: boolean
}) {
  const [hoveredDimension, setHoveredDimension] = useState<string | null>(null)
  const [hoveredEvidenceId, setHoveredEvidenceId] = useState<string | null>(null)
  const layout = useMemo(() => computeDimensionLayout(space.dimensions), [space.dimensions])
  const layoutById = useMemo(() => new Map(layout.map((l) => [l.dimensionId, l] as const)), [layout])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHoveredDimension(null)
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenCommandLens()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onOpenCommandLens])

  return (
    <div className="relative h-full w-full" aria-label="Research Space 总览">
      <EvidenceField
        evidence={space.evidence}
        highlightedDimension={hoveredDimension ?? (selectedDimensionId ? space.dimensions.find((d) => d.dimensionId === selectedDimensionId)?.label ?? null : null) as string | null}
        onNodeHover={setHoveredEvidenceId}
      />

      {/* Company Core */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div
          className="relative flex flex-col items-center justify-center rounded-full"
          style={{
            width: 200,
            height: 200,
            background: "radial-gradient(circle, rgba(69,184,255,0.10) 0%, rgba(14,17,24,0.9) 64%)",
            border: "1px solid rgba(140,148,168,0.16)",
            boxShadow: "0 0 60px rgba(69,184,255,0.08) inset",
          }}
        >
          <div className="text-[17px] font-medium tracking-wide text-[#F1F3F5]">{space.company.stockName}</div>
          <div className="mt-1 font-mono text-[12px] text-[#8C94A8]">{space.company.stockCode}</div>
          {space.company.industryName && (
            <div className="mt-1 text-[11px] text-[#5A6274]">{space.company.industryName}</div>
          )}
        </div>
      </div>

      {/* Dimension Objects（确定性 radial layout） */}
      {space.dimensions.map((dim) => {
        const l = layoutById.get(dim.dimensionId)
        if (!l) return null
        const ownClaims = space.claims.filter((c) => c.dimensionId === dim.dimensionId)
        const conflictCount = ownClaims.filter((c) => c.signal === "conflict").length
        const dimmed = hoveredDimension !== null && hoveredDimension !== dim.label
        const isUnknown = dim.status === "unknown"
        const isPartial = dim.status === "partial"
        return (
          <button
            key={dim.dimensionId}
            type="button"
            aria-label={`研究维度：${dim.label}（${STATUS_LABEL[dim.status]}，${dim.evidenceIds.length} 条证据）`}
            onMouseEnter={() => setHoveredDimension(dim.label)}
            onMouseLeave={() => setHoveredDimension(null)}
            onFocus={() => setHoveredDimension(dim.label)}
            onBlur={() => setHoveredDimension(null)}
            onClick={() => onDimensionSelect(dim.dimensionId)}
            className="absolute left-1/2 top-1/2 outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/70"
            style={{
              transform: `translate(calc(-50% + ${l.x}px), calc(-50% + ${l.y}px))`,
              width: l.size,
              opacity: dimmed ? 0.32 : 1,
              transition: "opacity 180ms ease-out, transform 420ms cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            <div
              className="rounded-2xl px-3.5 py-3 text-left backdrop-blur-sm"
              style={{
                border: isUnknown
                  ? "1px dashed rgba(234,185,95,0.55)"
                  : isPartial
                    ? "1px solid rgba(154,123,255,0.35)"
                    : "1px solid rgba(140,148,168,0.22)",
                background: isUnknown
                  ? "rgba(14,17,24,0.35)"
                  : isPartial
                    ? "linear-gradient(160deg, rgba(154,123,255,0.10), rgba(14,17,24,0.85))"
                    : "rgba(14,17,24,0.85)",
                boxShadow: hoveredDimension === dim.label ? "0 0 32px rgba(69,184,255,0.14)" : "none",
                transition: "box-shadow 180ms ease-out, border-color 180ms ease-out",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[#F1F3F5]">{dim.label}</span>
                {addingDimensionId === dim.dimensionId && (
                  <span className="animate-pulse text-[10px] text-[#45B8FF]">assembling…</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-[#8C94A8]">
                <span>{dim.evidenceIds.length} evidence</span>
                {conflictCount > 0 && <span style={{ color: OBSERVATORY_COLORS.conflict }}>{conflictCount} conflict</span>}
                {isUnknown && <span style={{ color: OBSERVATORY_COLORS.unknown }}>evidence incomplete</span>}
              </div>
              {hoveredDimension === dim.label && (
                <div className="mt-1.5 border-t border-white/5 pt-1.5 text-[10px] leading-relaxed text-[#8C94A8]">
                  {dimensionSummaryLine(dim, space.claims).slice(0, 46)}…
                </div>
              )}
            </div>
          </button>
        )
      })}

      {/* AI Suggested（ghost objects，不自动加入；Add Lens 打开时让位） */}
      <div
        className="absolute bottom-24 right-8 flex w-[230px] flex-col gap-2 transition-opacity"
        style={{ opacity: addLensOpen ? 0 : 1, pointerEvents: addLensOpen ? "none" : "auto" }}
      >
        {space.suggestions
          .filter((s) => !dismissedSuggestions.includes(s.label))
          .slice(0, 3)
          .map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-dashed px-3 py-2.5"
            style={{
              borderColor: "rgba(140,148,168,0.28)",
              background: "rgba(14,17,24,0.72)",
              backdropFilter: "blur(4px)",
              opacity: 0.92,
            }}
          >
            <div className="text-[10px] uppercase tracking-wider text-[#5A6274]">Suggested by StockLens</div>
            <div className="mt-1 text-[12px] text-[#F1F3F5]">{s.label}</div>
            <div className="mt-0.5 text-[10px] leading-relaxed text-[#8C94A8]">{s.rationale}</div>
            <div className="mt-1.5 flex gap-3 text-[11px]">
              <button
                type="button"
                onClick={() => onSuggestionAdd(s.label)}
                className="text-[#45B8FF] transition hover:text-[#7ED0FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
              >
                ＋ Add to research
              </button>
              <button
                type="button"
                onClick={() => onSuggestionDismiss(s.label)}
                className="text-[#5A6274] transition hover:text-[#8C94A8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ＋ Add research angle */}
      <button
        type="button"
        onClick={onAddDimension}
        aria-label="Add research angle"
        className="group absolute left-1/2 top-1/2 outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/70"
        style={{ transform: `translate(calc(-50% + ${LAYOUT_SPACE.coreRadius + 90}px), calc(-50% - ${LAYOUT_SPACE.coreRadius + 30}px))` }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-[#3A4156] text-[18px] text-[#5A6274] transition group-hover:border-[#45B8FF]/60 group-hover:text-[#45B8FF]">
          ＋
        </span>
        <span className="mt-1 block text-[10px] text-[#5A6274] opacity-0 transition group-hover:opacity-100">
          Add research angle
        </span>
      </button>

      {/* hover evidence 预览条 */}
      {hoveredEvidenceId && (
        <div
          className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg border px-3 py-1.5 font-mono text-[11px]"
          style={{ borderColor: "rgba(140,148,168,0.2)", background: "rgba(14,17,24,0.9)", color: "#8C94A8" }}
        >
          {hoveredEvidenceId}
        </div>
      )}

      {/* AI 状态（partial/failed 时如实呈现，dimension 仍然可研究） */}
      {space.ai.status !== "success" && (
        <div
          className="absolute left-6 top-20 max-w-[260px] rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
          style={{ borderColor: "rgba(234,185,95,0.35)", background: "rgba(234,185,95,0.06)", color: "#EAB95F" }}
        >
          Research space could not be completed. Evidence objects are still available.
        </div>
      )}

      <span className="sr-only">{anchorGlyph(1)} anchors appear in the research surface.</span>
    </div>
  )
}
