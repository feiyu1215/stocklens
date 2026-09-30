import { describe, expect, it } from "vitest"

import { buildFacts, growthWord, pctWord } from "@/lib/evidence/fact-builder"
import { m } from "./helpers"

describe("FACT Builder（§44）", () => {
  it("Revenue YoY = +3 → FACT / positive / metricIds 正确 / basedOn 空 / high+verified", () => {
    const facts = buildFacts([m("FIN_REVENUE_YOY_YTD", 3, { period: "2026-Q2", comparisonPeriod: "2025-Q2" })])
    expect(facts).toHaveLength(1)
    const f = facts[0]
    expect(f.evidenceId).toBe("EV_FACT_FIN_REVENUE_YOY_YTD")
    expect(f.type).toBe("fact")
    expect(f.signal).toBe("positive")
    expect(f.metricIds).toEqual(["FIN_REVENUE_YOY_YTD"])
    expect(f.basedOn).toEqual([])
    expect(f.confidence).toBe("high")
    expect(f.verifyStatus).toBe("verified")
    expect(f.dimension).toBe("growth")
    expect(f.period).toBe("2026-Q2")
  })

  it("Revenue YoY = -3 → FACT / negative", () => {
    const [f] = buildFacts([m("FIN_REVENUE_YOY_YTD", -3, { period: "2026-Q2" })])
    expect(f.signal).toBe("negative")
  })

  it("PE → signal neutral，禁止估值判断", () => {
    const [f] = buildFacts([m("VAL_PE_TTM", 13.77168, { period: "2026-09-30", unit: "x" })])
    expect(f.signal).toBe("neutral")
    expect(f.statement).toContain("13.77 倍")
    expect(f.statement).not.toMatch(/便宜|合理|贵/)
  })

  it("Volatility → signal neutral", () => {
    const [f] = buildFacts([m("MKT_VOLATILITY_20D", 21.8981)])
    expect(f.signal).toBe("neutral")
  })

  it("毛利率变化 -0.3641 → negative FACT，口径为百分点", () => {
    const [f] = buildFacts([m("FIN_GROSS_MARGIN_CHANGE_YOY", -0.3641, { unit: "pct" })])
    expect(f.signal).toBe("negative")
    expect(f.statement).toContain("下降 0.36 个百分点")
  })

  it("真实 0 → neutral 且措辞为持平（不是 0.00%）", () => {
    const [f] = buildFacts([m("FIN_REVENUE_YOY_YTD", 0)])
    expect(f.signal).toBe("neutral")
    expect(f.statement).toContain("与上年同期持平")
  })

  it("statement 数字只做展示舍入：3.5516 → 3.55（不改 metric 值）", () => {
    const [f] = buildFacts([m("FIN_REVENUE_YOY_YTD", 3.5516, { period: "2026-Q2" })])
    expect(f.statement).toContain("3.55%")
    expect(f.statement).not.toContain("3.5516")
    expect(f.statement).toContain("累计同比") // 口径显式
  })

  it("单季同比 statement 显式带「单季」口径", () => {
    const [f] = buildFacts([m("FIN_REVENUE_YOY_QUARTER", 4.59, { period: "2026-Q2" })])
    expect(f.statement).toContain("单季营业收入同比增长 4.59%")
  })

  it("unavailable 指标不生成 FACT", () => {
    const facts = buildFacts([m("FIN_ROE", null), m("FIN_REVENUE_YOY_YTD", 1)])
    expect(facts.map((x) => x.evidenceId)).not.toContain("EV_FACT_FIN_ROE")
    expect(facts).toHaveLength(1)
  })

  it("CFO/净利润 → neutral，仅陈述倍数", () => {
    const [f] = buildFacts([m("FIN_CFO_TO_NET_PROFIT_YTD", 1.41995, { unit: "x", period: "2026-Q2" })])
    expect(f.signal).toBe("neutral")
    expect(f.statement).toContain("1.42 倍")
  })
})

describe("方向措辞工具", () => {
  it("growthWord / pctWord", () => {
    expect(growthWord(3.5516)).toBe("增长 3.55%")
    expect(growthWord(-3.5)).toBe("下降 3.50%")
    expect(growthWord(0)).toBe("与上年同期持平")
    expect(pctWord(-0.3641)).toBe("下降 0.36 个百分点")
    expect(pctWord(0.5)).toBe("上升 0.50 个百分点")
    expect(pctWord(0)).toBe("与上年同期持平")
  })
})
