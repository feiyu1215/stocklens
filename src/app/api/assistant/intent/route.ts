import { NextResponse } from "next/server"

import {
  COMPLIANCE_REDIRECT_MESSAGE,
  COMPLIANCE_SUGGESTED_QUESTIONS,
  detectRestrictedInvestmentRequest,
} from "@/lib/validation/compliance"
import { searchStocks } from "@/lib/data/stock-search"
import { runLLM, parseLLMJson, LLMConfigError } from "@/lib/ai/model"
import { findProductFeature, type AssistantResolution, type ClarifyCompany } from "@/lib/v5/assistant/capabilities"
import { matchRule } from "@/lib/v5/assistant/rules"
import { rateLimitResponse } from "@/lib/http/rate-limit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// P1 意图分类接口：规则优先，模型兜底。
// 职责边界（评审方案 §6.2）：只分类与解析实体，不执行导航、不改研究数据、不生成任何分析结论。
// 实体解析用真实标的检索（searchStocks），绝不信任模型给出的股票代码。

const INTENT_ENUM = ["navigate", "product_help", "concept_explain", "company_research", "compare", "unsupported"]

interface LlmIntentOutput {
  intent: string
  companyName?: string
  companyNames?: string[]
  term?: string
}

function unavailableResolution(reason: string): AssistantResolution {
  return {
    intent: "unsupported",
    reply: reason,
    availability: "unavailable",
  }
}

/** 用真实标的检索解析公司名；唯一精确/唯一包含 → 唯一，多条 → 歧义 */
async function resolveCompanyName(name: string): Promise<
  | { status: "unique"; company: ClarifyCompany }
  | { status: "ambiguous"; candidates: ClarifyCompany[] }
  | { status: "none" }
> {
  let items: { stockCode: string; stockName: string }[]
  try {
    items = await searchStocks(name, 8)
  } catch {
    return { status: "none" }
  }
  if (items.length === 0) return { status: "none" }
  const exact = items.filter((it) => it.stockName === name || it.stockName.startsWith(name))
  const pool = exact.length > 0 ? exact : items
  if (pool.length === 1) return { status: "unique", company: pool[0] }
  // 多条同名/相近：若第一条是精确全等且其余只是前缀包含，仍视为唯一
  const exactEquals = items.filter((it) => it.stockName === name)
  if (exactEquals.length === 1) return { status: "unique", company: exactEquals[0] }
  return { status: "ambiguous", candidates: pool.slice(0, 5) }
}

async function resolveCompanyAction(companyName: string): Promise<AssistantResolution> {
  const resolved = await resolveCompanyName(companyName)
  if (resolved.status === "unique") {
    return {
      intent: "company_research",
      reply: `找到「${resolved.company.stockName}」，可以进入它的研究空间。`,
      actions: [{ action: "company.open", stockCode: resolved.company.stockCode, stockName: resolved.company.stockName }],
      availability: "ready",
    }
  }
  if (resolved.status === "ambiguous") {
    return {
      intent: "company_research",
      reply: `「${companyName}」匹配到多家公司，请确认要研究哪一家：`,
      clarifyCompanies: resolved.candidates,
      availability: "needs_input",
    }
  }
  return {
    intent: "company_research",
    reply: `没有在 A 股（沪深北）中找到「${companyName}」。可以换个名称或代码试试。`,
    actions: [{ action: "search.focus" }],
    availability: "needs_input",
  }
}

