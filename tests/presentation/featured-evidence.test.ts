import { describe, expect, it } from "vitest"

import type { DiagnosisSynthesis } from "@/lib/ai/types"
import type { Evidence, EvidenceDimension, EvidenceSignal, EvidenceType } from "@/lib/evidence/types"
import { FEATURED_EVIDENCE_LIMIT, selectFeaturedEvidence } from "@/lib/presentation/featured-evidence"

let seq = 0
function e(type: EvidenceType, signal: EvidenceSignal, dimension: EvidenceDimension = "growth"): Evidence {
  seq += 1
  return {
    evidenceId: `EV_${type}_${signal}_${seq}`,
    dimension,
    title: `t${seq}`,
    statement: `s${seq}`,
    type,
    signal,
    confidence: type === "unknown" ? "low" : type === "inference" ? "medium" : "high",
    metricIds: [],
    basedOn: [],
    sourceFields: [],
    verifyStatus: type === "unknown" ? "unverified" : "verified",
    confidenceReason: "-",
  }
}

const conflictInference = e("inference", "conflict") // 1
const unknownEv = e("unknown", "unknown", "valuation") // 2
const negativeFact = e("fact", "negative") // 3
const positiveFact = e("fact", "positive") // 4
const neutralFact = e("fact", "neutral") // 5
const positiveFact2 = e("fact", "positive") // 6
const pool = [positiveFact2, neutralFact, conflictInference, unknownEv, negativeFact, positiveFact] // 故意乱序

describe("selectFeaturedEvidence（§3/§22/§66）", () => {
  it("层级优先：conflict → unknown → negative → positive；同层级被 synthesis 引用者优先", () => {
    const synthesis: DiagnosisSynthesis = {
      summary: { text: "s", evidenceIds: [positiveFact.evidenceId, conflictInference.evidenceId] },
      confirmedFacts: [{ text: "s", evidenceIds: [positiveFact2.evidenceId] }],
      analysisInferences: [],
      unknowns: [{ text: "s", evidenceIds: [unknownEv.evidenceId] }],
      nextQuestions: [],
    }
    const featured = selectFeaturedEvidence(pool, synthesis)
    expect(featured.map((x) => x.evidenceId)).toEqual([
      conflictInference.evidenceId, // conflict，且被 summary 引用
      unknownEv.evidenceId, // unknown，被引用
      negativeFact.evidenceId, // negative fact（未引用，层级优先）
      positiveFact2.evidenceId, // positive，被引用（同级同引用状态按数组序）
      positiveFact.evidenceId, // positive，被引用
      neutralFact.evidenceId, // neutral，最后
    ])
    expect(new Set(featured.map((x) => x.evidenceId)).size).toBe(featured.length)
    expect(featured).toHaveLength(FEATURED_EVIDENCE_LIMIT)
  })

  it("§67 synthesis = null → 同样按层级 fallback", () => {
    const featured = selectFeaturedEvidence(pool, null)
    expect(featured.map((x) => x.evidenceId)).toEqual([
      conflictInference.evidenceId,
      unknownEv.evidenceId,
      negativeFact.evidenceId,
      positiveFact2.evidenceId,
      positiveFact.evidenceId,
      neutralFact.evidenceId,
    ])
  })

  it("确定性：同输入两次运行顺序一致", () => {
    const a = selectFeaturedEvidence(pool, null)
    const b = selectFeaturedEvidence(pool, null)
    expect(a.map((x) => x.evidenceId)).toEqual(b.map((x) => x.evidenceId))
  })

  it("高层级证据占满时，被引用的 neutral fact 排在末位（可能被挤出首屏）", () => {
    const synthesis: DiagnosisSynthesis = {
      summary: { text: "s", evidenceIds: [neutralFact.evidenceId] },
      confirmedFacts: [], analysisInferences: [], unknowns: [], nextQuestions: [],
    }
    const featured = selectFeaturedEvidence(pool, synthesis)
    expect(featured[featured.length - 1]?.evidenceId).toBe(neutralFact.evidenceId)
  })
})
