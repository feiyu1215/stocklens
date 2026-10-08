// 双公司对比 P2 —— AI 摘要的纯函数层（事实包 / 确定性摘要 / 输出事实校验）。
//
// 核心纪律（P2 立项时拍板，不可放宽）：
//   **模型只能"组织"已验证的事实，不能"生产"任何新事实。**
// 落到代码上是四道确定性闸门：
//   1. 事实包只含 compare.ts 已算好的数值、单位、报告期与差值——证据 statement 原文不进包，
//      模型没有可抄的"自由文本"，只有结构化字段；
//   2. 服务端对客户端提交的行**重新跑一遍可比性规则**，不与规则一致的行整批拒绝
//      （客户端可以传错，但改不了判定口径）；
//   3. 模型输出逐句声明 metricIds，句中每个数字必须能在**该句声明的指标**里锚定到
//      （含舍入变体）；锚不上的数字 = 编造，整段拒收；
//   4. 优劣判断词（更好/更优/领先/值得投资…）与既有合规禁语同时检查。
// 任何一道没过 → 不展示模型输出，降级为确定性摘要（buildDeterministicSummary）。
//
// 本模块必须保持 client-safe：不 import 任何 server-only 模块（阶段 4 教训）。

import type { CompareRow, CompareStatus } from "@/lib/v5/compare"

// ---- 线上传输用的紧凑事实（不携带 statement / sourceFields 等长文本） ----

export interface CompareFactSide {
  value: number | null
  unit: string
  period?: string
}

export interface CompareRowFact {
  metricId: string
  name: string
  group: string
  note: string
  left: CompareFactSide
  right: CompareFactSide
  status: CompareStatus
  diff: { value: number; unit: string } | null
}

export interface CompareSummaryRequest {
  left: { stockCode: string; stockName: string }
  right: { stockCode: string; stockName: string }
  rows: CompareRowFact[]
}

/** CompareRow → 线上事实：只留结构化数值，去掉证据长文本与来源字段。 */
export function toSummaryFacts(rows: CompareRow[]): CompareRowFact[] {
  return rows.map((row) => ({
    metricId: row.def.metricId,
    name: row.def.name,
    group: row.def.group,
    note: row.def.note,
    left: { value: row.left.value, unit: row.left.unit, period: row.left.period },
    right: { value: row.right.value, unit: row.right.unit, period: row.right.period },
    status: row.status,
    diff: row.diff,
  }))
}

// ---- 闸门 2：服务端重跑可比性规则 ----

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

function diffUnit(unit: string): string {
  return unit === "%" ? "pct" : unit
}

/** 与 compare.ts 同口径重算：不信任客户端声称的 status / diff。 */
export function recheckRowFact(fact: CompareRowFact): CompareRowFact | null {
  const { left, right } = fact
  const bothAvailable = isNum(left.value) && isNum(right.value)
  if (!bothAvailable) {
    return { ...fact, status: "not_comparable", diff: null }
  }
  if (left.unit !== right.unit) {
    return null // 同指标单位不一致：数据本身有问题，拒绝
  }
  if (left.period && right.period && left.period === right.period) {
    return {
      ...fact,
      status: "comparable",
      diff: { value: (left.value as number) - (right.value as number), unit: diffUnit(left.unit) },
    }
  }
  return { ...fact, status: "side_by_side", diff: null }
}

export interface RecheckResult {
  ok: boolean
  reason?: string
  facts: CompareRowFact[]
}

export function recheckFacts(rows: CompareRowFact[]): RecheckResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: "没有提交任何指标行", facts: [] }
  }
  const facts: CompareRowFact[] = []
  for (const row of rows) {
    if (!row || typeof row.metricId !== "string" || !row.left || !row.right) {
      return { ok: false, reason: "指标行结构不合法", facts: [] }
    }
    const normalized = recheckRowFact(row)
    if (!normalized) {
      return { ok: false, reason: `${row.metricId}：两侧单位不一致`, facts: [] }
    }
    // 客户端声称的状态/差值必须与确定性规则一致，否则视为数据被篡改或版本漂移
    if (normalized.status !== row.status) {
      return {
        ok: false,
        reason: `${row.metricId}：提交的可比性状态（${row.status}）与确定性规则判定（${normalized.status}）不一致`,
        facts: [],
      }
    }
    if (normalized.status === "comparable") {
      const claimed = row.diff
      if (!claimed || !isNum(claimed.value) || Math.abs(claimed.value - (normalized.diff?.value ?? NaN)) > 1e-9) {
        return { ok: false, reason: `${row.metricId}：提交的差值与确定性计算不一致`, facts: [] }
      }
      if (claimed.unit !== normalized.diff?.unit) {
        return { ok: false, reason: `${row.metricId}：提交的差值单位不一致`, facts: [] }
      }
    } else if (row.diff) {
      return { ok: false, reason: `${row.metricId}：不可比/并列的指标不应携带差值`, facts: [] }
    }
    facts.push(normalized)
  }
  return { ok: true, facts }
}

