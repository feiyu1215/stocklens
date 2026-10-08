import { describe, expect, it } from "vitest"

import { buildEventEvidence } from "@/lib/evidence/event-evidence"
import { buildFacts } from "@/lib/evidence/fact-builder"
import { toCompactEvidence } from "@/lib/ai/evidence-pack"
import { classifyFreshness, MARKET_STALE_DAYS, parseDataDate, staleQualifier } from "@/lib/metrics/freshness"

import { m } from "./helpers"

// Task 17.1 §P0：数据新鲜度四问
//   1) 新鲜的行情证据
//   2) 过期的行情证据（不得支撑"当前状态"结论）
//   3) 无法判定时效 → unknown（绝不静默 fresh）
//   4) 财务报告期数据不得因为"不是今天"被判为 stale

const NOW = new Date("2026-10-01T00:00:00Z")

const price = (date?: string) => ({ source: "fuyao" as const, domain: "prices" as const, field: "close_price", date })
const valuation = (date?: string) => ({ source: "fuyao" as const, domain: "valuation" as const, field: "pe_ttm", date })
const financial = (period: string) => ({ source: "fuyao" as const, domain: "financial" as const, field: "operating_income", period })

describe("P0 · 新鲜度判定", () => {
  it("1) 新鲜的行情证据 → fresh，且带数据日期", () => {
    const f = classifyFreshness({ sourceFields: [price("2026-09-30")], dimension: "market", period: "2026-09-30", now: NOW })
    expect(f.timeSensitive).toBe(true)
    expect(f.status).toBe("fresh")
    expect(f.dataAsOf).toBe("2026-09-30")
    expect(f.ageDays).toBe(1)
    expect(staleQualifier(f)).toBe("")
  })

  it("2) 过期的行情证据 → stale，并给出可读理由与显式声明", () => {
    const f = classifyFreshness({ sourceFields: [price("2026-08-01")], dimension: "market", period: "2026-08-01", now: NOW })
    expect(f.status).toBe("stale")
    expect(f.ageDays).toBe(61)
    expect(f.reason).toContain("超过")
    expect(staleQualifier(f)).toContain("当前状态无法由该数据确认")
    expect(staleQualifier(f)).toContain("2026-08-01")
  })

  it("阈值边界：等于阈值算 fresh，超过一天算 stale", () => {
    const atThreshold = classifyFreshness({ sourceFields: [price("2026-09-24")], dimension: "market", now: NOW })
    expect(atThreshold.ageDays).toBe(MARKET_STALE_DAYS)
    expect(atThreshold.status).toBe("fresh")
    const overThreshold = classifyFreshness({ sourceFields: [price("2026-09-23")], dimension: "market", now: NOW })
    expect(overThreshold.status).toBe("stale")
  })

  it("3) 时间敏感但无日期 → unknown（绝不静默 fresh）", () => {
    const f = classifyFreshness({ sourceFields: [price(undefined)], dimension: "market", now: NOW })
    expect(f.timeSensitive).toBe(true)
    expect(f.status).toBe("unknown")
    expect(f.reason).toContain("无法确定")
    expect(staleQualifier(f)).toBe("") // 只有 stale 才追加过期声明
  })

  it("行情类指标即使 sourceFields 为空也按时间敏感处理（不得落入报告期分支）", () => {
    const f = classifyFreshness({ sourceFields: [], dimension: "market", now: NOW })
    expect(f.timeSensitive).toBe(true)
    expect(f.status).toBe("unknown")
  })

  it("4) 财务报告期数据不按自然日判定 → fresh，且说明以报告期为准", () => {
    const f = classifyFreshness({ sourceFields: [financial("2026-Q2")], dimension: "growth", period: "2026-Q2", now: NOW })
    expect(f.timeSensitive).toBe(false)
    expect(f.status).toBe("fresh")
    expect(f.dataAsOf).toBe("2026-Q2")
    expect(f.reason).toContain("以报告期为准")
    expect(staleQualifier(f)).toBe("")
  })

  it("估值快照按时间敏感处理", () => {
    const fresh = classifyFreshness({ sourceFields: [valuation("2026-09-30")], dimension: "valuation", now: NOW })
    expect(fresh.timeSensitive).toBe(true)
    expect(fresh.status).toBe("fresh")
    const stale = classifyFreshness({ sourceFields: [valuation("2026-06-30")], dimension: "valuation", now: NOW })
    expect(stale.status).toBe("stale")
  })

  it("日期解析不会把报告期字符串当日历日期", () => {
    expect(parseDataDate("2026-Q2")).toBeNull()
    expect(parseDataDate("2026-09-30")).not.toBeNull()
    expect(parseDataDate("")).toBeNull()
    expect(parseDataDate(undefined)).toBeNull()
    expect(parseDataDate("2026-02-31")).toBeNull()
  })

  it("未来日期视为异常并返回 unknown", () => {
    const f = classifyFreshness({ sourceFields: [price("2026-10-02")], dimension: "market", now: NOW })
    expect(f.status).toBe("unknown")
    expect(f.ageDays).toBe(-1)
    expect(f.reason).toContain("晚于当前时间")
  })
})

