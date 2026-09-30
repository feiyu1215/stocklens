import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { searchStocks } from "@/lib/data/stock-search"
import { initResearchSpace } from "@/lib/research/init-space"
import { stubFetch, VALID_PLANNER_JSON } from "./ai/helpers"

const ORIGINAL_FUYAO = process.env.FUYAO_API_KEY
const ORIGINAL_DEEPSEEK = process.env.DEEPSEEK_API_KEY

beforeEach(() => {
  process.env.FUYAO_API_KEY = "test"
  process.env.DEEPSEEK_API_KEY = "test"
})

afterEach(() => {
  vi.unstubAllGlobals()
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  restore("FUYAO_API_KEY", ORIGINAL_FUYAO)
  restore("DEEPSEEK_API_KEY", ORIGINAL_DEEPSEEK)
})

describe("Company Search（§4–§6）", () => {
  it("只返回 A 股并规范化字段（真实 stub 数据）", async () => {
    const { fetchMock } = stubFetch()
    vi.stubGlobal("fetch", fetchMock)
    const items = await searchStocks("美的")
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].stockCode).toBe("000333.SZ")
    expect(items[0].stockName).toBe("美的集团")
    expect(items[0].market).toBe("深交所")
  })

  it("空查询返回空数组（不打接口）", async () => {
    const { fetchMock } = stubFetch()
    vi.stubGlobal("fetch", fetchMock)
    const items = await searchStocks("   ")
    expect(items).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("Research Init（§39–§41/§77）", () => {
  const VALID_FRAME = JSON.stringify({
    intent: "open_exploration",
    dimensions: [
      { label: "增长韧性", researchQuestion: "增长是否稳健？", capabilityRefs: ["financial_growth"], rationale: "关注收入持续性" },
      { label: "盈利质量", researchQuestion: "利润率如何变化？", capabilityRefs: ["profitability"], rationale: "关注盈利水平" },
      { label: "现金转化", researchQuestion: "现金流是否匹配利润？", capabilityRefs: ["cashflow"], rationale: "关注现金创造" },
      { label: "估值定位", researchQuestion: "估值处于什么位置？", capabilityRefs: ["valuation"], rationale: "关注定价水平" },
    ],
    suggestedDimensions: [
      { label: "海外业务", researchQuestion: "海外占比如何？", capabilityRefs: ["event"], rationale: "探索性角度" },
    ],
    framingReason: "按公司特点组织维度",
  })

  const VALID_COMPOSER = JSON.stringify({
    overview: "研究空间概述",
    dimensions: [
      { dimensionId: "DIM_AI_INITIAL_01_增长韧性", claims: [{ text: "收入保持增长", type: "fact", signal: "positive", evidenceIds: ["EV_FACT_FIN_REVENUE_YOY_YTD"] }] },
      { dimensionId: "DIM_AI_INITIAL_02_盈利质量", claims: [{ text: "毛利率同比下降", type: "fact", signal: "negative", evidenceIds: ["EV_FACT_FIN_GROSS_MARGIN_CHANGE_YOY"] }] },
      { dimensionId: "DIM_AI_INITIAL_03_现金转化", claims: [{ text: "现金流覆盖利润", type: "fact", signal: "positive", evidenceIds: ["EV_FACT_FIN_CFO_TO_NET_PROFIT_YTD"] }] },
      { dimensionId: "DIM_AI_INITIAL_04_估值定位", claims: [{ text: "PE 快照", type: "fact", signal: "neutral", evidenceIds: ["EV_FACT_VAL_PE_TTM"] }] },
    ],
  })

  it("成功路径：company context + 动态维度 + grounded claims", async () => {
    const { fetchMock, setScript } = stubFetch()
    setScript({ planner: [VALID_FRAME], synthesizer: [VALID_COMPOSER] })
    vi.stubGlobal("fetch", fetchMock)

    const resp = await initResearchSpace({ stockCode: "000333.SZ" })
    expect(resp.ai.status).toBe("success")
    expect(resp.company.industryName).toBe("白色家电")
    expect(resp.dimensions).toHaveLength(4)
    expect(resp.dimensions[0].label).toBe("增长韧性")
    expect(resp.suggestions).toHaveLength(1)
    // 所有 claim 的引用都在其维度证据包内（grounded）
    for (const claim of resp.claims) {
      const dim = resp.dimensions.find((d) => d.dimensionId === claim.dimensionId)!
      for (const id of claim.evidenceIds) {
        expect(dim.evidenceIds).toContain(id)
      }
    }
    // 证据只包含被维度使用的部分（上下文预算受控）
    const used = new Set(resp.dimensions.flatMap((d) => d.evidenceIds))
    expect(resp.evidence.every((e) => used.has(e.evidenceId))).toBe(true)
  })

  it("§77 Framer 失败：仍返回 company + 完整证据，AI 状态 failed（不编维度）", async () => {
    const { fetchMock, setScript } = stubFetch()
    setScript({ planner: ["not json", "still not json"] })
    vi.stubGlobal("fetch", fetchMock)

    const resp = await initResearchSpace({ stockCode: "000333.SZ" })
    expect(resp.ai.status).toBe("failed")
    expect(resp.dimensions).toEqual([])
    expect(resp.evidence.length).toBeGreaterThan(20) // Truth Layer 完整保留
    expect(resp.company.capabilities.length).toBeGreaterThan(0)
  })

  it("Composer 失败：维度仍在（partial），claims 为空，ai=partial_failure", async () => {
    const { fetchMock, setScript } = stubFetch()
    setScript({ planner: [VALID_FRAME], synthesizer: ["bad", "bad"] })
    vi.stubGlobal("fetch", fetchMock)

    const resp = await initResearchSpace({ stockCode: "000333.SZ" })
    expect(resp.ai.status).toBe("partial_failure")
    expect(resp.dimensions).toHaveLength(4)
    expect(resp.claims).toEqual([])
    expect(resp.dimensions.every((d) => d.evidenceIds.length > 0)).toBe(true)
  })

  it("Composer 伪造证据引用 → 校验失败（repair 后仍失败则 partial）", async () => {
    const fabricated = JSON.stringify({
      overview: "x",
      dimensions: [
        { dimensionId: "DIM_AI_INITIAL_01_增长韧性", claims: [{ text: "编造", type: "fact", signal: "positive", evidenceIds: ["EV_FAKE_999"] }] },
      ],
    })
    const { fetchMock, setScript } = stubFetch()
    setScript({ planner: [VALID_FRAME], synthesizer: [fabricated, fabricated] })
    vi.stubGlobal("fetch", fetchMock)

    const resp = await initResearchSpace({ stockCode: "000333.SZ" })
    expect(resp.ai.status).toBe("partial_failure")
    expect(resp.claims).toEqual([])
    expect(resp.ai.issues?.join(" ")).toContain("EV_FAKE_999")
  })

  it("空问题走 open_exploration（question=undefined 允许）", async () => {
    const { fetchMock, deepseekCalls, setScript } = stubFetch()
    setScript({ planner: [VALID_FRAME], synthesizer: [VALID_COMPOSER] })
    vi.stubGlobal("fetch", fetchMock)
    const resp = await initResearchSpace({ stockCode: "000333.SZ" })
    expect(resp.entryQuestion).toBeUndefined()
    const framerCall = deepseekCalls.find((c) => c.system.includes("研究框架设计器"))!
    expect(framerCall.user).toContain('"mode":"open_exploration"')
    // Framer 输入不含任何金融数字（§21–§22）
    expect(framerCall.user).not.toContain("operating_income")
    expect(framerCall.user).not.toContain("pe_ttm")
  })

  void VALID_PLANNER_JSON
})
