import type { MetricResult } from "@/lib/metrics/types"

import { buildFacts } from "./fact-builder"
import { buildInferences } from "./inference-builder"
import { EVIDENCE_RULES_VERSION } from "./rules"
import type { Evidence, EvidenceBundle, EvidenceContext, EvidenceStats } from "./types"
import { buildUnknowns } from "./unknown-builder"
import { EvidenceValidationError } from "./types"
import { validateEvidenceBundle } from "./validate"

// Evidence Engine 编排入口：
//   MetricResult[] + EvidenceContext
//   → FACT（模板化陈述，数字只来自 MetricResult.value）
//   → INFERENCE（rules.ts 确定性规则，basedOn 指向 FACT）
//   → UNKNOWN（能力缺口的形式化陈述）
// 全程无 LLM / 无网络 / 无 DB。输出经 Validator 校验，断链即失败。

export { EVIDENCE_RULES_VERSION }
export { validateEvidenceBundle } from "./validate"
export { EvidenceValidationError } from "./types"
export { growthWord, pctWord } from "./fact-builder"

function computeStats(evidence: Evidence[]): EvidenceStats {
  const stats: EvidenceStats = {
    total: evidence.length,
    fact: 0,
    inference: 0,
    unknown: 0,
    positive: 0,
    negative: 0,
    conflict: 0,
    neutral: 0,
    unknownSignal: 0,
  }
  for (const e of evidence) {
    stats[e.type] += 1
    switch (e.signal) {
      case "positive":
        stats.positive += 1
        break
      case "negative":
        stats.negative += 1
        break
      case "conflict":
        stats.conflict += 1
        break
      case "neutral":
        stats.neutral += 1
        break
      case "unknown":
        stats.unknownSignal += 1
        break
    }
  }
  return stats
}

export function buildEvidence({
  metrics,
  context,
}: {
  metrics: MetricResult[]
  context: EvidenceContext
}): EvidenceBundle {
  const facts = buildFacts(metrics)
  const inferences = buildInferences(metrics, facts)
  const unknowns = buildUnknowns(metrics, context)
  // 稳定排序：fact → inference → unknown（组内保持生成顺序；最终展示选择留给 Planner）
  const evidence: Evidence[] = [...facts, ...inferences, ...unknowns]

  const validation = validateEvidenceBundle(evidence)
  if (!validation.ok) {
    throw new EvidenceValidationError(validation.violations)
  }

  return {
    evidence,
    stats: computeStats(evidence),
    rulesVersion: EVIDENCE_RULES_VERSION,
  }
}