async function resolveCompareAction(names: [string, string]): Promise<AssistantResolution> {
  const [left, right] = await Promise.all([resolveCompanyName(names[0]), resolveCompanyName(names[1])])
  if (left.status !== "unique" || right.status !== "unique") {
    // 任一实体未唯一确定：收集全部歧义/缺失，一次说清
    const clarifies: ClarifyCompany[] = [
      ...(left.status === "ambiguous" ? left.candidates : []),
      ...(right.status === "ambiguous" ? right.candidates : []),
    ]
    const missing = [left.status === "none" ? names[0] : null, right.status === "none" ? names[1] : null].filter(Boolean)
    return {
      intent: "compare",
      reply: missing.length > 0
        ? `没有找到「${missing.join("」「")}」，无法发起对比。可以先搜索确认公司。`
        : "对比的两家公司有歧义，请先确认：",
      clarifyCompanies: clarifies,
      actions: clarifies.length === 0 ? [{ action: "search.focus" }] : undefined,
      availability: "needs_input",
    }
  }
  if (left.company.stockCode === right.company.stockCode) {
    return {
      intent: "compare",
      reply: "两家是同一家公司，对比需要两家不同的公司。",
      availability: "needs_input",
    }
  }
  return {
    intent: "compare",
    reply: `可以对比「${left.company.stockName}」和「${right.company.stockName}」。对比基于本机已有的研究数据，缺失的部分不会假装可比。`,
    actions: [{ action: "navigate.compare", stockCodes: [left.company, right.company] }],
    availability: "ready",
  }
}

async function llmClassify(input: string): Promise<LlmIntentOutput | null> {
  const systemPrompt = [
    "你是 StockLens 产品的意图分类器。只输出 JSON，不输出任何其他文字。",
    "可用意图（六选一）：navigate（打开某页面）、product_help（询问产品功能怎么用）、concept_explain（解释通用金融/财务概念）、company_research（针对某家公司做研究/查看）、compare（对比两家公司）、unsupported（投资建议、全市场筛选、聊天寒暄等超出产品能力）。",
    "输出 schema：{\"intent\":\"...\",\"companyName\":\"公司中文名(可选)\",\"companyNames\":[\"甲\",\"乙\"](compare 时两项),\"term\":\"概念词(可选)\"}。",
    "约束：不要输出股票代码；不要编造公司名；term 只取概念词本身（如「ROE」「市盈率」）；用户问某公司某指标含义且期待该公司数据时归为 company_research，问概念本身归为 concept_explain。",
  ].join("\n")
  try {
    const result = await runLLM({
      task: "assistant_intent",
      promptVersion: "assistant-intent-v1",
      systemPrompt,
      userPrompt: input,
      temperature: 0,
      maxTokens: 400,
      timeoutMs: 15_000,
      networkRetries: 0,
    })
    if (result.trace.status === "failed") return null
    const parsed = parseLLMJson(result.output) as Partial<LlmIntentOutput>
    if (typeof parsed.intent !== "string" || !INTENT_ENUM.includes(parsed.intent)) return null
    return {
      intent: parsed.intent,
      companyName: typeof parsed.companyName === "string" ? parsed.companyName : undefined,
      companyNames: Array.isArray(parsed.companyNames)
        ? parsed.companyNames.filter((n): n is string => typeof n === "string").slice(0, 2)
        : undefined,
      term: typeof parsed.term === "string" ? parsed.term : undefined,
    }
  } catch (err) {
    if (err instanceof LLMConfigError) return null
    return null
  }
}

