// 合规守卫 —— P0 确定性规则（非完整金融合规模型）。
//
// 两道防线：
// 1. Pre-check：用户问题中出现明显投资建议请求 → 直接 redirect，不进入普通诊断；
// 2. Post-check：AI 输出文本中出现禁止表达 → 校验失败（触发 repair 或 AI failure）。
// Prompt 与确定性校验是双保险，任何一层都不能单独依赖。

export interface RestrictedRequestDetection {
  restricted: boolean
  matchedPattern?: string
}

/** 用户问题侧：明显买卖建议 / 目标价 / 涨跌预测请求 */
const RESTRICTED_PATTERNS: string[] = [
  "能买吗", "可以买吗", "可以买么", "能买入吗", "该买吗", "该不该买", "值得买吗",
  "值不值得买", "要不要买", "建议买入", "建议卖出", "该卖吗", "要不要卖", "能卖吗",
  "买不买", "卖不卖", "现在买", "现在卖", "目标价", "能涨多少", "会涨多少",
  "能跌多少", "收益多少", "会不会涨", "会不会跌", "会涨吗", "会跌吗", "还能涨吗",
  "加仓", "减仓", "清仓", "满仓", "抄底", "止盈", "止损",
  // P1 补充（实测发现覆盖缺口）：助手入口上"推荐+涨幅/买什么/选股"类请求此前只能靠
  // 模型兜底判为不支持，合规守卫未命中——确定性防线必须自己接住。
  "涨幅最大", "涨幅最高", "涨得最好", "涨最多", "涨的最好",
  "买什么", "买哪只", "买那只", "买哪支", "选哪只", "选哪支", "帮我选股", "帮我选只",
  "推荐买", "推荐几只", "推荐一只", "推荐一隻", "推荐股票", "推荐个股", "推荐什么股", "推荐哪只",
  "最值得买", "值得投", "该投哪个", "投资哪只", "投哪只", "投资哪个",
  "明天涨", "明天会涨", "预测涨", "翻倍股", "牛股", "黑马股", "潜力股推荐",
]

const RESTRICTED_ENGLISH = /\b(buy|sell|target price|should i (buy|sell))\b/i

export function detectRestrictedInvestmentRequest(question: string): RestrictedRequestDetection {
  const normalized = question.toLowerCase().replace(/\s+/g, "")
  for (const pattern of RESTRICTED_PATTERNS) {
    if (normalized.includes(pattern)) {
      return { restricted: true, matchedPattern: pattern }
    }
  }
  const englishMatch = RESTRICTED_ENGLISH.exec(question)
  if (englishMatch) {
    return { restricted: true, matchedPattern: englishMatch[0] }
  }
  return { restricted: false }
}

/** AI 输出侧：禁止的建议 / 预测 / 评级表达 */
const FORBIDDEN_OUTPUT_PATTERNS: string[] = [
  "建议买入", "建议卖出", "强烈推荐", "可以买入", "可以卖出", "应该买", "应该卖",
  "值得买", "值得卖", "推荐买入", "推荐卖出", "预计上涨", "预计下跌",
  "预测将上涨", "预测将下跌", "保证收益", "收益率可达", "稳赚", "必涨", "必跌",
  "看涨", "看跌", "强势股", "差股票", "A评级", "买入评级",
]

/** 断言类禁词（高估/低估/目标价）：无 benchmark 时禁止断言，但允许否定语境（「不能判断是否低估」「不提供目标价」） */
const VALUATION_ASSERTION_PATTERN =
  /(?<!无法)(?<!不能)(?<!难以)(?<!是否)(?<!判断)(?<!认定)(?<!或)(?<!还是)(?<!不提供)(?<!提供)(?<!没有)(高估|低估|目标价)/g

/** 评级/优劣断言 */
const RATING_PATTERN = /优秀|基本面良好|质地优良|一流企业|龙头地位稳固/g

export interface OutputComplianceIssue {
  pattern: string
  excerpt: string
}

export function findForbiddenOutputPhrases(text: string): OutputComplianceIssue[] {
  const issues: OutputComplianceIssue[] = []
  for (const pattern of FORBIDDEN_OUTPUT_PATTERNS) {
    const idx = text.indexOf(pattern)
    if (idx !== -1) {
      issues.push({ pattern, excerpt: text.slice(Math.max(0, idx - 10), idx + pattern.length + 10) })
    }
  }
  for (const match of matchAll(text, VALUATION_ASSERTION_PATTERN)) {
    issues.push({ pattern: "valuation-assertion", excerpt: match })
  }
  for (const match of matchAll(text, RATING_PATTERN)) {
    issues.push({ pattern: "rating-assertion", excerpt: match })
  }
  return issues
}

function matchAll(text: string, pattern: RegExp): string[] {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
  return [...text.matchAll(re)].map((m) => m[0])
}

export const COMPLIANCE_REDIRECT_MESSAGE =
  "StockLens 不提供买卖建议或目标价，也不做确定性涨跌预测。你可以继续从经营、盈利质量、现金流、估值、行情和风险证据理解公司当前状态。"

export const COMPLIANCE_SUGGESTED_QUESTIONS = [
  "公司现在经营情况怎么样？",
  "当前估值有哪些可以确认的事实？",
  "最近行情有什么特征？",
]
