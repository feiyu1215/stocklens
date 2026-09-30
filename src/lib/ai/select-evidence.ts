// Evidence Selection（Task 04 §16–18）：由代码完成，不让 LLM 自由增删证据。
// 规则：Evidence.dimension ∈ (dimensions ∪ optionalDimensions)。
// UNKNOWN 属于对应维度（如历史估值 UNKNOWN ∈ valuation、行业 UNKNOWN ∈ industry），
// 因此选中维度时其相关 UNKNOWN 会自然一起进入 Synthesizer 输入。

import type { Evidence } from "@/lib/evidence/types"
import type { DiagnosisDimension, PlannerResult } from "./types"

export function selectEvidenceForPlan(evidence: Evidence[], plan: PlannerResult): Evidence[] {
  const dims = new Set<DiagnosisDimension>([...plan.dimensions, ...plan.optionalDimensions])
  return evidence.filter((e) => dims.has(e.dimension))
}
