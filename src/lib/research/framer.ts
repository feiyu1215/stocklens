import type { CompanyContext } from "./company-context"
import { companyContextForFramer } from "./company-context"
import { CAPABILITY_KEYS, type CapabilityKey } from "./capability"
import { DIMENSION_LIMITS, type ResearchDimensionDraft, type ResearchFrame } from "./dimension-schema"

// Research Framer（Task 12 §21–§27）：决定「这家公司该怎么看」。
//
// 硬约束：输入只有 Company Context + 用户问题 + Capability Manifest——
// 不含任何金融数字/指标/价格（避免先看结果再反向组织问题）。

export const FRAMER_PROMPT_VERSION = "research_framer_v1"

export interface FramerInput {
  context: CompanyContext
  question?: string
}

export function buildFramerSystemPrompt(): string {
  const capabilityList = CAPABILITY_KEYS.join(", ")
  return [
    "你是 StockLens 的研究框架设计器（Research Framer）。你的职责：根据公司身份、所属行业、用户问题与系统真实具备的数据能力，为这家公司设计一组研究维度（Research Dimension）。",
    "",
    "你决定的是【该怎么看这家公司】，而不是【看到了什么结果】。你没有任何金融数据，也绝不能编造数字或结论。",
    "",
    `可用数据能力（capabilityRefs 只能从这里选，用了别的一定会被系统拒绝）：${capabilityList}`,
    "",
    "设计规则：",
    `1. dimensions 设计 ${DIMENSION_LIMITS.INITIAL_MIN}–${DIMENSION_LIMITS.INITIAL_MAX} 个，按研究优先级排序（最重要在前）。`,
    `2. suggestedDimensions 设计 ${DIMENSION_LIMITS.SUGGESTED_MIN}–${DIMENSION_LIMITS.SUGGESTED_MAX} 个（更探索性的角度，不会自动加入空间）。`,
    "3. label 必须是面向用户的研究角度名称，允许自由命名（例如「增长韧性」「盈利质量」「现金转化」「行业相对表现」），禁止直接使用 capability 的英文 key 作为 label。严禁对每家公司套用同一组标签：必须结合行业与用户问题产生真实差异。",
    "4. researchQuestion 是该维度要回答的研究问题（一句话）。",
    "5. capabilityRefs 只能包含在【当前可用能力】中出现的能力；status 为 unavailable 的能力不得引用。如果一个有价值的研究角度没有对应能力，把它放进 suggestedDimensions（系统会在用户添加时标记为 unknown），不要强行编造能力。",
    "6. rationale 说明为什么这家公司需要看这个维度（一句话，不得包含任何数字）。",
    "7. 如果用户没有提问（open_exploration），按公司自身特点设计默认研究空间。",
    "",
    "只输出 JSON：",
    '{"intent":"...","dimensions":[{"label":"...","researchQuestion":"...","description":"...","capabilityRefs":["..."],"rationale":"..."}],"suggestedDimensions":[...],"framingReason":"..."}',
  ].join("\n")
}

export function buildFramerUserPrompt(input: FramerInput): string {
  const ctx = companyContextForFramer(input.context)
  return JSON.stringify({
    company: ctx,
    question: input.question ?? null,
    mode: input.question ? "question_driven" : "open_exploration",
  })
}

export function buildFramerRepairPrompt(previousOutput: string, issues: string[]): string {
  return [
    "你上一次的输出未通过校验：",
    ...issues.map((i) => `- ${i}`),
    "",
    "上一次输出：",
    previousOutput,
    "",
    "请重新输出完全符合要求的 JSON（只输出 JSON）。牢记：capabilityRefs 只能来自允许的能力清单；label 必须是有差异的研究角度名称，不要照抄其他公司的模板。",
  ].join("\n")
}

// ---------- 校验（Task 12 §93–§94） ----------

export interface FramerValidationResult {
  ok: boolean
  issues: string[]
  frame?: ResearchFrame
}

