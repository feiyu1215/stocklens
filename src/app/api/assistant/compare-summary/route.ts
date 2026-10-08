import { NextResponse } from "next/server"

import { findForbiddenOutputPhrases } from "@/lib/validation/compliance"
import { runLLM, parseLLMJson, LLMConfigError } from "@/lib/ai/model"
import { rateLimitResponse } from "@/lib/http/rate-limit"
import {
  buildCoverage,
  buildDeterministicSummary,
  buildFactPack,
  coverageSentence,
  recheckFacts,
  validateCompareNarrative,
  type CompareRowFact,
  type CompareSummaryResponse,
  type SummarySentence,
} from "@/lib/v5/compare-summary"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// P2 双公司对比摘要：模型只做"组织"，事实只能来自客户端提交的已验证结构化数值。
//
// 与既有 AI 通路最大的不同：本通路**不接触 Truth Layer、不接触证据原文**，
// 输入事实包里只有数值/单位/报告期/差值，模型没有可抄的自由文本。
// 输出必须逐句声明引用指标，且句中数字必须锚定——否则整段拒收，降级为确定性摘要。

/** 事实包里用中文分组名，避免模型把英文 group 值带进正文 */
const GROUP_LABELS: Record<string, string> = {
  growth: "成长",
  profitability: "盈利",
  cashflow: "现金流",
  valuation: "估值",
}

const SYSTEM_PROMPT = [
  "你是 StockLens 的对比摘要组织者，只把给定的结构化事实组织成通顺的中文叙述。只输出 JSON。",
  '输出 schema：{"sentences":[{"text":"一句话","metricIds":["引用的指标 id"]}]}',
  "硬性边界（违反即整段作废）：",
  "1. 只能使用 FACTS 中出现的指标、数值、差值和报告期；禁止引入任何 FACTS 之外的数字、公司、指标、时间点或外部知识。",
  "2. 口径为「报告期不同，仅并列」的指标，只能并列陈述，绝不能计算或暗示差值。",
  "3. 禁止任何优劣判断、投资建议、买卖倾向、评级或预测（例如「更好」「更值得」「值得投资」「建议选择」）。",
  "4. 只陈述数值高低与口径差异，不下结论谁更强、谁更值得。",
  "5. 每一句都必须声明它引用的 metricIds，且只能引用 FACTS 里给出的 id。",
  "6. 按组归纳（成长/盈利/现金流/估值），不要逐项罗列，输出 3-5 句，每句不超过 80 字。",
  "7. 正文必须是给投资人看的中文自然语言：**禁止出现任何字段名或英文标识**（metricId、status、side_by_side、差值AB、pct 等一律不准进正文）。",
  "   差值请写成「相差 3.3 个百分点」这类中文表述；并列口径请写成「报告期不同，仅并列」。",
].join("\n")

function toSystemSentences(lines: string[]): SummarySentence[] {
  return lines.map((text) => ({ text, metricIds: [], source: "system" as const }))
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function parseRow(raw: unknown): CompareRowFact | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const left = row.left as Record<string, unknown> | undefined
  const right = row.right as Record<string, unknown> | undefined
  if (typeof row.metricId !== "string" || !left || !right) return null
  const status = row.status
  if (status !== "comparable" && status !== "side_by_side" && status !== "not_comparable") return null
  const diffRaw = row.diff as { value?: unknown; unit?: unknown } | null | undefined
  return {
    metricId: row.metricId,
    name: typeof row.name === "string" ? row.name : row.metricId,
    group: typeof row.group === "string" ? row.group : "",
    note: typeof row.note === "string" ? row.note : "",
    left: {
      value: asNumberOrNull(left.value),
      unit: typeof left.unit === "string" ? left.unit : "",
      period: typeof left.period === "string" ? left.period : undefined,
    },
    right: {
      value: asNumberOrNull(right.value),
      unit: typeof right.unit === "string" ? right.unit : "",
      period: typeof right.period === "string" ? right.period : undefined,
    },
    status,
    diff:
      diffRaw && typeof diffRaw.unit === "string" && asNumberOrNull(diffRaw.value) !== null
        ? { value: asNumberOrNull(diffRaw.value) as number, unit: diffRaw.unit }
        : null,
  }
}

