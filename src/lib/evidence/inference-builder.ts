import type { MetricResult } from "@/lib/metrics/types"

import type { MetricLookup } from "./rules"
import { EVIDENCE_RULES_VERSION, RULE_DEFINITIONS } from "./rules"
import type { Evidence } from "./types"

const INFERENCE_CONFIDENCE_REASON =
  "由确定性规则组合多个已验证 FACT 得出：关系确定成立，但业务含义需在后续解释环节进一步展开"

/**
 * 评估全部规则并生成 INFERENCE Evidence。
 *
 * 前提约束：规则只在全部所需指标 available 时才可能触发（evaluate 保证），
 * 因此 basedOn 指向的 FACT 必然存在；若因防御性原因缺失，跳过该规则而非生成断链引用。
 */
export function buildInferences(metrics: MetricResult[], facts: Evidence[]): Evidence[] {
  const lookup: MetricLookup = (metricId) => metrics.find((m) => m.metricId === metricId)
  const factIds = new Set(facts.map((f) => f.evidenceId))

  const out: Evidence[] = []
  for (const rule of RULE_DEFINITIONS) {
    const statement = rule.evaluate(lookup)
    if (statement === null) continue

    const basedOn = rule.requires.map((metricId) => `EV_FACT_${metricId}`)
    if (basedOn.some((id) => !factIds.has(id))) continue

    const firstMetric = lookup(rule.requires[0])
    out.push({
      evidenceId: rule.evidenceId,
      dimension: rule.dimension,
      title: rule.title,
      statement,
      type: "inference",
      signal: rule.signal,
      confidence: "medium",
      metricIds: [...rule.requires],
      basedOn,
      ruleId: rule.ruleId,
      period: firstMetric?.period,
      comparisonPeriod: firstMetric?.comparisonPeriod,
      sourceFields: rule.requires.flatMap((id) => lookup(id)?.sourceFields ?? []),
      verifyStatus: "verified",
      confidenceReason: INFERENCE_CONFIDENCE_REASON,
    })
  }
  return out
}

export { EVIDENCE_RULES_VERSION }