describe("P0 · 证据层传播", () => {
  it("过期行情事实的 statement 末尾带「当前状态无法确认」声明，并携带 freshness", () => {
    const facts = buildFacts(
      [m("MKT_RETURN_20D", -8.4, { sourceFields: [price("2026-08-01")], period: "2026-08-01" })],
      { now: NOW },
    )
    expect(facts).toHaveLength(1)
    expect(facts[0].freshness?.status).toBe("stale")
    expect(facts[0].statement).toContain("当前状态无法由该数据确认")
  })

  it("新鲜行情事实不带过期声明", () => {
    const facts = buildFacts(
      [m("MKT_RETURN_20D", -8.4, { sourceFields: [price("2026-09-30")], period: "2026-09-30" })],
      { now: NOW },
    )
    expect(facts[0].freshness?.status).toBe("fresh")
    expect(facts[0].statement).not.toContain("当前状态无法由该数据确认")
  })

  it("财务事实不被判为过期，也不追加声明", () => {
    const facts = buildFacts(
      [m("FIN_REVENUE_YOY_YTD", 3.55, { period: "2026-Q2", comparisonPeriod: "2025-Q2", sourceFields: [financial("2026-Q2")] })],
      { now: NOW },
    )
    expect(facts[0].freshness?.status).toBe("fresh")
    expect(facts[0].freshness?.timeSensitive).toBe(false)
    expect(facts[0].statement).not.toContain("当前状态无法由该数据确认")
  })

  it("事件证据按事件日期判定（历史事实不按自然日判过期；2026-10-09 用户拍板取代旧口径）", () => {
    const ctx = {
      events: [
        {
          eventId: "EVT_ANOMALY_1",
          kind: "market_anomaly" as const,
          title: "异动",
          statement: "当日无异常波动记录。",
          sourceEndpoint: "special-data/anomaly-analysis-stock",
          eventDate: "2026-08-01",
          verifyStatus: "verified" as const,
        },
      ],
      coverage: {
        anomaly: "records" as const,
        attention: "records" as const,
        corporateAction: "records" as const,
        newsDisclosure: "unavailable" as const,
      },
      errors: [],
    }
    const evs = buildEventEvidence(ctx as never, { now: NOW })
    const fact = evs.find((e) => e.type === "fact")
    // 事件日期是很久以前 → 依旧是 fresh（以事件日期为准），statement 不带 stale 限定语，
    // 顶栏也不会因此永久显示"数据已过期"
    expect(fact?.freshness?.status).toBe("fresh")
    expect(fact?.freshness?.timeSensitive).toBe(false)
    expect(fact?.freshness?.dataAsOf).toBe("2026-08-01")
    expect(fact?.freshness?.reason).toContain("事件日期")
    expect(fact?.statement).not.toContain("当前状态无法由该数据确认")
  })

  it("新鲜度进入 AI 上下文（时间敏感证据必带 freshness/数据日期/理由）", () => {
    const facts = buildFacts(
      [m("MKT_RETURN_20D", -8.4, { sourceFields: [price("2026-08-01")], period: "2026-08-01" })],
      { now: NOW },
    )
    const compact = toCompactEvidence(facts[0])
    expect(compact.freshness).toBe("stale")
    expect(compact.dataAsOf).toBe("2026-08-01")
    expect(compact.freshnessReason).toContain("超过")
  })

  it("财务证据进入 AI 上下文时不额外增加字段（保持紧凑）", () => {
    const facts = buildFacts(
      [m("FIN_REVENUE_YOY_YTD", 3.55, { period: "2026-Q2", sourceFields: [financial("2026-Q2")] })],
      { now: NOW },
    )
    const compact = toCompactEvidence(facts[0])
    expect(compact.freshness).toBeUndefined()
  })
})