export async function POST(request: Request) {
  const limited = rateLimitResponse(request, { scope: "compare-summary", limit: 10 })
  if (limited) return limited

  let body: { left?: unknown; right?: unknown; rows?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 })
  }

  const left = body.left as { stockCode?: unknown; stockName?: unknown } | undefined
  const right = body.right as { stockCode?: unknown; stockName?: unknown } | undefined
  const leftName = typeof left?.stockName === "string" && left.stockName ? left.stockName : "左侧公司"
  const rightName = typeof right?.stockName === "string" && right.stockName ? right.stockName : "右侧公司"

  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 24) {
    return NextResponse.json({ error: "rows 需为 1–24 项" }, { status: 400 })
  }
  const rows: CompareRowFact[] = []
  for (const raw of body.rows) {
    const parsed = parseRow(raw)
    if (!parsed) return NextResponse.json({ error: "指标行结构不合法" }, { status: 400 })
    rows.push(parsed)
  }

  // 闸门 2：服务端重跑确定性规则，客户端声称的状态/差值不一致即拒绝
  const rechecked = recheckFacts(rows)
  if (!rechecked.ok) {
    return NextResponse.json({ error: rechecked.reason ?? "提交的数据未通过确定性校验" }, { status: 400 })
  }

  const facts = rechecked.facts
  const coverage = buildCoverage(facts)
  const deterministic = buildDeterministicSummary(facts, leftName, rightName)
  const fallback = (reason: string): CompareSummaryResponse => ({
    ai: { status: "failed", reason },
    sentences: toSystemSentences(deterministic.sentences),
    coverage,
    deterministic: deterministic.sentences,
  })

  const pack = buildFactPack(facts)
  if (pack.length === 0) {
    return NextResponse.json(fallback("当前没有可比或并列的数据，无法生成摘要。"))
  }

  const userPrompt = [
    `公司A：${leftName}；公司B：${rightName}`,
    "FACTS（唯一允许使用的事实，字段之外的信息一律不得使用）：",
    JSON.stringify(
      pack.map((f) => ({
        metricId: f.metricId,
        指标: f.name,
        分组: GROUP_LABELS[f.group] ?? f.group,
        口径: f.status === "comparable" ? "同报告期，可比较" : "报告期不同，仅并列",
        A: { 公司: leftName, 值: f.left.value, 单位: f.left.unit, 报告期: f.left.period ?? null },
        B: { 公司: rightName, 值: f.right.value, 单位: f.right.unit, 报告期: f.right.period ?? null },
        差值: f.diff ? { 值: f.diff.value, 单位: f.diff.unit } : null,
      })),
      null,
      1,
    ),
    `另有 ${coverage.notComparable} 项指标因数据缺失不在 FACTS 中，不要提及它们的名字或数值。`,
    `请组织成 3-5 句摘要，重点说明：各组（成长/盈利/现金流/估值）能看到的事实差异，以及报告期不同导致的口径限制。`,
  ].join("\n")

  let result
  try {
    result = await runLLM({
      task: "compare_summary",
      promptVersion: "compare-summary-v1",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxTokens: 1200,
      timeoutMs: 30_000,
      networkRetries: 0,
    })
  } catch (err) {
    return NextResponse.json(fallback(err instanceof LLMConfigError ? err.message : "AI 服务暂时不可用"))
  }

  if (result.trace.status === "failed") {
    return NextResponse.json(fallback("AI 服务暂时不可用，稍后可重试。"))
  }

  let parsed: { sentences?: unknown }
  try {
    parsed = parseLLMJson(result.output) as typeof parsed
  } catch {
    return NextResponse.json(fallback("摘要生成失败，已回退为按数据直接生成的版本。"))
  }

  const rawSentences = Array.isArray(parsed.sentences) ? parsed.sentences : []
  const sentences = rawSentences.slice(0, 5).map((item) => {
    const row = item as { text?: unknown; metricIds?: unknown }
    return {
      text: typeof row?.text === "string" ? row.text.trim() : "",
      metricIds: Array.isArray(row?.metricIds) ? row.metricIds.filter((id): id is string => typeof id === "string") : [],
    }
  })

  // 闸门 3+4：指标引用、判断词、数字锚定、合规禁语
  const issues = validateCompareNarrative(sentences, pack, (text) => findForbiddenOutputPhrases(text))
  if (issues.length > 0) {
    const codes = [...new Set(issues.map((i) => i.code))].join("、")
    return NextResponse.json(
      fallback(`摘要未通过事实校验（${codes}），已回退为按数据直接生成的版本。`),
    )
  }

  const response: CompareSummaryResponse = {
    ai: { status: "success" },
    sentences: [
      ...sentences.map((s) => ({ text: s.text, metricIds: s.metricIds, source: "ai" as const })),
      { text: coverageSentence(coverage), metricIds: [], source: "system" as const },
    ],
    coverage,
    deterministic: deterministic.sentences,
  }
  return NextResponse.json(response)
}
