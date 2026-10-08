"use client"

import type { Dispatch, SetStateAction } from "react"

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import { PALETTE } from "@/components/v5/palette"
import { evidenceAnnotations, tierFont, type AnchorSpec } from "@/lib/v5/canvas"

const COLORS = PALETTE

function trimSummary(text: string, limit: number): string {
  const cleaned = text.replace(/（[^）]*）\s*$/, "").trim()
  if (cleaned.length <= limit) return cleaned
  const cut = cleaned.slice(0, limit)
  const lastPunctuation = Math.max(
    cut.lastIndexOf("，"),
    cut.lastIndexOf("；"),
    cut.lastIndexOf("。"),
  )
  const base = lastPunctuation > limit * 0.45 ? cut.slice(0, lastPunctuation) : cut
  return `${base}。`
}

function BarGlyph() {
  return (
    <svg width="12" height="10" aria-hidden>
      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          x={index * 4}
          y={6 - index * 2.4}
          width="2.4"
          height={4 + index * 2.4}
          fill={COLORS.secondary}
          opacity={0.55}
        />
      ))}
    </svg>
  )
}

export default function CanvasAnchorLayer({
  payload,
  anchors,
  positionOf,
  activeDimensionId,
  apertureDimensionId,
  hoverDimensionId,
  selectedDimensionIds,
  focusSet,
  revealCount,
  showHitAreas,
  setHoverDimensionId,
  setSelectedDimensionIds,
  onRemoveDimension,
}: {
  payload: ResearchSpacePayload
  anchors: AnchorSpec[]
  positionOf: (anchor: AnchorSpec) => { x: number; y: number }
  activeDimensionId: string | null
  apertureDimensionId: string | null
  hoverDimensionId: string | null
  selectedDimensionIds: string[]
  focusSet: boolean
  revealCount: number
  showHitAreas: boolean
  setHoverDimensionId: (dimensionId: string | null) => void
  setSelectedDimensionIds: Dispatch<SetStateAction<string[]>>
  onRemoveDimension: (dimensionId: string) => void
}) {
  return anchors.map((anchor, visibleIndex) => {
    const position = positionOf(anchor)
    const font = tierFont(anchor.tier)
    const isUnknown = anchor.status === "unknown"
    const isActive = activeDimensionId === anchor.dimensionId
    const isSelected = selectedDimensionIds.includes(anchor.dimensionId)
    const isOtherHovered =
      hoverDimensionId !== null && hoverDimensionId !== anchor.dimensionId
    const isFocusDimmed = focusSet && selectedDimensionIds.length > 0 && !isSelected
    const summary =
      payload.claims.find(
        (claim) => claim.dimensionId === anchor.dimensionId && claim.type !== "unknown",
      )?.text ?? ""
    const dimension = payload.dimensions.find(
      (item) => item.dimensionId === anchor.dimensionId,
    )
    const isRemovable = anchor.origin !== "ai_initial"
    return (
      <div
        key={anchor.dimensionId}
        data-anchor-id={anchor.dimensionId}
        data-anchor-origin={anchor.origin}
        data-reveal={visibleIndex < revealCount ? "in" : "out"}
        data-hit="anchor"
        className="group absolute"
        style={{
          left: position.x,
          top: position.y,
          opacity: isFocusDimmed ? 0.1 : isOtherHovered ? 0.36 : isActive ? 1 : 0.92,
          transition: "opacity 320ms ease-out",
          zIndex: isActive || isSelected ? 20 : 10,
          padding: "14px 20px 16px 0",
          marginLeft: -10,
          width: "max-content",
          cursor: "pointer",
          ...(showHitAreas
            ? {
                outline: "1px dashed rgba(47,102,255,0.6)",
                outlineOffset: 2,
                background: "rgba(47,102,255,0.06)",
              }
            : undefined),
        }}
        onPointerEnter={() => setHoverDimensionId(anchor.dimensionId)}
        onPointerLeave={() => setHoverDimensionId(null)}
        onClick={(event) => {
          if (!event.shiftKey) return
          setSelectedDimensionIds((selected) =>
            selected.includes(anchor.dimensionId)
              ? selected.filter((dimensionId) => dimensionId !== anchor.dimensionId)
              : [...selected, anchor.dimensionId],
          )
        }}
      >
        <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.18em]">
          <span style={{ color: COLORS.secondary, opacity: 0.85 }}>{anchor.index}</span>
          {isRemovable && (
            <button
              type="button"
              data-ui
              data-remove-dimension={anchor.dimensionId}
              aria-label={`移除研究角度：${anchor.label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onRemoveDimension(anchor.dimensionId)
              }}
              className="opacity-0 transition group-hover:opacity-100 focus:opacity-100"
              style={{ color: COLORS.secondary }}
            >
              × 移除
            </button>
          )}
        </div>

        <div
          style={{
            transform: `scale(${isActive ? 1.08 : 1})`,
            transformOrigin: "left top",
            transition: "transform 320ms cubic-bezier(0.22,1,0.36,1)",
            display: apertureDimensionId === anchor.dimensionId ? "none" : undefined,
          }}
        >
          <div className="flex items-baseline gap-2.5">
            {isSelected && (
              <span
                aria-hidden
                style={{
                  width: 2,
                  height: font.size * 0.86,
                  background: COLORS.blue,
                  display: "inline-block",
                }}
              />
            )}
            <span
              data-anchor-title
              className="font-medium leading-tight tracking-[-0.01em]"
              style={{
                fontSize: font.size,
                color: COLORS.ink,
                whiteSpace: "nowrap",
              }}
            >
              {anchor.label}
            </span>
          </div>

          <div
            className="mt-1.5 flex items-center gap-2.5 font-mono"
            style={{ fontSize: font.meta, color: COLORS.secondary }}
          >
            {isUnknown ? (
              <span className="flex items-center gap-1.5" style={{ color: COLORS.amber }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: COLORS.amber }} />
                待补证据
              </span>
            ) : (
              <>
                <span>{anchor.evidenceCount} evidence</span>
                <BarGlyph />
                {anchor.conflictCount > 0 && (
                  <span className="flex items-center gap-1.5" style={{ color: COLORS.coral }}>
                    <span
                      aria-hidden
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 1,
                        background: COLORS.coral,
                        display: "inline-block",
                      }}
                    />
                    {anchor.conflictCount} conflict
                  </span>
                )}
                {!anchor.hasInterpretation && (
                  <span>AI interpretation temporarily unavailable</span>
                )}
              </>
            )}
          </div>

          {isActive && hoverDimensionId === anchor.dimensionId && (
            <div className="mt-2.5 w-[290px]" style={{ animation: "v5-in 200ms ease-out" }}>
              {summary && !isUnknown && (
                <p className="text-[12.5px] leading-relaxed" style={{ color: COLORS.secondary }}>
                  {trimSummary(summary, 42)}
                </p>
              )}
              {!isUnknown && (
                <div className="mt-2 space-y-1">
                  {evidenceAnnotations(payload, anchor.dimensionId, 2).map((row) => (
                    <div
                      key={row.index}
                      className="flex items-baseline justify-between gap-3 font-mono text-[11px]"
                    >
                      <span style={{ color: COLORS.secondary }}>{row.name}</span>
                      <span style={{ color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {isUnknown && dimension?.missingInformation && (
                <ul className="space-y-0.5">
                  {dimension.missingInformation.slice(0, 2).map((item) => (
                    <li key={item} className="font-mono text-[10.5px]" style={{ color: COLORS.amber }}>
                      · {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    )
  })
}