// ---- 事实包：只有可比与并列的行进包 ----

export interface CompareCoverage {
  comparable: number
  sideBySide: number
  notComparable: number
  /** 未进入摘要的指标名（数据缺失，摘要覆盖不到） */
  excluded: string[]
}

export function buildCoverage(facts: CompareRowFact[]): CompareCoverage {
  return {
    comparable: facts.filter((f) => f.status === "comparable").length,
    sideBySide: facts.filter((f) => f.status === "side_by_side").length,
    notComparable: facts.filter((f) => f.status === "not_comparable").length,
    excluded: facts.filter((f) => f.status === "not_comparable").map((f) => f.name),
  }
}

/** 进包的事实：模型能看到的全部世界。不可比的行被完全剔除，只暴露"有几项被剔除"。 */
export function buildFactPack(facts: CompareRowFact[]): CompareRowFact[] {
  return facts.filter((f) => f.status === "comparable" || f.status === "side_by_side")
}

// ---- 确定性摘要（永远可用，也是 AI 失败时的降级呈现） ----

function fmt(value: number, unit: string): string {
  if (unit === "%") return `${value.toFixed(1)}%`
  if (unit === "x") return `${value.toFixed(2)}x`
  return `${value.toFixed(2)}`
}

function fmtDiff(value: number, unit: string): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±"
  const abs = Math.abs(value)
  const body = unit === "pct" || unit === "%" ? abs.toFixed(1) : unit === "x" ? abs.toFixed(2) : abs.toFixed(2)
  return `${sign}${body} ${unit}`
}

export interface DeterministicSummary {
  sentences: string[]
  coverage: CompareCoverage
}

/**
 * 确定性摘要：把已验证的事实直接念出来，不做任何推断。
 * 可比 → 念两侧值与差值；并列 → 念两侧值并声明不算差值；不可比 → 只说不可比。
 */
export function buildDeterministicSummary(
  facts: CompareRowFact[],
  leftName: string,
  rightName: string,
): DeterministicSummary {
  const coverage = buildCoverage(facts)
  const sentences: string[] = []
  for (const fact of facts) {
    if (fact.status === "comparable" && isNum(fact.left.value) && isNum(fact.right.value) && fact.diff) {
      sentences.push(
        `${fact.name}：${leftName} ${fmt(fact.left.value, fact.left.unit)}，${rightName} ${fmt(
          fact.right.value,
          fact.right.unit,
        )}，相差 ${fmtDiff(fact.diff.value, fact.diff.unit)}${fact.left.period ? `（${fact.left.period}）` : ""}。`,
      )
    } else if (fact.status === "side_by_side" && isNum(fact.left.value) && isNum(fact.right.value)) {
      sentences.push(
        `${fact.name}：${leftName} ${fmt(fact.left.value, fact.left.unit)}（${fact.left.period ?? "报告期未记录"}），${rightName} ${fmt(
          fact.right.value,
          fact.right.unit,
        )}（${fact.right.period ?? "报告期未记录"}）；报告期不同，仅并列不计算差值。`,
      )
    } else if (fact.status === "not_comparable") {
      sentences.push(`${fact.name}：至少一侧无可用数据，不可比。`)
    }
  }
  sentences.push(coverageSentence(coverage))
  return { sentences, coverage }
}

/** 覆盖范围句是确定性生成的，模型不参与——避免它自己数数数错。 */
export function coverageSentence(coverage: CompareCoverage): string {
  const parts = [`本摘要覆盖 ${coverage.comparable} 项可比较指标`]
  if (coverage.sideBySide > 0) parts.push(`${coverage.sideBySide} 项并列参考（报告期不同，未计算差值）`)
  if (coverage.notComparable > 0) {
    parts.push(`${coverage.notComparable} 项因数据缺失未纳入（${coverage.excluded.join("、")}）`)
  }
  return `${parts.join("，")}。`
}

// ---- 接口契约（放在 client-safe 模块里，UI 才能 import 而不牵连 server-only） ----

export type SummarySentenceSource = "ai" | "system"

export interface SummarySentence {
  text: string
  metricIds: string[]
  source: SummarySentenceSource
}

export interface CompareSummaryResponse {
  ai: { status: "success" | "failed"; reason?: string }
  sentences: SummarySentence[]
  coverage: CompareCoverage
  /** 确定性摘要：AI 未通过校验时 UI 展示的就是它，始终随响应返回便于对照 */
  deterministic: string[]
}

// ---- 闸门 3+4：模型输出校验 ----

export interface NarrativeSentence {
  text: string
  metricIds: string[]
}

/** 对比摘要特有的优劣判断词：数值高低可以陈述，"谁更好"不行。 */
export const COMPARE_JUDGMENT_PATTERNS: string[] = [
  "更好", "更优", "更强", "更稳健", "更健康", "更值得", "值得投资", "投资价值",
  "领先", "胜出", "占优", "略胜", "首选", "优于", "不如", "更便宜", "更贵",
  "建议选择", "建议选", "应该选", "推荐", "表现出色", "表现更好",
]

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g
const UNIT_AFTER = /^\s*(%|pct|个百分点|倍|x|元|亿元|万元)/

