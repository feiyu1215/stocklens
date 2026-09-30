"use client"

import { useEffect, useMemo, useState } from "react"

import type { Evidence } from "@/lib/evidence/types"
import type { ResearchDimension } from "@/lib/research/dimension-schema"
import {
  CONSTELLATION,
  computeAddNodeLayout,
  computeDimensionLayout,
  computeFieldNodes,
  computeSuggestionLayout,
  selectFieldEvidence,
} from "@/lib/presentation/constellation-layout"
import { OBSERVATORY_COLORS, STATUS_LABEL, anchorGlyph, evidenceColor, type ResearchSpacePayload } from "./theme"

// Scene C｜Space Overview（Task 12 §20–§26 + Task 12.1 Polish §1–§25）：
// 主 Research Space 占据视口主体：Company Core（208px + 同心焦点环）居中，
// 确定性 radial 维度对象（碰撞消解、UNKNOWN 同尺寸虚线表达），
// Evidence Field 真实节点/边（hover 聚焦 cluster），
// 右侧外围 AI 建议 ghost 对象（hover 展开），独立 ＋Add 节点。

const FIELD_W = 1560
const FIELD_H = 1000

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
    >
      {edges.map((edge) => (
        <line
          key={edge.key}
          x1={edge.x1}
          y1={edge.y1}
          x2={edge.x2}
          y2={edge.y2}
          stroke={edge.color}
          strokeWidth={edge.conflict ? 1.5 : 0.9}
          strokeDasharray={edge.conflict ? "4 3" : undefined}
          opacity={0.6}
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
              r={14}
              fill="none"
              stroke={color}
              strokeWidth={1.2}
              strokeDasharray="3 4"
              opacity={dimmed ? 0.1 : 0.8}
              style={{ transition: "opacity 200ms ease-out" }}
            />
          )
        }
        if (e.type === "inference") {
          return (
            <g
              key={node.evidenceId}
              opacity={dimmed ? 0.1 : 0.96}
              style={{ transition: "opacity 200ms ease-out" }}
            >
              <circle
                onMouseEnter={() => onNodeHover(node.evidenceId)}
                onMouseLeave={() => onNodeHover(null)}
                cx={node.x}
                cy={node.y}
                r={10}
                fill="rgba(7,9,14,0.9)"
                stroke={color}
                strokeWidth={e.signal === "conflict" ? 2.6 : 1.8}
                strokeDasharray={e.signal === "conflict" ? "5 3" : undefined}
                className="pointer-events-auto"
              />
              <circle cx={node.x} cy={node.y} r={3.4} fill={color} />
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
            r={5}
            fill={color}
            opacity={dimmed ? 0.12 : 1}
            style={{ transition: "opacity 200ms ease-out", pointerEvents: "auto" }}
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
  const [hoveredSuggestion, setHoveredSuggestion] = useState<string | null>(null)

  const layout = useMemo(() => computeDimensionLayout(space.dimensions), [space.dimensions])
  const layoutById = useMemo(() => new Map(layout.map((l) => [l.dimensionId, l] as const)), [layout])
  const maxDimRadius = useMemo(
    () => layout.reduce((max, l) => Math.max(max, l.radius + l.width / 2), 0),
    [layout],
  )
  const addNode = useMemo(
    () => computeAddNodeLayout(layout, { radius: CONSTELLATION.CORE_SIZE / 2 + 150 }),
    [layout],
  )
  const activeSuggestions = useMemo(
    () => space.suggestions.filter((s) => !dismissedSuggestions.includes(s.label)),
    [space.suggestions, dismissedSuggestions],
  )
  // 建议对象置于维度环之外（§9–§12 的右侧外围弧），避免与任何 Dimension 对象重叠
  const suggestionLayout = useMemo(
    () => computeSuggestionLayout(activeSuggestions, { baseRadius: maxDimRadius + 92 }),
    [activeSuggestions, maxDimRadius],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      {/* 主 Research Space：视觉中心 (47%, 49%) */}
      <div className="absolute" style={{ left: "47%", top: "49%", transform: "translate(-50%, -50%)" }}>
        <div className="relative">
          <EvidenceField
            evidence={space.evidence}
            highlightedDimension={hoveredDimension ?? null}
            onNodeHover={setHoveredEvidenceId}
          />

          {/* Company Core（§2）：208px + 同心焦点环 + 极轻折射光晕 */}
          <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">
            <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }}>
              {[300, 258, 224].map((d, i) => (
                <span
                  key={d}
                  aria-hidden
                  className="absolute rounded-full"
                  style={{
                    width: d,
                    height: d,
                    border: `1px solid rgba(140,148,168,${i === 0 ? 0.08 : 0.14})`,
                  }}
                />
              ))}
              <span
                aria-hidden
                className="absolute rounded-full"
                style={{
                  width: CONSTELLATION.CORE_SIZE,
                  height: CONSTELLATION.CORE_SIZE,
                  background:
                    "radial-gradient(circle at 50% 42%, rgba(69,184,255,0.16) 0%, rgba(154,123,255,0.06) 46%, rgba(14,17,24,0.92) 72%)",
                  border: "1px solid rgba(140,148,168,0.20)",
                  boxShadow: "0 0 70px rgba(69,184,255,0.10) inset",
                }}
              />
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="text-[22px] font-medium tracking-wide text-[#F1F3F5]">
                  {space.company.stockName}
                </div>
                <div className="mt-1.5 font-mono text-[12px] text-[#8C94A8]">{space.company.stockCode}</div>
                {space.company.industryName && (
                  <div className="mt-1 text-[12px] text-[#6C7488]">{space.company.industryName}</div>
                )}
              </div>
            </div>
          </div>

          {/* Dimension Objects（确定性 radial + 碰撞消解） */}
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
                title={dimensionSummaryLine(dim, space.claims)}
                onMouseEnter={() => setHoveredDimension(dim.label)}
                onMouseLeave={() => setHoveredDimension(null)}
                onFocus={() => setHoveredDimension(dim.label)}
                onBlur={() => setHoveredDimension(null)}
                onClick={() => onDimensionSelect(dim.dimensionId)}
                className="absolute left-0 top-0 rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/70"
                style={{
                  width: l.width,
                  minHeight: l.height,
                  transform: `translate(calc(-50% + ${l.x}px), calc(-50% + ${l.y}px)) scale(${
                    (dimmed ? 0.99 : 1) * l.scale
                  })`,
                  opacity: dimmed ? 0.34 : 1,
                  border: isUnknown
                    ? "1px dashed rgba(234,185,95,0.55)"
                    : isPartial
                      ? "1px solid rgba(154,123,255,0.30)"
                      : "1px solid rgba(140,148,168,0.20)",
                  background: isUnknown
                    ? "rgba(12,15,22,0.42)"
                    : isPartial
                      ? "linear-gradient(160deg, rgba(154,123,255,0.08), rgba(12,15,22,0.72))"
                      : "rgba(12,15,22,0.72)",
                  backdropFilter: "blur(3px)",
                  boxShadow: hoveredDimension === dim.label ? "0 0 34px rgba(69,184,255,0.16)" : "none",
                  transition:
                    "opacity 200ms ease-out, box-shadow 200ms ease-out, transform 420ms cubic-bezier(0.22,1,0.36,1)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="text-[16px] leading-snug text-[#F1F3F5]"
                    style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
                  >
                    {dim.label}
                  </span>
                  {addingDimensionId === dim.dimensionId && (
                    <span className="animate-pulse text-[10px] text-[#45B8FF]">…</span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-[#8C94A8]">
                  <span>{dim.evidenceIds.length} evidence</span>
                  {conflictCount > 0 && (
                    <span style={{ color: OBSERVATORY_COLORS.conflict }}>{conflictCount} conflict</span>
                  )}
                  {isUnknown && <span style={{ color: OBSERVATORY_COLORS.unknown }}>incomplete</span>}
                </div>
                {hoveredDimension === dim.label && (
                  <div className="mt-2 border-t border-white/5 pt-1.5 text-[11px] leading-relaxed text-[#8C94A8]">
                    {dimensionSummaryLine(dim, space.claims).slice(0, 54)}…
                  </div>
                )}
              </button>
            )
          })}

          {/* add 节点：独立 Object（§8） */}
          <button
            type="button"
            onClick={onAddDimension}
            aria-label="Add research angle"
            className="group absolute left-0 top-0 outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/70"
            style={{ transform: `translate(calc(-50% + ${addNode.x}px), calc(-50% + ${addNode.y}px))` }}
          >
            <span
              className="flex items-center justify-center rounded-full border text-[20px] text-[#6C7488] transition group-hover:border-[#45B8FF]/70 group-hover:text-[#45B8FF]"
              style={{
                width: CONSTELLATION.ADD_NODE_DIAMETER,
                height: CONSTELLATION.ADD_NODE_DIAMETER,
                borderStyle: "dashed",
                borderColor: "rgba(90,98,116,0.75)",
                background: "rgba(12,15,22,0.55)",
              }}
            >
              ＋
            </span>
            <span className="absolute left-1/2 top-full mt-2 w-max -translate-x-1/2 text-[11.5px] text-[#6C7488] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              Add research angle
            </span>
          </button>

          {/* AI Suggested：右侧外围 ghost 对象（§9–§12） */}
          {suggestionLayout.map((placement, index) => {
            const s = activeSuggestions[index]
            if (!s) return null
            const expanded = hoveredSuggestion === s.label
            return (
              <div
                key={s.label}
                className="absolute left-0 top-0"
                style={{
                  transform: `translate(calc(-50% + ${placement.x}px), calc(-50% + ${placement.y}px))`,
                  width: expanded ? 236 : CONSTELLATION.SUGGESTION_WIDTH,
                  transition: "width 260ms cubic-bezier(0.22,1,0.36,1), opacity 260ms ease-out",
                  opacity: addLensOpen ? 0 : expanded ? 1 : 0.72,
                  pointerEvents: addLensOpen ? "none" : "auto",
                }}
                onMouseEnter={() => setHoveredSuggestion(s.label)}
                onMouseLeave={() => setHoveredSuggestion(null)}
              >
                <div
                  className="rounded-xl border border-dashed px-3 py-2.5"
                  style={{
                    borderColor: "rgba(140,148,168,0.30)",
                    background: "rgba(12,15,22,0.5)",
                    backdropFilter: "blur(3px)",
                  }}
                >
                  <div className="font-mono text-[9.5px] tracking-[0.18em] text-[#5A6274]">SUGGESTED</div>
                  <div className="mt-1 text-[14.5px] leading-snug text-[#E6E9EE]" style={{ wordBreak: "keep-all" }}>
                    {s.label}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-[#6C7488]">
                    {expanded ? s.rationale : s.rationale.slice(0, 14).replace(/[，。、]$/, "") + "…"}
                  </div>
                  {expanded && (
                    <div className="mt-2 flex items-center gap-3 text-[12px]">
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
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {hoveredEvidenceId && (
        <div
          className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-lg border px-3.5 py-1.5 font-mono text-[11.5px]"
          style={{ borderColor: "rgba(140,148,168,0.22)", background: "rgba(12,15,22,0.92)", color: "#8C94A8" }}
        >
          {hoveredEvidenceId}
        </div>
      )}

      {space.ai.status !== "success" && (
        <div
          className="absolute left-8 top-24 max-w-[280px] rounded-lg border px-3.5 py-2.5 text-[11.5px] leading-relaxed"
          style={{ borderColor: "rgba(234,185,95,0.35)", background: "rgba(234,185,95,0.06)", color: "#EAB95F" }}
        >
          Research space could not be completed. Evidence objects are still available.
        </div>
      )}

      <span className="sr-only">{anchorGlyph(1)} anchors appear in the research surface.</span>
    </div>
  )
}
