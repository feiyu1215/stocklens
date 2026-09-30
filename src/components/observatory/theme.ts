import type { ResearchClaim } from "@/lib/research/claims"
import type { ResearchDimension } from "@/lib/research/dimension-schema"
import type { CompanyContext } from "@/lib/research/company-context"
import type { Evidence } from "@/lib/evidence/types"
import type { FinancialTrendPoint } from "@/lib/metrics/trend"

// Observatory 前端共享类型与视觉常量（Task 12 Visual Spec §79–§84）

export const OBSERVATORY_COLORS = {
  background: "#07090E",
  darkSurface: "#0E1118",
  primaryText: "#F1F3F5",
  secondaryText: "#8C94A8",
  readingSheet: "#F3F0E8",
  readingInk: "#14161B",
  readingSecondary: "#676A70",
  fact: "#45B8FF",
  inference: "#9A7BFF",
  unknown: "#EAB95F",
  conflict: "#F06B5E",
} as const

export function evidenceColor(e: Pick<Evidence, "type" | "signal">): string {
  if (e.type === "inference" && e.signal === "conflict") return OBSERVATORY_COLORS.conflict
  if (e.type === "inference") return OBSERVATORY_COLORS.inference
  if (e.type === "unknown") return OBSERVATORY_COLORS.unknown
  return OBSERVATORY_COLORS.fact
}

export interface ResearchSpacePayload {
  spaceId: string
  company: CompanyContext
  entryQuestion?: string
  frame: { intent: string; framingReason: string }
  dimensions: ResearchDimension[]
  claims: ResearchClaim[]
  evidence: Evidence[]
  suggestions: { label: string; researchQuestion: string; rationale: string; capabilityRefs: string[] }[]
  trend: FinancialTrendPoint[]
  metrics: import("@/lib/metrics/types").MetricResult[]
  ai: { status: "success" | "partial_failure" | "failed"; issues?: string[] }
  errors: { domain: string; message: string }[]
}

export interface AddedDimensionResult {
  mode?: string
  dimensionId?: string
  dimension: ResearchDimension | null
  claims: ResearchClaim[]
  evidence: Evidence[]
  ai: { status: string; issues?: string[] }
  compliance?: { message: string; suggestedQuestions: string[] }
}

export type ObservatoryScene =
  | "DISCOVERY"
  | "ASSEMBLING"
  | "SPACE_OVERVIEW"
  | "DIMENSION_FOCUS"
  | "CLAIM_FOCUS"

export const STATUS_LABEL: Record<ResearchDimension["status"], string> = {
  ready: "已验证",
  partial: "部分验证",
  unknown: "待验证",
}

export function claimTypeLabel(type: ResearchClaim["type"]): string {
  if (type === "fact") return "FACT"
  if (type === "inference") return "INFERENCE"
  return "UNKNOWN"
}

export function claimAnchorIndex(fullEvidence: Evidence[], claim: ResearchClaim): number[] {
  const order = fullEvidence.map((e) => e.evidenceId)
  return claim.evidenceIds
    .map((id) => order.indexOf(id) + 1)
    .filter((n) => n > 0)
}

export const CIRCLE_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"] as const

export function anchorGlyph(index: number): string {
  return CIRCLE_NUMBERS[index - 1] ?? `(${index})`
}
