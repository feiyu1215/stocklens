import { NextResponse } from "next/server"

import {
  COMPLIANCE_REDIRECT_MESSAGE,
  detectRestrictedInvestmentRequest,
  findForbiddenOutputPhrases,
} from "@/lib/validation/compliance"
import { runLLM, parseLLMJson, LLMConfigError } from "@/lib/ai/model"
import { rateLimitResponse } from "@/lib/http/rate-limit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// P1 金融概念解释接口：独立通路，不依赖 stockCode、不触发 Truth Layer、不生成公司事实。
// 输出只允许通用概念（定义/公式/用途/局限），双道合规：前置请求检查 + 输出禁语检查。

export interface ConceptExplanation {
  term: string
  explanation: string
  formula?: string
  usage?: string
  caveats: string[]
  ai: { status: "success" | "failed" }
}

const SYSTEM_PROMPT = [
  "你是 StockLens 的金融概念解释器，只解释通用金融/财务/估值概念。只输出 JSON，不输出任何其他文字。",
  '输出 schema：{"term":"概念名","explanation":"2-4 句通俗解释","formula":"公式或计算口径(可选,无则省略)","usage":"主要用途(1-2 句,可选)","caveats":["使用时的局限或常见误读,1-3 条"]}',
  "硬性边界：绝不提及、引用或暗示任何具体上市公司的名称、代码、数值或经营情况；绝不给出任何投资建议、买卖判断或收益预测；不做全市场比较。",
  "若用户问的不是通用金融/财务概念，输出 {\"term\":\"\",\"explanation\":\"\",\"caveats\":[\"NOT_A_CONCEPT\"]}。",
].join("\n")

function failureResponse(term: string, message: string): NextResponse {
  const body: ConceptExplanation = { term, explanation: message, caveats: [], ai: { status: "failed" } }
  return NextResponse.json(body)
}

export async function POST(request: Request) {
  const limited = rateLimitResponse(request, { scope: "assistant-explain", limit: 20 })
  if (limited) return limited

  let body: { term?: unknown }
  try {
    body = (await request.json()) as { term?: unknown }
  } catch {
    return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 })
  }
  const term = typeof body.term === "string" ? body.term.trim() : ""
  if (term.length === 0 || term.length > 24) {
    return NextResponse.json({ error: "term 限 1–24 字符" }, { status: 400 })
  }

  // 合规预检：概念词本身不太可能违规，但保持与其它入口同一守卫，不做例外
  const restricted = detectRestrictedInvestmentRequest(term)
  if (restricted.restricted) {
    return NextResponse.json(failureResponse(term, COMPLIANCE_REDIRECT_MESSAGE))
  }

  let result
  try {
    result = await runLLM({
      task: "assistant_explain",
      promptVersion: "assistant-explain-v1",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `请解释概念：${term}`,
      temperature: 0.2,
      maxTokens: 1200,
      timeoutMs: 25_000,
      networkRetries: 0,
    })
  } catch (err) {
    return NextResponse.json(failureResponse(term, err instanceof LLMConfigError ? err.message : "AI 服务暂时不可用"))
  }

  if (result.trace.status === "failed") {
    return NextResponse.json(failureResponse(term, "AI 服务暂时不可用，稍后可重试。"))
  }

  let parsed: { term?: unknown; explanation?: unknown; formula?: unknown; usage?: unknown; caveats?: unknown }
  try {
    parsed = parseLLMJson(result.output) as typeof parsed
  } catch {
    return NextResponse.json(failureResponse(term, "解释生成失败，稍后可重试。"))
  }

  if (Array.isArray(parsed.caveats) && parsed.caveats.includes("NOT_A_CONCEPT")) {
    return NextResponse.json(failureResponse(term, "这不在通用金融概念解释的范围内。公司相关问题请先选一家公司进入研究空间。"))
  }

  const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : ""
  if (!explanation) {
    return NextResponse.json(failureResponse(term, "解释生成失败，稍后可重试。"))
  }

  // 输出禁语检查（第二道防线）：解释文本中不得出现投资建议式表达
  const fullText = [parsed.formula, parsed.usage, ...(Array.isArray(parsed.caveats) ? parsed.caveats : [])]
    .filter((part): part is string => typeof part === "string")
    .join("\n")
  const forbidden = findForbiddenOutputPhrases(`${explanation}\n${fullText}`)
  if (forbidden.length > 0) {
    return NextResponse.json(failureResponse(term, COMPLIANCE_REDIRECT_MESSAGE))
  }

  const payload: ConceptExplanation = {
    term: typeof parsed.term === "string" && parsed.term ? parsed.term : term,
    explanation,
    formula: typeof parsed.formula === "string" ? parsed.formula : undefined,
    usage: typeof parsed.usage === "string" ? parsed.usage : undefined,
    caveats: Array.isArray(parsed.caveats) ? parsed.caveats.filter((c): c is string => typeof c === "string").slice(0, 3) : [],
    ai: { status: "success" },
  }
  return NextResponse.json(payload)
}