export async function POST(request: Request) {
  const limited = rateLimitResponse(request, { scope: "assistant-intent", limit: 30 })
  if (limited) return limited

  let body: { input?: unknown }
  try {
    body = (await request.json()) as { input?: unknown }
  } catch {
    return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 })
  }
  const input = typeof body.input === "string" ? body.input.trim() : ""
  if (input.length === 0 || input.length > 500) {
    return NextResponse.json({ error: "input 限 1–500 字符" }, { status: 400 })
  }

  // 合规预检：投资建议类请求在进入任何分类前拦截（与 followup / diagnosis 同一守卫）
  const restricted = detectRestrictedInvestmentRequest(input)
  if (restricted.restricted) {
    const resolution: AssistantResolution = {
      intent: "unsupported",
      reply: COMPLIANCE_REDIRECT_MESSAGE,
      availability: "unavailable",
    }
    return NextResponse.json({ ...resolution, compliance: { suggestedQuestions: COMPLIANCE_SUGGESTED_QUESTIONS } })
  }

  // 第一层：确定性规则（不调用模型）
  const rule = matchRule(input)
  if (rule) {
    switch (rule.action?.kind) {
      case "navigate": {
        const resolution: AssistantResolution =
          rule.action.target === "library"
            ? { intent: "navigate", reply: "好的，打开研究库。", actions: [{ action: "navigate.library" }], availability: "ready" }
            : { intent: "navigate", reply: "好的，回到首页。", actions: [{ action: "navigate.home" }], availability: "ready" }
        return NextResponse.json(resolution)
      }
      case "compare.open":
        return NextResponse.json(await resolveCompareAction(rule.action.companyNames))
      case "company.open":
        return NextResponse.json(await resolveCompanyAction(rule.action.companyName ?? ""))
      case "search.focus":
        return NextResponse.json({
          intent: "company_research",
          reply: rule.needInputHint ?? "请先在搜索框选出公司。",
          actions: [{ action: "search.focus" }],
          availability: "ready",
        } satisfies AssistantResolution)
      default:
        break
    }
    if (rule.intent === "concept_explain" && rule.explainTerm) {
      const resolution: AssistantResolution = {
        intent: "concept_explain",
        reply: `解释「${rule.explainTerm}」…`,
        explainTerm: rule.explainTerm,
        availability: "ready",
      }
      return NextResponse.json(resolution)
    }
  }

  // 规则未命中：先试产品功能清单（确定性），再交给模型分类
  const feature = findProductFeature(input)
  if (feature && /(怎么|如何|在哪|哪里|什么用|作用)/.test(input)) {
    const resolution: AssistantResolution = {
      intent: "product_help",
      reply: `${feature.name}：${feature.desc}。${feature.how}。（位置：${feature.page}；限制：${feature.limits}）`,
      availability: "ready",
    }
    return NextResponse.json(resolution)
  }

  const llm = await llmClassify(input)
  if (!llm) {
    return NextResponse.json(
      unavailableResolution("AI 分类服务暂时不可用，稍后可重试；导航、研究库与对比功能不受影响。"),
    )
  }

  switch (llm.intent) {
    case "navigate": {
      // 模型不给导航目标：给两张安全卡片让用户点
      return NextResponse.json({
        intent: "navigate",
        reply: "可以打开以下页面：",
        actions: [{ action: "navigate.library" }, { action: "navigate.home" }],
        availability: "ready",
      } satisfies AssistantResolution)
    }
    case "product_help": {
      const feature = findProductFeature(input)
      if (!feature) {
        return NextResponse.json(
          unavailableResolution("这个问题我还没有可确认的功能说明，先不猜。你可以问「怎么对比两家公司」「怎么导出笔记」。"),
        )
      }
      return NextResponse.json({
        intent: "product_help",
        reply: `${feature.name}：${feature.desc}。${feature.how}（位置：${feature.page}）`,
        availability: "ready",
      } satisfies AssistantResolution)
    }
    case "concept_explain": {
      const term = llm.term ?? input
      return NextResponse.json({ intent: "concept_explain", reply: `解释「${term}」…`, explainTerm: term, availability: "ready" } satisfies AssistantResolution)
    }
    case "company_research": {
      if (!llm.companyName) {
        return NextResponse.json({
          intent: "company_research",
          reply: "研究从一家公司开始：请先在搜索框选出公司。",
          actions: [{ action: "search.focus" }],
          availability: "ready",
        } satisfies AssistantResolution)
      }
      return NextResponse.json(await resolveCompanyAction(llm.companyName))
    }
    case "compare": {
      if (!llm.companyNames || llm.companyNames.length !== 2) {
        return NextResponse.json({
          intent: "compare",
          reply: "请说明要对比的两家公司，例如「对比美的和格力」。",
          availability: "needs_input",
        } satisfies AssistantResolution)
      }
      return NextResponse.json(await resolveCompareAction([llm.companyNames[0], llm.companyNames[1]]))
    }
    default:
      return NextResponse.json(
        unavailableResolution("这个请求超出了当前能力：本助手只做产品导航、功能说明、概念解释和研究引导，不做全市场筛选或投资建议。"),
      )
  }
}
