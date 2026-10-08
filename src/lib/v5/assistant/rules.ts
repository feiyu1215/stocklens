// P1 AI 助手 —— 确定性规则层（第一层：操作识别的规则优先部分）。
//
// 纪律：能不调模型就不调。明确指令直接映射；表达模糊才交给 /api/assistant/intent。
// 本模块 client-safe、纯函数、可单测。

import type { AssistantIntent, ClarifyCompany } from "./capabilities"

export interface RuleMatch {
  intent: AssistantIntent
  /** 命中的动作 id（navigate/company.open/compare.open/search.focus 由客户端执行） */
  action?:
    | { kind: "navigate"; target: "home" | "library" }
    | { kind: "company.open"; companyName?: string }
    | { kind: "compare.open"; companyNames: [string, string] }
    | { kind: "search.focus" }
  /** 概念解释词条 */
  explainTerm?: string
  /** 公司歧义候选由服务端/客户端解析后填入 */
  clarifyCompanies?: ClarifyCompany[]
  /** 命中规则但缺少必要实体时的提示 */
  needInputHint?: string
}

const NAV_LIBRARY = /(打开|回到|去|进入|查看).{0,6}(研究库|公司研究矩阵|库)/
const NAV_HOME = /(打开|回到|返回|去).{0,4}(首页|主页|开始页)/
const COMPARE = /^(?:帮我)?(?:对比|比较)\s*[:：]?\s*(.+?)\s*(?:和|与|跟|vs)\s*(.+?)(?:的.{0,8})?$/
const COMPARE_PREFIX = /^(?:帮我)?(?:对比|比较)/
const COMPANY_OPEN = /(?:打开|进入|查看|研究)\s*.{0,4}?([\u4e00-\u9fa5A-Za-z0-9]{2,10}?)(?:的)?(?:研究|画布|空间)/
const COMPANY_RESEARCH = /(?:研究|分析|看看)\s*([\u4e00-\u9fa5A-Za-z0-9]{2,10})(?:最近|的)?(?:怎么样|如何|表现)?/
const EXPLAIN = /^(?:什么(?:是|叫)|(?:解释|介绍)(?:一下)?)[\s：:]*(.{1,12}?)(?:是什么|的意思|含义)?[?？。]?$/
const EXPLAIN_SUFFIX = /([\u4e00-\u9fa5A-Za-z0-9]{1,12})\s*(?:是什么(?:意思|含义)?|啥意思)/

/** 去掉常见口语修饰词，留下公司名主体 */
function cleanName(raw: string): string {
  return raw
    .replace(/^(一下|这个|那个|帮我|给我)/, "")
    .replace(/(公司|集团|股份)$/, "")
    .trim()
}

/**
 * 确定性规则匹配。返回 null 表示交给模型分类。
 * 顺序：导航 → 对比 → 打开公司研究 → 概念解释 → 泛研究请求。
 */
export function matchRule(input: string): RuleMatch | null {
  const text = input.trim()
  if (!text) return null

  if (NAV_LIBRARY.test(text)) return { intent: "navigate", action: { kind: "navigate", target: "library" } }
  if (NAV_HOME.test(text)) return { intent: "navigate", action: { kind: "navigate", target: "home" } }

  const compare = COMPARE.exec(text)
  if (compare) {
    const a = cleanName(compare[1])
    const b = cleanName(compare[2])
    if (a && b) {
      return { intent: "compare", action: { kind: "compare.open", companyNames: [a, b] } }
    }
    return { intent: "compare", needInputHint: "请说明要对比的两家公司，例如「对比美的和格力」" }
  }
  // 「对比」开头但没给出两个对象：给澄清提示，不猜公司
  if (COMPARE_PREFIX.test(text)) {
    return { intent: "compare", needInputHint: "请说明要对比的两家公司，例如「对比美的和格力」" }
  }

  const companyOpen = COMPANY_OPEN.exec(text)
  if (companyOpen) {
    const name = cleanName(companyOpen[1])
    if (name) return { intent: "company_research", action: { kind: "company.open", companyName: name } }
  }

  const explain = EXPLAIN.exec(text) ?? EXPLAIN_SUFFIX.exec(text)
  if (explain) {
    const term = cleanName(explain[1])
    if (term) return { intent: "concept_explain", explainTerm: term }
  }

  const research = COMPANY_RESEARCH.exec(text)
  if (research) {
    const name = cleanName(research[1])
    if (name) return { intent: "company_research", action: { kind: "company.open", companyName: name } }
    // 有研究意图但没说公司 → 引导选公司
    return { intent: "company_research", action: { kind: "search.focus" }, needInputHint: "研究从一家公司开始：请先在搜索框选出公司" }
  }

  return null
}
