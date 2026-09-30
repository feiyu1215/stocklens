import { describe, expect, it } from "vitest"

import { buildInferences } from "@/lib/evidence/inference-builder"
import { EVIDENCE_RULES_VERSION, EVIDENCE_THRESHOLDS } from "@/lib/evidence/rules"
import type { Evidence } from "@/lib/evidence/types"
import { buildFacts } from "@/lib/evidence/fact-builder"
import { m } from "./helpers"

function run(values: Record<string, number | null>): Evidence[] {
  const metrics = Object.entries(values).map(([id, v]) => m(id, v))
  const facts = buildFacts(metrics)
  return buildInferences(metrics, facts)
}

function hasRule(inferences: Evidence[], evidenceId: string): Evidence {
  const hit = inferences.find((e) => e.evidenceId === evidenceId)
  expect(hit, `expected ${evidenceId} to fire`).toBeDefined()
  return hit!
}

describe("§45｜RULE_FIN_PROFIT_CASHFLOW_DIVERGENCE", () => {
  it("Net Profit +10% 且 OCF -5% → 触发 conflict，basedOn 指向两个 FACT", () => {
    const inf = run({ FIN_NET_PROFIT_YOY_YTD: 10, FIN_OCF_YOY_YTD: -5 })
    const e = hasRule(inf, "EV_INF_FIN_PROFIT_CASHFLOW_DIVERGENCE")
    expect(e.signal).toBe("conflict")
    expect(e.ruleId).toBe("RULE_FIN_PROFIT_CASHFLOW_DIVERGENCE")
    expect(e.basedOn).toEqual(["EV_FACT_FIN_NET_PROFIT_YOY_YTD", "EV_FACT_FIN_OCF_YOY_YTD"])
    expect(e.metricIds).toEqual(["FIN_NET_PROFIT_YOY_YTD", "FIN_OCF_YOY_YTD"])
    expect(e.statement).toContain("增长 10.00%")
    expect(e.statement).toContain("下降 5.00%")
  })

  it("防回归：Net Profit +10% 且 OCF +5% → 不触发（OCF 为正是真实数据状态）", () => {
    const inf = run({ FIN_NET_PROFIT_YOY_YTD: 10, FIN_OCF_YOY_YTD: 5 })
    expect(inf.find((e) => e.evidenceId === "EV_INF_FIN_PROFIT_CASHFLOW_DIVERGENCE")).toBeUndefined()
  })

  it("边界：OCF = 0 → 不触发（条件为严格小于 0）", () => {
    const inf = run({ FIN_NET_PROFIT_YOY_YTD: 10, FIN_OCF_YOY_YTD: 0 })
    expect(inf.find((e) => e.evidenceId === "EV_INF_FIN_PROFIT_CASHFLOW_DIVERGENCE")).toBeUndefined()
  })
})

describe("§46｜RULE_FIN_GROWTH_MARGIN_DIVERGENCE", () => {
  it("Revenue +5% 且毛利率变化 -0.5pct → 触发 conflict", () => {
    const inf = run({ FIN_REVENUE_YOY_YTD: 5, FIN_GROSS_MARGIN_CHANGE_YOY: -0.5 })
    const e = hasRule(inf, "EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE")
    expect(e.signal).toBe("conflict")
    expect(e.statement).toContain("增长 5.00%")
    expect(e.statement).toContain("下降 0.50 个百分点")
  })

  it("毛利率变化为正 → 不触发", () => {
    const inf = run({ FIN_REVENUE_YOY_YTD: 5, FIN_GROSS_MARGIN_CHANGE_YOY: 0.5 })
    expect(inf.find((e) => e.evidenceId === "EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE")).toBeUndefined()
  })
})

describe("RULE_FIN_REVENUE_PROFIT_DIVERGENCE", () => {
  it("Revenue +5% 且 Net Profit -2% → 触发 conflict", () => {
    const inf = run({ FIN_REVENUE_YOY_YTD: 5, FIN_NET_PROFIT_YOY_YTD: -2 })
    expect(hasRule(inf, "EV_INF_FIN_REVENUE_PROFIT_DIVERGENCE").signal).toBe("conflict")
  })
})

