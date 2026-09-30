import type { CapabilityKey } from "./capability"

// Research Dimension Schema（Task 12 §17–§20）：用户看到的研究维度由 AI 动态生成。
// 但 capabilityRefs 必须来自 Capability Manifest —— AI 可以自由命名研究角度，不能发明数据能力。

export type DimensionOrigin = "ai_initial" | "ai_suggested" | "user"
export type DimensionStatus = "ready" | "partial" | "unknown"

export interface ResearchDimensionDraft {
  label: string
  researchQuestion: string
  description?: string
  capabilityRefs: CapabilityKey[]
  rationale: string
}

export interface ResearchDimension {
  dimensionId: string
  label: string
  researchQuestion: string
  description?: string
  origin: DimensionOrigin
  capabilityRefs: CapabilityKey[]
  status: DimensionStatus
  rationale: string
  priority: number
  evidenceIds: string[]
  claimIds: string[]
  missingInformation?: string[]
}

export interface ResearchFrame {
  intent: string
  dimensions: ResearchDimensionDraft[]
  suggestedDimensions: ResearchDimensionDraft[]
  framingReason: string
}

export const DIMENSION_LIMITS = {
  /** AI 初始维度数量（Task 12 §24：4–6，禁止 10+） */
  INITIAL_MIN: 4,
  INITIAL_MAX: 6,
  /** AI 建议维度（§46：1–3，不自动执行） */
  SUGGESTED_MIN: 1,
  SUGGESTED_MAX: 3,
  LABEL_MAX: 16,
  QUESTION_MAX: 80,
  RATIONALE_MAX: 160,
  DESCRIPTION_MAX: 200,
} as const

/** 稳定 dimensionId：由 label + 序号派生（不随运行变化） */
export function makeDimensionId(label: string, index: number, origin: DimensionOrigin): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
  return `DIM_${origin.toUpperCase()}_${String(index + 1).padStart(2, "0")}_${slug || "dimension"}`
}
