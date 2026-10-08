// P1 AI 助手 —— 确定性规则层与能力注册表测试

import { describe, expect, it } from "vitest"

import { ACTION_REGISTRY, PRODUCT_FEATURES, findProductFeature } from "@/lib/v5/assistant/capabilities"
import { matchRule } from "@/lib/v5/assistant/rules"

describe("确定性规则：导航", () => {
  it("「打开研究库」→ navigate.library，不调模型", () => {
    expect(matchRule("打开研究库")).toMatchObject({
      intent: "navigate",
      action: { kind: "navigate", target: "library" },
    })
  })

  it("「回到首页」→ navigate.home", () => {
    expect(matchRule("回到首页")).toMatchObject({
      intent: "navigate",
      action: { kind: "navigate", target: "home" },
    })
  })
})

describe("确定性规则：双公司对比", () => {
  it("「对比美的和格力」提取两家公司名", () => {
    expect(matchRule("对比美的和格力")).toMatchObject({
      intent: "compare",
      action: { kind: "compare.open", companyNames: ["美的", "格力"] },
    })
  })

  it("「对比美的与格力的盈利能力」剥离关注点尾缀", () => {
    expect(matchRule("对比美的与格力的盈利能力")).toMatchObject({
      intent: "compare",
      action: { kind: "compare.open", companyNames: ["美的", "格力"] },
    })
  })

  it("「对比」缺对象 → 给澄清提示，不猜公司", () => {
    expect(matchRule("对比一下")).toMatchObject({
      intent: "compare",
      needInputHint: expect.stringContaining("两家公司"),
    })
  })
})

describe("确定性规则：公司研究引导", () => {
  it("「打开美的的研究」提取公司名", () => {
    expect(matchRule("打开美的的研究")).toMatchObject({
      intent: "company_research",
      action: { kind: "company.open", companyName: "美的" },
    })
  })

  it("「研究一下」没有公司 → 引导选公司", () => {
    expect(matchRule("研究一下")).toMatchObject({
      intent: "company_research",
      action: { kind: "search.focus" },
      needInputHint: expect.stringContaining("公司"),
    })
  })
})

describe("确定性规则：概念解释", () => {
  it("「ROE 是什么意思」提取词条", () => {
    expect(matchRule("ROE 是什么意思")).toMatchObject({
      intent: "concept_explain",
      explainTerm: "ROE",
    })
  })

  it("「什么是市盈率」提取词条", () => {
    expect(matchRule("什么是市盈率")).toMatchObject({
      intent: "concept_explain",
      explainTerm: "市盈率",
    })
  })
})

describe("规则边界：不越权、不硬猜", () => {
  it("寒暄与投资建议类输入返回 null（交由服务端合规/模型处理）", () => {
    expect(matchRule("你好")).toBeNull()
    expect(matchRule("推荐明天涨幅最大的股票")).toBeNull()
  })

  it("空输入返回 null", () => {
    expect(matchRule("   ")).toBeNull()
  })
})

describe("能力注册表", () => {
  it("白名单动作均有定义且参数声明正确", () => {
    expect(ACTION_REGISTRY["navigate.compare"].params).toEqual(["stockCodes"])
    expect(ACTION_REGISTRY["company.open"].params).toEqual(["stockCode"])
    expect(ACTION_REGISTRY["navigate.home"].params).toEqual([])
  })

  it("产品功能清单来自真实功能，查找命中确定性关键词", () => {
    expect(PRODUCT_FEATURES.length).toBeGreaterThanOrEqual(6)
    expect(findProductFeature("怎么对比两家公司")?.id).toBe("research.compare")
    expect(findProductFeature("如何导出笔记")?.id).toBe("notes.export")
    expect(findProductFeature("这是什么神仙功能")).toBeNull()
  })
})