describe("§47｜RULE_MKT_HORIZON_DIVERGENCE", () => {
  it("20D -8% 且 120D +10% → 触发 conflict", () => {
    const inf = run({ MKT_RETURN_20D: -8, MKT_RETURN_120D: 10 })
    const e = hasRule(inf, "EV_INF_MARKET_HORIZON_DIVERGENCE")
    expect(e.signal).toBe("conflict")
    expect(e.statement).toContain("-8.00%")
    expect(e.statement).toContain("+10.00%")
  })

  it("20D +8% 且 120D +10% → 不触发", () => {
    const inf = run({ MKT_RETURN_20D: 8, MKT_RETURN_120D: 10 })
    expect(inf.find((e) => e.evidenceId === "EV_INF_MARKET_HORIZON_DIVERGENCE")).toBeUndefined()
  })

  it("反向背离（20D 正 / 120D 负）→ 触发", () => {
    const inf = run({ MKT_RETURN_20D: 8, MKT_RETURN_120D: -10 })
    hasRule(inf, "EV_INF_MARKET_HORIZON_DIVERGENCE")
  })
})

describe("§48｜RULE_FIN_PROFIT_GROWTH_LAGS_REVENUE 阈值", () => {
  it("差 0.6 pct（< 1.0 阈值）→ 不触发", () => {
    const inf = run({ FIN_REVENUE_YOY_YTD: 5, FIN_NET_PROFIT_YOY_YTD: 4.4 })
    expect(inf.find((e) => e.evidenceId === "EV_INF_FIN_PROFIT_GROWTH_LAGS_REVENUE")).toBeUndefined()
  })

  it("差 2 pct（≥ 1.0 阈值）→ 触发，signal = neutral（描述性，非风险结论）", () => {
    const inf = run({ FIN_REVENUE_YOY_YTD: 5, FIN_NET_PROFIT_YOY_YTD: 3 })
    const e = hasRule(inf, "EV_INF_FIN_PROFIT_GROWTH_LAGS_REVENUE")
    expect(e.signal).toBe("neutral")
    expect(e.statement).toContain("2.00 个百分点")
  })

  it("阈值为集中配置常量", () => {
    expect(EVIDENCE_THRESHOLDS.PROFIT_REVENUE_GROWTH_GAP_PCT).toBe(1.0)
    expect(EVIDENCE_RULES_VERSION).toBe("evidence_rules_v1")
  })
})

describe("Rule 06/07｜单季与累计异号", () => {
  it("收入：YTD +3 / 单季 -1 → 触发；同号 → 不触发；一方为 0 → 不触发", () => {
    expect(run({ FIN_REVENUE_YOY_YTD: 3, FIN_REVENUE_YOY_QUARTER: -1 })
      .find((e) => e.evidenceId === "EV_INF_FIN_QUARTER_YTD_GROWTH_DIVERGENCE")).toBeDefined()
    expect(run({ FIN_REVENUE_YOY_YTD: 3, FIN_REVENUE_YOY_QUARTER: 1 })
      .find((e) => e.evidenceId === "EV_INF_FIN_QUARTER_YTD_GROWTH_DIVERGENCE")).toBeUndefined()
    expect(run({ FIN_REVENUE_YOY_YTD: 0, FIN_REVENUE_YOY_QUARTER: -1 })
      .find((e) => e.evidenceId === "EV_INF_FIN_QUARTER_YTD_GROWTH_DIVERGENCE")).toBeUndefined()
  })

  it("利润：YTD +2 / 单季 -1 → 触发", () => {
    expect(run({ FIN_NET_PROFIT_YOY_YTD: 2, FIN_NET_PROFIT_YOY_QUARTER: -1 })
      .find((e) => e.evidenceId === "EV_INF_FIN_QUARTER_YTD_PROFIT_DIVERGENCE")).toBeDefined()
  })
})

describe("指标缺失 → 规则不触发（不假设）", () => {
  it("所需指标 unavailable / 缺失 → 无任何 inference", () => {
    expect(run({ FIN_REVENUE_YOY_YTD: 5, FIN_NET_PROFIT_YOY_YTD: null })).toHaveLength(0)
    expect(run({})).toHaveLength(0)
  })
})
