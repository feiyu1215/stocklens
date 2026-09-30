import type { DiagnosisSynthesis, GroundedStatement } from "@/lib/ai/types"
import type { Evidence } from "@/lib/evidence/types"
import { findForbiddenOutputPhrases } from "./compliance"

// Diagnosis Validator（Task 04 §29–36）—— LLM 输出进入 Response 前的确定性关卡。
//
// 链路：Schema Validation → Evidence Binding → Section Type Validation → Compliance。
// 任何 FAIL 都不允许"删掉问题引用后继续返回"——整体失败，交给 repair / AI failure 路径。

export interface DiagnosisValidationIssue {
  section: string
  rule: string
  message: string
}

export type DiagnosisValidationResult =
  | { ok: true; synthesis: DiagnosisSynthesis }
  | { ok: false; issues: DiagnosisValidationIssue[] }

function issue(section: string, rule: string, message: string): DiagnosisValidationIssue {
  return { section, rule, message }
}

function validateGroundedStatementShape(
  section: string,
  key: string,
  value: unknown,
  issues: DiagnosisValidationIssue[],
): asserts value is GroundedStatement {
  if (typeof value !== "object" || value === null) {
    issues.push(issue(section, "schema", `${key} 必须是对象`))
    return
  }
  const s = value as Record<string, unknown>
  if (typeof s.text !== "string" || s.text.trim().length === 0) {
    issues.push(issue(section, "schema", `${key}.text 必须是非空字符串`))
  }
  if (!Array.isArray(s.evidenceIds) || s.evidenceIds.length === 0 || s.evidenceIds.some((id) => typeof id !== "string")) {
    issues.push(issue(section, "schema", `${key}.evidenceIds 必须是非空字符串数组`))
  }
  if (typeof s.text === "string" && s.text.length > 400) {
    issues.push(issue(section, "schema", `${key}.text 过长（>400 字符）`))
  }
}

function collectTexts(synthesis: DiagnosisSynthesis): string[] {
  return [
    synthesis.summary.text,
    ...synthesis.confirmedFacts.map((s) => s.text),
    ...synthesis.analysisInferences.map((s) => s.text),
    ...synthesis.unknowns.map((s) => s.text),
    ...synthesis.nextQuestions,
  ]
}

export function validateDiagnosisSynthesis(
  parsed: unknown,
  selectedEvidence: Evidence[],
): DiagnosisValidationResult {
  const issues: DiagnosisValidationIssue[] = []

  // ---------- 1. Schema Validation ----------
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, issues: [issue("root", "schema", "输出必须是 JSON 对象")] }
  }
  const obj = parsed as Record<string, unknown>

  validateGroundedStatementShape("summary", "summary", obj.summary, issues)

  const listKeys = ["confirmedFacts", "analysisInferences", "unknowns"] as const
  for (const key of listKeys) {
    const list = obj[key]
    if (!Array.isArray(list)) {
      issues.push(issue(key, "schema", `${key} 必须是数组`))
      continue
    }
    if (list.length > 8) {
      issues.push(issue(key, "schema", `${key} 数量过多（>8）`))
    }
    for (let i = 0; i < list.length; i++) {
      validateGroundedStatementShape(key, `${key}[${i}]`, list[i], issues)
    }
  }
  if (!Array.isArray(obj.nextQuestions) || obj.nextQuestions.some((q) => typeof q !== "string")) {
    issues.push(issue("nextQuestions", "schema", "nextQuestions 必须是字符串数组"))
  } else if (obj.nextQuestions.length > 6) {
    issues.push(issue("nextQuestions", "schema", "nextQuestions 数量过多（>6）"))
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const synthesis: DiagnosisSynthesis = {
    summary: obj.summary as GroundedStatement,
    confirmedFacts: obj.confirmedFacts as GroundedStatement[],
    analysisInferences: obj.analysisInferences as GroundedStatement[],
    unknowns: obj.unknowns as GroundedStatement[],
    nextQuestions: obj.nextQuestions as string[],
  }

  // ---------- 2. Evidence Binding（§30/§34）----------
  const evidenceById = new Map(selectedEvidence.map((e) => [e.evidenceId, e] as const))
  const checkBinding = (section: string, s: GroundedStatement) => {
    for (const id of s.evidenceIds) {
      if (!evidenceById.has(id)) {
        // 伪造或不存在的 ID：整体失败，绝不静默删除
        issues.push(issue(section, "evidence-binding", `引用的证据不存在或不在选中范围内：${id}`))
      }
    }
  }
  checkBinding("summary", synthesis.summary)
  synthesis.confirmedFacts.forEach((s, i) => checkBinding(`confirmedFacts[${i}]`, s))
  synthesis.analysisInferences.forEach((s, i) => checkBinding(`analysisInferences[${i}]`, s))
  synthesis.unknowns.forEach((s, i) => checkBinding(`unknowns[${i}]`, s))

  // ---------- 3. Section Type Validation（§31–33）----------
  const typeOf = (id: string) => evidenceById.get(id)?.type
  for (const s of synthesis.confirmedFacts) {
    if (s.evidenceIds.length > 0 && !s.evidenceIds.every((id) => typeOf(id) === "fact")) {
      issues.push(issue("confirmedFacts", "section-type", `confirmedFacts 只能引用 fact 证据：${s.evidenceIds.join(",")}`))
    }
  }
  for (const s of synthesis.analysisInferences) {
    if (s.evidenceIds.length > 0 && !s.evidenceIds.some((id) => typeOf(id) === "inference")) {
      issues.push(issue("analysisInferences", "section-type", `analysisInferences 每条必须至少引用 1 条 inference 证据：${s.text.slice(0, 40)}`))
    }
  }
  for (const s of synthesis.unknowns) {
    if (s.evidenceIds.length > 0 && !s.evidenceIds.every((id) => typeOf(id) === "unknown")) {
      issues.push(issue("unknowns", "section-type", `unknowns 只能引用 unknown 证据：${s.evidenceIds.join(",")}`))
    }
  }

  // ---------- 4. Compliance Validation（§35–36，双保险第二层）----------
  for (const text of collectTexts(synthesis)) {
    for (const violation of findForbiddenOutputPhrases(text)) {
      issues.push(issue("compliance", "forbidden-expression", `出现禁止表达「${violation.pattern}」：…${violation.excerpt}…`))
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }
  return { ok: true, synthesis }
}
