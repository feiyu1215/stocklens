import type { Evidence, EvidenceValidationViolation } from "./types"

// Evidence Validator：进入下一层（未来 UI / AI Synthesis）前的最小结构校验。
//
// 规则（Task 03 §41–42）：
// - FACT：metricIds ≥ 1 且 basedOn = 0，confidence=high、verified；
// - INFERENCE：basedOn ≥ 2 且所有引用必须真实存在（断链 = 校验失败，绝不悄悄删引用），
//   必须携带 ruleId；
// - UNKNOWN：必须有 unavailableReason 或明确 statement，confidence=low、unverified、signal=unknown；
// - 全类型：evidenceId 唯一，title/statement 非空。

export interface EvidenceValidationResult {
  ok: boolean
  violations: EvidenceValidationViolation[]
}

export function validateEvidenceBundle(evidence: Evidence[]): EvidenceValidationResult {
  const violations: EvidenceValidationViolation[] = []
  const ids = new Set<string>()

  for (const e of evidence) {
    if (ids.has(e.evidenceId)) {
      violations.push({ evidenceId: e.evidenceId, rule: "unique-id", message: "duplicate evidenceId" })
    }
    ids.add(e.evidenceId)

    if (!e.title || !e.statement) {
      violations.push({ evidenceId: e.evidenceId, rule: "non-empty", message: "title/statement must be non-empty" })
    }

    if (e.type === "fact") {
      // 不变量本意：每条事实都必须可追溯到来源。
      // 指标类事实 → metricIds ≥ 1；事件类事实（Task 10，dimension=risk，非指标驱动）
      // → 以 sourceFields（含真实接口路径与日期）作为可追溯凭据。
      const traceableAsEvent = e.dimension === "risk" && e.sourceFields.length >= 1
      if (e.metricIds.length < 1 && !traceableAsEvent) {
        violations.push({
          evidenceId: e.evidenceId,
          rule: "fact-metric-ids",
          message: "FACT requires metricIds.length >= 1 (or, for risk-dimension event facts, sourceFields traceability)",
        })
      }
      if (e.basedOn.length !== 0) {
        violations.push({ evidenceId: e.evidenceId, rule: "fact-based-on", message: "FACT must not reference other evidence (basedOn must be empty)" })
      }
      if (e.confidence !== "high" || e.verifyStatus !== "verified") {
        violations.push({ evidenceId: e.evidenceId, rule: "fact-confidence", message: "FACT must be confidence=high and verified" })
      }
    }

    if (e.type === "inference") {
      if (e.basedOn.length < 2) {
        violations.push({ evidenceId: e.evidenceId, rule: "inference-based-on", message: "INFERENCE requires basedOn.length >= 2" })
      }
      for (const ref of e.basedOn) {
        if (!ids.has(ref)) {
          violations.push({ evidenceId: e.evidenceId, rule: "broken-reference", message: `referenced evidence "${ref}" does not exist` })
        }
      }
      if (!e.ruleId) {
        violations.push({ evidenceId: e.evidenceId, rule: "inference-rule-id", message: "INFERENCE must carry ruleId" })
      }
      if (e.confidence !== "medium" || e.verifyStatus !== "verified") {
        violations.push({ evidenceId: e.evidenceId, rule: "inference-confidence", message: "INFERENCE must be confidence=medium and verified" })
      }
    }

    if (e.type === "unknown") {
      if (!e.unavailableReason && !e.statement) {
        violations.push({ evidenceId: e.evidenceId, rule: "unknown-reason", message: "UNKNOWN requires unavailableReason or explicit statement" })
      }
      if (e.confidence !== "low" || e.verifyStatus !== "unverified" || e.signal !== "unknown") {
        violations.push({ evidenceId: e.evidenceId, rule: "unknown-confidence", message: "UNKNOWN must be confidence=low, unverified, signal=unknown" })
      }
    }
  }

  return { ok: violations.length === 0, violations }
}
