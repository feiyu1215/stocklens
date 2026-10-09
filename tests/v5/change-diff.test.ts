import { describe, expect, it } from "vitest"
import { diffPayloads, PCT_POINT_THRESHOLD } from "@/lib/v5/change-diff"
import type { ResearchSpacePayload } from "@/components/observatory/theme"
import type { MetricResult } from "@/lib/metrics/types"
import type { Evidence } from "@/lib/evidence/types"

const metric = (over: Partial<MetricResult> & { metricId: string }): MetricResult => ({
  dimension: "profitability",
  name: over.metricId,
  status: "available",
  value: null,
  unit: "%",
  sourceFields: [],
  calculationMethod: "test",
  ...over,
})

const evidence = (id: string, statement: string): Evidence =>
  ({
    evidenceId: id,
    dimension: "profitability",
    title: id,
    statement,
    type: "FACT",
    signal: "neutral",
    confidence: "high",
    metricIds: [],
    basedOn: [],
    sourceFields: [],
    verifyStatus: "verified",
    confidenceReason: "test",
  }) as unknown as Evidence

function payload(code: string, metrics: MetricResult[], evs: Evidence[], claims: { claimId: string; evidenceIds: string[] }[] = []): ResearchSpacePayload {
  return {
    spaceId: "S",
    company: { stockCode: code } as never,
    frame: { intent: "", framingReason: "" },
    dimensions: [],
    claims: claims as never,
    evidence: evs,
    suggestions: [],
    trend: [],
    metrics,
    ai: { status: "success" },
    errors: [],
  } as unknown as ResearchSpacePayload
}

const NOW = Date.parse("2026-10-10T00:00:00Z")

describe("M1 · 结构化变化差分", () => {
  it("数值变化：同报告期同口径，差值越过阈值才报", () => {
    const before = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 25.0, period: "2026-Q2" })], [evidence("EV_FACT_FIN_GROSS_MARGIN", "毛利率 25%")])
    const after = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 23.5, period: "2026-Q2" })], [evidence("EV_FACT_FIN_GROSS_MARGIN", "毛利率 23.5%")])
    const set = diffPayloads(before, after, NOW)
    expect(set.items).toHaveLength(1)
    expect(set.items[0].kind).toBe("value")
    expect(set.items[0].delta).toBeCloseTo(-1.5, 5)
    expect(set.hasQualifiedChange).toBe(true)
  })

  it("不算变化①：舍入级波动不报", () => {
    const before = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 25.01, period: "2026-Q2" })], [])
    const after = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 25.02, period: "2026-Q2" })], [])
    const set = diffPayloads(before, after, NOW)
    expect(set.items).toHaveLength(0)
    expect(set.hasQualifiedChange).toBe(false)
    expect(PCT_POINT_THRESHOLD).toBe(0.5)
  })

  it("不算变化②：报告期不同只报切换，不计算差额", () => {
    const before = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 25.0, period: "2025-Q4" })], [])
    const after = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 23.0, period: "2026-Q2" })], [])
    const set = diffPayloads(before, after, NOW)
    expect(set.items).toHaveLength(1)
    expect(set.items[0].kind).toBe("period")
    expect(set.items[0].delta).toBeNull()
    expect(set.items[0].basis).toContain("不直接计算差额")
  })

  it("不算变化③：任一方指标不可用时不推导", () => {
    const before = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 25.0, period: "2026-Q2" })], [])
    const after = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", status: "unavailable", value: null, period: "2026-Q2", unavailableReason: "缺数据" })], [])
    expect(diffPayloads(before, after, NOW).items).toHaveLength(0)
    expect(diffPayloads(after, before, NOW).items).toHaveLength(0)
  })

  it("证据变化：核心指标未变、证据更新 → 只标证据更新，不表述为经营变化", () => {
    const m = metric({ metricId: "FIN_GROSS_MARGIN", value: 25.0, period: "2026-Q2" })
    const before = payload("000333.SZ", [m], [evidence("EV_FACT_FIN_GROSS_MARGIN", "毛利率 25%（旧口径）")])
    const after = payload("000333.SZ", [m], [evidence("EV_FACT_FIN_GROSS_MARGIN", "毛利率 25%（新口径）")])
    const set = diffPayloads(before, after, NOW)
    expect(set.items).toHaveLength(1)
    expect(set.items[0].kind).toBe("evidence")
    expect(set.items[0].basis).toContain("不表述为经营变化")
  })

  it("结论状态：受影响结论进入 claimRecheckIds，且每条变化自带 claimIds", () => {
    const claims = [{ claimId: "C1", evidenceIds: ["EV_FACT_FIN_GROSS_MARGIN"] }]
    const before = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 25.0, period: "2026-Q2" })], [], claims)
    const after = payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 23.0, period: "2026-Q2" })], [], claims)
    const set = diffPayloads(before, after, NOW)
    expect(set.claimRecheckIds).toEqual(["C1"])
    expect(set.items[0].claimIds).toEqual(["C1"])
  })

  it("解释护栏：带 interpretationFlags 的指标不得按普通数值变化呈现", () => {
    const before = payload("000333.SZ", [metric({ metricId: "FIN_NET_PROFIT_YOY_YTD", value: 2.0, period: "2026-Q2" })], [])
    const after = payload("000333.SZ", [metric({ metricId: "FIN_NET_PROFIT_YOY_YTD", value: 40.0, period: "2026-Q2", interpretationFlags: ["low_base"] })], [])
    const set = diffPayloads(before, after, NOW)
    expect(set.items).toHaveLength(1)
    expect(set.items[0].guarded).toContain("low_base")
    expect(set.items[0].basis).toContain("不可直接解读为经营变化")
  })

  it("估值类走更严格的相对阈值（8% 不报 / 15% 报）", () => {
    const small = diffPayloads(
      payload("000333.SZ", [metric({ metricId: "VAL_PE_TTM", value: 20, unit: "x", period: "2026-10-08" })], []),
      payload("000333.SZ", [metric({ metricId: "VAL_PE_TTM", value: 21.6, unit: "x", period: "2026-10-08" })], []),
      NOW,
    )
    expect(small.items).toHaveLength(0)
    const big = diffPayloads(
      payload("000333.SZ", [metric({ metricId: "VAL_PE_TTM", value: 20, unit: "x", period: "2026-10-08" })], []),
      payload("000333.SZ", [metric({ metricId: "VAL_PE_TTM", value: 23, unit: "x", period: "2026-10-08" })], []),
      NOW,
    )
    expect(big.items).toHaveLength(1)
    expect(big.items[0].kind).toBe("value")
  })

  it("跨公司不猜：代码不匹配直接返回空集合", () => {
    const set = diffPayloads(
      payload("000333.SZ", [metric({ metricId: "FIN_GROSS_MARGIN", value: 25.0, period: "2026-Q2" })], []),
      payload("600519.SH", [metric({ metricId: "FIN_GROSS_MARGIN", value: 23.0, period: "2026-Q2" })], []),
      NOW,
    )
    expect(set.items).toHaveLength(0)
    expect(set.hasQualifiedChange).toBe(false)
  })
})
