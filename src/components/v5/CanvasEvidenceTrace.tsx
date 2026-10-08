import type { ResearchSpacePayload } from "@/components/observatory/theme"
import { DESIGN, buildTrace, type AnchorSpec } from "@/lib/v5/canvas"

export default function CanvasEvidenceTrace({
  payload,
  anchors,
  positionOf,
  activeDimensionId,
  apertureDimensionId,
  readingDimensionId,
  readingEvidenceId,
}: {
  payload: ResearchSpacePayload
  anchors: AnchorSpec[]
  positionOf: (anchor: AnchorSpec) => { x: number; y: number }
  activeDimensionId: string | null
  apertureDimensionId: string | null
  readingDimensionId: string | null
  readingEvidenceId: string | null
}) {
  return (
    <svg
      aria-hidden
      data-evidence-trace
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width={DESIGN.width}
      height={DESIGN.height}
    >
      <path
        d="M 300 900 Q 700 700 1120 820 T 1700 620"
        fill="none"
        stroke="#11151B"
        strokeWidth="0.8"
        strokeDasharray="2 8"
        opacity="0.06"
      />
      {anchors.map((anchor) => {
        const position = positionOf(anchor)
        const dimensionEvidenceIds =
          payload.dimensions.find((dimension) => dimension.dimensionId === anchor.dimensionId)
            ?.evidenceIds ?? []
        const traceIds =
          readingEvidenceId &&
          anchor.dimensionId === readingDimensionId &&
          !dimensionEvidenceIds.slice(0, 4).includes(readingEvidenceId)
            ? [readingEvidenceId, ...dimensionEvidenceIds]
            : dimensionEvidenceIds
        const trace = buildTrace(
          { x: position.x, y: position.y, dimensionId: anchor.dimensionId },
          traceIds,
          5,
        )
        const isActive =
          activeDimensionId === anchor.dimensionId || apertureDimensionId === anchor.dimensionId

        return (
          <g key={anchor.dimensionId}>
            {trace.edges.map((edge, index) => (
              <path
                key={index}
                d={edge.path}
                fill="none"
                stroke={isActive ? "#6F87B5" : "#11151B"}
                strokeWidth={isActive ? 1.1 : 0.8}
                opacity={isActive ? 0.5 : 0.05}
                strokeDasharray={anchor.status === "unknown" ? "3 6" : undefined}
                style={{ transition: "opacity 320ms ease-out" }}
              />
            ))}
            {trace.nodes.map((node) => {
              const isReadingEvidence =
                readingEvidenceId !== null && node.evidenceId === readingEvidenceId
              return (
                <circle
                  key={node.evidenceId}
                  data-evidence-node={node.evidenceId}
                  cx={node.x}
                  cy={node.y}
                  r={isReadingEvidence ? 5.5 : isActive ? 3.6 : 2.6}
                  fill={
                    isReadingEvidence
                      ? "#2F66FF"
                      : anchor.status === "unknown"
                        ? "#B4802A"
                        : isActive
                          ? "#4E7BD4"
                          : "#11151B"
                  }
                  opacity={isReadingEvidence ? 1 : isActive ? 0.75 : 0.06}
                  style={{ transition: "opacity 300ms ease-out" }}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
