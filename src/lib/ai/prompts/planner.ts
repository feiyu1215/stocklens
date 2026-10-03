import type { DiagnosisDimension } from "@/lib/ai/types"

export const PLANNER_PROMPT_VERSION = "planner_v2"

export interface PlannerPromptInput {
  stockCode: string
  stockName: string
  question: string
  availableCapabilities: DiagnosisDimension[]
  unavailableCapabilities: DiagnosisDimension[]
}

const DIMENSION_SEMANTICS: Record<DiagnosisDimension, string> = {
  growth: "经营增长（收入/利润同比，累计与单季）",
  profitability: "盈利能力（毛利率/净利率/ROE 及其同比变化）",
  cashflow: "现金流质量（经营现金流同比、现金流/净利润）",
  valuation: "估值（PE/PB 快照；历史分位与行业比较不可用）",
  market: "行情特征（区间收益率、波动率、最大回撤）",
  industry: "行业位置（当前无行业与同行数据）",
  risk: "风险事件（当前无公告/新闻事件数据）",
}

export function buildPlannerSystemPrompt(): string {
  const semantics = (Object.keys(DIMENSION_SEMANTICS) as DiagnosisDimension[])
    .map((d) => `- ${d}: ${DIMENSION_SEMANTICS[d]}`)
    .join("\n")
  return [
    "你是 StockLens 的研究规划器。你只负责根据用户问题，选择本轮应该查看的一组研究维度。",
    "",
    "可用维度及其含义：",
    semantics,
    "",
    "硬性约束：",
    "1. 你看不到任何金融数据、指标或证据。你没有任何事实依据。",
    "2. 禁止输出任何金融事实、数字或对公司的判断（例如「公司增长较弱」「估值较低」「毛利率下降」「风险较高」）。",
    "3. dimensions 只能从可用维度中选择，最多 4 个；无法获取的维度不要选。",
    "4. optionalDimensions 仅在与问题相关且对理解有直接帮助时填写，否则为空数组。",
    "5. reason 用一句话说明为什么选择这些维度，不得包含任何数字。",
    "6. dimensions 按与用户问题的相关度排序，最相关的在前。",
    "",
    "只输出一个 JSON 对象，不要输出其他文字：",
    '{"intent": "overall_diagnosis|growth_review|profitability_review|cashflow_review|valuation_review|market_review|risk_review", "dimensions": [...], "optionalDimensions": [...], "reason": "..."}',
  ].join("\n")
}

export function buildPlannerUserPrompt(input: PlannerPromptInput): string {
  return JSON.stringify({
    stockCode: input.stockCode,
    stockName: input.stockName,
    question: input.question,
    availableCapabilities: input.availableCapabilities,
    unavailableCapabilities: input.unavailableCapabilities,
  })
}

/** repair 阶段：附带上次校验失败原因 */
export function buildPlannerRepairPrompt(previousOutput: string, issues: string[]): string {
  return [
    "你上一次的输出未通过校验：",
    ...issues.map((i) => `- ${i}`),
    "",
    "上一次输出：",
    previousOutput,
    "",
    "请重新输出一个完全符合要求的 JSON 对象（只输出 JSON，不要其他文字）。",
  ].join("\n")
}