/** 数值锚定的容差：允许展示层舍入（9.53 → 9.5），但不允许跨档（9.5 ≠ 9.4）。 */
const ANCHOR_TOLERANCE = 0.051

function roundedVariants(value: number): number[] {
  const abs = Math.abs(value)
  return [
    abs,
    Number(abs.toFixed(0)),
    Number(abs.toFixed(1)),
    Number(abs.toFixed(2)),
  ]
}

function periodNumbers(period?: string): number[] {
  if (!period) return []
  return [...period.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => Number.isFinite(n))
}

/** 某一句声明的指标能提供的全部合法数字：两侧值 + 差值 + 报告期里的数字。 */
function allowedNumbersFor(facts: CompareRowFact[], metricIds: string[]): number[] {
  const byId = new Map(facts.map((f) => [f.metricId, f]))
  const numbers: number[] = []
  for (const id of metricIds) {
    const fact = byId.get(id)
    if (!fact) continue
    if (isNum(fact.left.value)) numbers.push(...roundedVariants(fact.left.value))
    if (isNum(fact.right.value)) numbers.push(...roundedVariants(fact.right.value))
    if (fact.diff && isNum(fact.diff.value)) numbers.push(...roundedVariants(fact.diff.value))
    numbers.push(...periodNumbers(fact.left.period), ...periodNumbers(fact.right.period))
  }
  return numbers
}

export interface NarrativeIssue {
  code:
    | "empty"
    | "too_many"
    | "empty_text"
    | "text_too_long"
    | "no_metric_ref"
    | "unknown_metric"
    | "judgment"
    | "unanchored_number"
    | "forbidden_output"
  detail: string
}

/** 单句数字校验：带单位的数字与 ≥10 的整数必须锚定；小整数与年份放行（数量词/报告期）。 */
export function findUnanchoredNumbers(text: string, allowed: number[]): string[] {
  const bad: string[] = []
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const token = match[0]
    const value = Number(token)
    if (!Number.isFinite(value)) continue
    const rest = text.slice(match.index + token.length)
    const hasUnit = UNIT_AFTER.test(rest)
    const abs = Math.abs(value)
    const exempt = !hasUnit && (abs < 10 || (abs >= 1900 && abs <= 2100))
    if (exempt) continue
    const anchored = allowed.some((a) => Math.abs(a - abs) <= ANCHOR_TOLERANCE)
    if (!anchored) bad.push(token)
  }
  return bad
}

/**
 * 校验模型摘要：结构 → 指标引用 → 判断词 → 数字锚定。
 * forbiddenCheck 由调用方传入（合规模块的 findForbiddenOutputPhrases），
 * 保持本模块不依赖 server-only 实现。
 */
export function validateCompareNarrative(
  sentences: NarrativeSentence[],
  facts: CompareRowFact[],
  forbiddenCheck: (text: string) => { pattern: string }[],
  maxSentences = 5,
): NarrativeIssue[] {
  const issues: NarrativeIssue[] = []
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return [{ code: "empty", detail: "摘要为空" }]
  }
  if (sentences.length > maxSentences) {
    issues.push({ code: "too_many", detail: `摘要最多 ${maxSentences} 句，收到 ${sentences.length} 句` })
  }
  const known = new Set(facts.map((f) => f.metricId))
  for (const sentence of sentences) {
    const text = typeof sentence?.text === "string" ? sentence.text.trim() : ""
    if (!text) {
      issues.push({ code: "empty_text", detail: "存在空句" })
      continue
    }
    if (text.length > 220) {
      issues.push({ code: "text_too_long", detail: `单句超过 220 字：${text.slice(0, 30)}…` })
    }
    const metricIds = Array.isArray(sentence.metricIds) ? sentence.metricIds : []
    if (metricIds.length === 0) {
      issues.push({ code: "no_metric_ref", detail: `句子未声明引用的指标：${text.slice(0, 30)}…` })
    }
    const unknown = metricIds.filter((id) => !known.has(id))
    if (unknown.length > 0) {
      issues.push({ code: "unknown_metric", detail: `引用了事实包中不存在的指标：${unknown.join("、")}` })
    }
    for (const word of COMPARE_JUDGMENT_PATTERNS) {
      if (text.includes(word)) {
        issues.push({ code: "judgment", detail: `出现优劣判断词「${word}」` })
      }
    }
    const forbidden = forbiddenCheck(text)
    if (forbidden.length > 0) {
      issues.push({ code: "forbidden_output", detail: `命中合规禁语：${forbidden.map((f) => f.pattern).join("、")}` })
    }
    const unanchored = findUnanchoredNumbers(text, allowedNumbersFor(facts, metricIds))
    if (unanchored.length > 0) {
      issues.push({ code: "unanchored_number", detail: `出现事实包中不存在的数字：${unanchored.join("、")}` })
    }
  }
  return issues
}
