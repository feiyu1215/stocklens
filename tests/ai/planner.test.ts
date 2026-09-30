import { afterEach, describe, expect, it, vi } from "vitest"

import { parseLLMJson } from "@/lib/ai/model"
import type { PlannerPromptInput } from "@/lib/ai/prompts/planner"
import { runPlanner, validatePlannerResult } from "@/lib/ai/planner"
import { stubFetch } from "./helpers"

const ORIGINAL_FUYAO = process.env.FUYAO_API_KEY
const ORIGINAL_DEEPSEEK = process.env.DEEPSEEK_API_KEY

afterEach(() => {
  vi.unstubAllGlobals()
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  restore("FUYAO_API_KEY", ORIGINAL_FUYAO)
  restore("DEEPSEEK_API_KEY", ORIGINAL_DEEPSEEK)
})

describe("validatePlannerResult（§13）", () => {
  const valid = {
    intent: "overall_diagnosis",
    dimensions: ["growth", "profitability", "cashflow"],
    optionalDimensions: ["valuation"],
    reason: "用户询问整体经营状态，优先覆盖增长、盈利与现金流维度。",
  }

  it("合法输出通过", () => {
    expect(validatePlannerResult(valid)).toMatchObject({ ok: true })
  })

  it("intent 非法", () => {
    expect(validatePlannerResult({ ...valid, intent: "make_money" }).ok).toBe(false)
  })

  it("dimensions 为空", () => {
    expect(validatePlannerResult({ ...valid, dimensions: [] }).ok).toBe(false)
  })

  it("dimensions 重复", () => {
    expect(validatePlannerResult({ ...valid, dimensions: ["growth", "growth"] }).ok).toBe(false)
  })

  it("dimensions 超过 4 个", () => {
    expect(
      validatePlannerResult({ ...valid, dimensions: ["growth", "profitability", "cashflow", "valuation", "market"] }).ok,
    ).toBe(false)
  })

  it("dimensions 枚举非法", () => {
    expect(validatePlannerResult({ ...valid, dimensions: ["hot_stocks"] }).ok).toBe(false)
  })

  it("dimensions 与 optionalDimensions 重叠", () => {
    expect(validatePlannerResult({ ...valid, optionalDimensions: ["growth"] }).ok).toBe(false)
  })

  it("reason 含数字 → 失败（Planner 没有数据依据）", () => {
    expect(validatePlannerResult({ ...valid, reason: "收入增长 3.55% 所以选 growth" }).ok).toBe(false)
  })

  it("reason 含未经支持的评价 → 失败", () => {
    expect(validatePlannerResult({ ...valid, reason: "公司增长较弱所以查看增长维度" }).ok).toBe(false)
  })

  it("reason 过长", () => {
    expect(validatePlannerResult({ ...valid, reason: "长".repeat(121) }).ok).toBe(false)
  })
})

describe("parseLLMJson", () => {
  it("容忍 ```json 围栏", () => {
    expect(parseLLMJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it("容忍前后杂文字", () => {
    expect(parseLLMJson('好的，以下是结果：{"a":1} 请查收')).toEqual({ a: 1 })
  })
  it("非 JSON 抛错", () => {
    expect(() => parseLLMJson("抱歉我做不到")).toThrow(/JSON/)
  })
})

describe("runPlanner（mock LLM，无外网依赖）", () => {
  const input: PlannerPromptInput = {
    stockCode: "000333.SZ",
    stockName: "美的集团",
    question: "公司现在经营情况怎么样？",
    availableCapabilities: ["growth", "profitability", "cashflow", "valuation", "market"],
    unavailableCapabilities: ["industry", "risk"],
  }

  it("成功路径：一次通过，retries=0", async () => {
    const { fetchMock, setScript } = stubFetch()
    setScript({ planner: ['{"intent":"overall_diagnosis","dimensions":["growth","profitability","cashflow"],"optionalDimensions":[],"reason":"用户询问整体经营状态。"}'] })
    vi.stubGlobal("fetch", fetchMock)
    process.env.FUYAO_API_KEY = "test"
    process.env.DEEPSEEK_API_KEY = "test"

    const run = await runPlanner(input)
    expect(run.status).toBe("success")
    expect(run.planner?.dimensions).toEqual(["growth", "profitability", "cashflow"])
    expect(run.trace.status).toBe("success")
    expect(run.trace.retries).toBe(0)
    expect(run.trace.promptVersion).toBe("planner_v1")
  })

  it("§8 repair：第一次校验失败，repair 一次成功", async () => {
    const { fetchMock, setScript } = stubFetch()
    setScript({
      planner: [
        '{"intent":"overall_diagnosis","dimensions":[],"optionalDimensions":[],"reason":"空"}',
        '{"intent":"overall_diagnosis","dimensions":["growth"],"optionalDimensions":[],"reason":"用户询问增长。"}',
      ],
    })
    vi.stubGlobal("fetch", fetchMock)
    process.env.FUYAO_API_KEY = "test"
    process.env.DEEPSEEK_API_KEY = "test"

    const run = await runPlanner(input)
    expect(run.status).toBe("success")
    expect(run.trace.retries).toBe(1)
    expect(run.trace.validationIssues?.length).toBeGreaterThan(0)
  })

  it("repair 后仍失败 → AI failure（不编造结果）", async () => {
    const { fetchMock, setScript } = stubFetch()
    setScript({ planner: ["not json at all", "still not json"] })
    vi.stubGlobal("fetch", fetchMock)
    process.env.FUYAO_API_KEY = "test"
    process.env.DEEPSEEK_API_KEY = "test"

    const run = await runPlanner(input)
    expect(run.status).toBe("failed")
    expect(run.trace.status).toBe("failed")
    expect(run.planner).toBeUndefined()
  })

  it("模型超时 → failed（重试 1 次后放弃）", async () => {
    const { fetchMock, setScript } = stubFetch()
    setScript({ planner: ["timeout", "timeout"] })
    vi.stubGlobal("fetch", fetchMock)
    process.env.FUYAO_API_KEY = "test"
    process.env.DEEPSEEK_API_KEY = "test"

    const run = await runPlanner(input)
    expect(run.status).toBe("failed")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("缺 DEEPSEEK_API_KEY → failed 且不发任何请求", async () => {
    const { fetchMock } = stubFetch()
    vi.stubGlobal("fetch", fetchMock)
    process.env.FUYAO_API_KEY = "test"
    delete process.env.DEEPSEEK_API_KEY

    const run = await runPlanner(input)
    expect(run.status).toBe("failed")
    expect(run.trace.validationIssues?.[0]).toContain("DEEPSEEK_API_KEY")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