function validateDraft(
  raw: unknown,
  index: number,
  allowedCapabilities: Set<CapabilityKey>,
  issues: string[],
  prefix: string,
): ResearchDimensionDraft | null {
  if (typeof raw !== "object" || raw === null) {
    issues.push(`${prefix}[${index}] 不是对象`)
    return null
  }
  const d = raw as Record<string, unknown>
  const label = typeof d.label === "string" ? d.label.trim() : ""
  const researchQuestion = typeof d.researchQuestion === "string" ? d.researchQuestion.trim() : ""
  const rationale = typeof d.rationale === "string" ? d.rationale.trim() : ""
  const description = typeof d.description === "string" ? d.description.trim() : undefined

  if (label.length === 0 || label.length > DIMENSION_LIMITS.LABEL_MAX) {
    issues.push(`${prefix}[${index}].label 长度非法（1–${DIMENSION_LIMITS.LABEL_MAX}）`)
  }
  if (researchQuestion.length === 0 || researchQuestion.length > DIMENSION_LIMITS.QUESTION_MAX) {
    issues.push(`${prefix}[${index}].researchQuestion 长度非法（1–${DIMENSION_LIMITS.QUESTION_MAX}）`)
  }
  if (rationale.length === 0 || rationale.length > DIMENSION_LIMITS.RATIONALE_MAX) {
    issues.push(`${prefix}[${index}].rationale 长度非法（1–${DIMENSION_LIMITS.RATIONALE_MAX}）`)
  }
  if (/\d/.test(rationale)) {
    issues.push(`${prefix}[${index}].rationale 不得包含数字（Framer 没有数据依据）`)
  }
  if (!Array.isArray(d.capabilityRefs) || d.capabilityRefs.length === 0) {
    issues.push(`${prefix}[${index}].capabilityRefs 必须非空`)
  } else {
    for (const ref of d.capabilityRefs) {
      if (!allowedCapabilities.has(ref as CapabilityKey)) {
        issues.push(`${prefix}[${index}] 引用了不存在或不可用的能力：${JSON.stringify(ref)}`)
      }
    }
  }
  // label 不得直接使用 capability 英文 key
  if (CAPABILITY_KEYS.includes(label.toLowerCase() as CapabilityKey)) {
    issues.push(`${prefix}[${index}].label 不得直接使用 capability key`)
  }
  if (issues.length > 0 && !label) return null
  if (!Array.isArray(d.capabilityRefs) || d.capabilityRefs.length === 0) return null
  return {
    label,
    researchQuestion,
    ...(description && description.length <= DIMENSION_LIMITS.DESCRIPTION_MAX ? { description } : {}),
    capabilityRefs: d.capabilityRefs as CapabilityKey[],
    rationale,
  }
}

export function validateResearchFrame(
  parsed: unknown,
  context: CompanyContext,
): FramerValidationResult {
  const issues: string[] = []
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, issues: ["输出必须是 JSON 对象"] }
  }
  const obj = parsed as Record<string, unknown>

  // 允许的能力 = ready + partial（unavailable 不得引用）
  const allowed = new Set<CapabilityKey>(
    context.capabilities.filter((c) => c.status !== "unavailable").map((c) => c.key),
  )

  if (typeof obj.intent !== "string" || obj.intent.trim().length === 0) {
    issues.push("intent 必须是非空字符串")
  }
  if (typeof obj.framingReason !== "string" || obj.framingReason.trim().length === 0) {
    issues.push("framingReason 必须是非空字符串")
  } else if (/\d/.test(obj.framingReason)) {
    issues.push("framingReason 不得包含数字")
  }

  const dimensions: ResearchDimensionDraft[] = []
  if (!Array.isArray(obj.dimensions)) {
    issues.push("dimensions 必须是数组")
  } else {
    if (obj.dimensions.length < DIMENSION_LIMITS.INITIAL_MIN || obj.dimensions.length > DIMENSION_LIMITS.INITIAL_MAX) {
      issues.push(`dimensions 数量必须为 ${DIMENSION_LIMITS.INITIAL_MIN}–${DIMENSION_LIMITS.INITIAL_MAX}`)
    }
    obj.dimensions.forEach((d, i) => {
      const before = issues.length
      const draft = validateDraft(d, i, allowed, issues, "dimensions")
      if (draft && issues.length === before) dimensions.push(draft)
    })
  }

  const suggested: ResearchDimensionDraft[] = []
  const rawSuggested = obj.suggestedDimensions
  if (rawSuggested !== undefined && !Array.isArray(rawSuggested)) {
    issues.push("suggestedDimensions 必须是数组")
  } else if (Array.isArray(rawSuggested)) {
    if (rawSuggested.length > DIMENSION_LIMITS.SUGGESTED_MAX) {
      issues.push(`suggestedDimensions 最多 ${DIMENSION_LIMITS.SUGGESTED_MAX} 个`)
    }
    // suggestions 允许引用 unavailable 能力（未来会以 unknown 呈现），但必须是合法 CapabilityKey
    const allKeys = new Set<CapabilityKey>([...CAPABILITY_KEYS])
    rawSuggested.forEach((d, i) => {
      const before = issues.length
      const draft = validateDraft(d, i, allKeys, issues, "suggestedDimensions")
      if (draft && issues.length === before) suggested.push(draft)
    })
  }

  // label 去重（语义重复的简单守卫：去空白后完全相同即重复）
  const labels = [...dimensions, ...suggested].map((d) => d.label.replace(/\s+/g, ""))
  const dupes = labels.filter((l, i) => labels.indexOf(l) !== i)
  if (dupes.length > 0) {
    issues.push(`存在重复 label：${[...new Set(dupes)].join(", ")}`)
  }

  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    issues: [],
    frame: {
      intent: (obj.intent as string).trim(),
      dimensions,
      suggestedDimensions: suggested,
      framingReason: (obj.framingReason as string).trim(),
    },
  }
}
