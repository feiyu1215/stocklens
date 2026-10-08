// 证据快刷（阶段 4 / P1-2）—— 服务端 refreshEvidence 测试（stubFetch，不打外网）

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { refreshEvidence } from "@/lib/research/refresh"
import { stubFetch } from "./ai/helpers"

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

describe("refreshEvidence（快刷数据层重算）", () => {
  it("重算全部数据层且 retrievedAt 一并更新；零模型调用（路线 A 核心承诺）", async () => {
    const { fetchMock, deepseekCalls } = stubFetch()
    vi.stubGlobal("fetch", fetchMock)

    const before = new Date(Date.now() - 60_000).toISOString()
    const resp = await refreshEvidence({ stockCode: "000333.SZ" })

    // 数据层完整返回
    expect(resp.stockCode).toBe("000333.SZ")
    expect(resp.evidence.length).toBeGreaterThan(0)
    expect(resp.metrics.length).toBeGreaterThan(0)
    expect(resp.marketHistory.source).toBe("fuyao")
    expect(resp.marketHistory.latestDate).toBeTruthy()
    expect(resp.marketHistory.points.length).toBeGreaterThan(0)

    // retrievedAt 必须一并更新（否则刷完仍判定 stale）
    expect(resp.retrievedAt > before).toBe(true)
    const withFreshness = resp.evidence.filter((e) => e.freshness?.retrievedAt)
    expect(withFreshness.length).toBeGreaterThan(0)
    for (const e of withFreshness) {
      expect(e.freshness!.retrievedAt).toBe(resp.retrievedAt)
    }

    // 路线 A：快刷绝不调用模型（结论文本不重写，由前端打标记）
    expect(deepseekCalls.length).toBe(0)
  })

  it("确定性证据 ID 不变（EV_FACT_${metricId}）——同 ID 可原地替换", async () => {
    const { fetchMock } = stubFetch()
    vi.stubGlobal("fetch", fetchMock)

    const first = await refreshEvidence({ stockCode: "000333.SZ" })
    const second = await refreshEvidence({ stockCode: "000333.SZ" })
    const firstFactIds = first.evidence.filter((e) => e.type === "fact").map((e) => e.evidenceId).sort()
    const secondFactIds = second.evidence.filter((e) => e.type === "fact").map((e) => e.evidenceId).sort()
    expect(secondFactIds).toEqual(firstFactIds)
  })
})
