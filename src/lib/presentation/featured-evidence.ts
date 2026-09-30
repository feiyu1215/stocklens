import type { DiagnosisSynthesis } from "@/lib/ai/types"
import type { Evidence } from "@/lib/evidence/types"

// Featured Evidence Selection —— Presentation Layer 纯函数（Task 05 §2–4）。
//
// 只决定「首屏展示哪些证据」，不能修改 Evidence 本身（type/signal/内容均只读），
// 完整证据集合始终可通过「全部证据」查看。确定性优先级，不调用 LLM。
//
// 排序语义（§3 + §22）：重要性层级优先（conflict → unknown → negative fact →
// positive fact → 其余 inference → neutral fact）；同层级内被 synthesis 实际引用的
// 证据排在前面，其后按原始数组顺序稳定排列。这样「值得关注的证据」首屏总能让
// 矛盾与待验证信息可见，不会被大量事实卡挤出首屏。

export const FEATURED_EVIDENCE_LIMIT = 6

function tierOf(e: Evidence): number {
  if (e.type === "inference" && e.signal === "conflict") return 0
  if (e.type === "unknown") return 1
  if (e.type === "fact" && e.signal === "negative") return 2
  if (e.type === "fact" && e.signal === "positive") return 3
  if (e.type === "inference") return 4 // 非 conflict 的推断（如 neutral 描述性关系）
  return 5 // neutral fact
}

export function selectFeaturedEvidence(
  evidence: Evidence[],
  synthesis: DiagnosisSynthesis | null,
  limit: number = FEATURED_EVIDENCE_LIMIT,
): Evidence[] {
  const referenced = new Set<string>()
  if (synthesis) {
    for (const statement of [
      synthesis.summary,
      ...synthesis.confirmedFacts,
      ...synthesis.analysisInferences,
      ...synthesis.unknowns,
    ]) {
      for (const id of statement.evidenceIds) referenced.add(id)
    }
  }

  const indexById = new Map(evidence.map((e, i) => [e.evidenceId, i] as const))
  const sorted = [...evidence].sort((a, b) => {
    const tierDiff = tierOf(a) - tierOf(b)
    if (tierDiff !== 0) return tierDiff
    const refDiff =
      (referenced.has(b.evidenceId) ? 1 : 0) - (referenced.has(a.evidenceId) ? 1 : 0)
    if (refDiff !== 0) return refDiff
    return (indexById.get(a.evidenceId) ?? 0) - (indexById.get(b.evidenceId) ?? 0)
  })

  return sorted.slice(0, limit)
}
