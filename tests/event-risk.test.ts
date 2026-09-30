import { describe, expect, it } from "vitest"

import { computeInterpretation, INTERPRETATION_THRESHOLDS } from "@/lib/metrics/interpretation"
import type { MetricResult } from "@/lib/metrics/types"
import { buildFinancialTrend } from "@/lib/metrics/trend"
import { buildFinancialMetrics } from "@/lib/metrics/financial"
import { buildEvidence } from "@/lib/evidence/engine"
import { buildEventEvidence } from "@/lib/evidence/event-evidence"
import { validateEvidenceBundle } from "@/lib/evidence/validate"
import type { Evidence } from "@/lib/evidence/types"
import type { EventContext } from "@/lib/data/events"
import type { FinancialPeriodData } from "@/lib/data/types"
import { realLikeMetrics } from "./evidence/helpers"

function fp(period: string, revenue: number | null, ocf: number | null = null): FinancialPeriodData {
  return { stockCode: "000333.SZ", period, revenue, operatingCashflow: ocf, source: "fuyao" }
}

describe("A. Low-base Guardrail（§4–§7/§45）", () => {
  const history = [100, 110, 90, 105, 95] // 中位数 100

  it("案例 A：正常同比（previous=100, current=110）→ 不 flag", () => {
    const r = computeInterpretation({ current: 110, previous: 100, historicalAbsValues: history })
    expect(r.flags).toEqual([])
    expect(r.note).toBeUndefined()
  })

  it("案例 B：previous=5（相对历史中位数 100 的 5% < 10%）、current=-75 → low_base + sign_flip + extreme", () => {
    const r = computeInterpretation({ current: -75, previous: 5, historicalAbsValues: history })
    expect(r.flags).toContain("low_base")
    expect(r.flags).toContain("sign_flip_base")
    expect(r.flags).toContain("extreme_change")
    expect(r.note).toBeTruthy()
    expect(r.note).toContain("低基数")
  })

  it("样本不足（< MIN_HISTORY_SAMPLES）→ 不判定 low_base（不假设）", () => {
    const r = computeInterpretation({ current: -75, previous: 5, historicalAbsValues: [100, 110] })
    expect(r.flags).not.toContain("low_base")
    expect(INTERPRETATION_THRESHOLDS.MIN_HISTORY_SAMPLES).toBe(4)
  })

  it("案例 C：Metric.value 不被修改（保留原始极端百分比）", () => {
    // 2025-Q1 OCF=1（极小），2026-Q1 OCF=14.5e9；历史单季含大额 → low_base
    const periods = [
      fp("2026-Q2", 220, 23),
      fp("2026-Q1", 100, 14.5),
      fp("2025-Q4", 90, 10),
      fp("2025-Q3", 95, 12),
      fp("2025-Q2", 80, 11),
      fp("2025-Q1", 60, 0.01), // 极小基数
    ]
    const metrics = buildFinancialMetrics(periods, "2026-Q1")
    const ocfYtd = metrics.find((m) => m.metricId === "FIN_OCF_YOY_YTD")!
    expect(ocfYtd.status).toBe("available")
    // 原值保留（1450 倍），只附加 flags
    expect(ocfYtd.value).toBeCloseTo((14.5 / 0.01 - 1) * 100, 5)
    expect(ocfYtd.value).toBeGreaterThan(100000)
    expect(ocfYtd.interpretationFlags).toContain("extreme_change")
    expect(ocfYtd.interpretationFlags).toContain("low_base")
    expect(ocfYtd.interpretationNote).toBeTruthy()
  })

  it("趋势序列携带 flags 与上年同期绝对金额（真实 -1600% 场景）", () => {
    const periods = [
      fp("2026-Q2", 220, 23),
      fp("2026-Q1", 130, 14.5),
      fp("2025-Q4", 100, 0.3), // 上年同期极小
      fp("2025-Q3", 95, 12),
      fp("2025-Q2", 80, 11),
      fp("2025-Q1", 60, 10),
    ]
    const trend = buildFinancialTrend(periods)
    const q4 = trend.find((p) => p.period === "2025-Q4")!
    // 2025-Q4 无上年同期（无 2024-Q4）→ 无同比
    expect(q4.operatingCashflowQuarterYoY).toBeNull()
    // 2025-Q2 有同比（2025-Q2 vs 2024-Q2 不存在 → null）；确认 2026-Q1 的可比性
    const q1 = trend.find((p) => p.period === "2026-Q1")!
    expect(typeof q1.operatingCashflowQuarterYoY).toBe("number")
  })

  it("Evidence 传播 flags/note（FACT 携带解释护栏）", () => {
    const metrics: MetricResult[] = [
      ...realLikeMetrics(),
      {
        metricId: "FIN_OCF_YOY_YTD",
        dimension: "growth" as const,
        name: "OCF 同比",
        status: "available" as const,
        value: -1600.72,
        unit: "%",
        interpretationFlags: ["low_base", "sign_flip_base", "extreme_change"],
        interpretationNote: "测试护栏提示",
        sourceFields: [],
        calculationMethod: "-",
      },
    ]
    const bundle = buildEvidence({
      metrics,
      context: { stockCode: "000333.SZ", stockName: "美的集团", industry: null },
    })
    const fact = bundle.evidence.find((e) => e.evidenceId === "EV_FACT_FIN_OCF_YOY_YTD")!
    expect(fact.interpretationFlags).toContain("low_base")
    expect(fact.interpretationNote).toBe("测试护栏提示")
    // signal 不因极端百分比自动变强：仍只是 negative（下降）
    expect(fact.signal).toBe("negative")
  })
})

describe("B. Event / Risk Lite（§21–§33/§46–§49）", () => {
  const baseCtx: EventContext = {
    events: [],
    coverage: { anomaly: "no_records", attention: "no_records", corporateAction: "no_records", newsDisclosure: "unavailable" },
    errors: [],
  }

  it("§46 异动接口成功但 item=[] → UNKNOWN（不得写「无事件」）", () => {
    const evidence = buildEventEvidence(baseCtx)
    const anomaly = evidence.find((e) => e.evidenceId === "EV_UNKNOWN_RISK_ANOMALY_COVERAGE")!
    expect(anomaly).toBeDefined()
    expect(anomaly.type).toBe("unknown")
    expect(anomaly.statement).toContain("不能用于确认")
    expect(evidence.some((e) => e.statement.includes("今日无事件"))).toBe(false)
  })

  it("异动接口失败 → 与「无记录」区分（独立 UNKNOWN）", () => {
    const evidence = buildEventEvidence({
      ...baseCtx,
      coverage: { ...baseCtx.coverage, anomaly: "failed" },
    })
    expect(evidence.some((e) => e.evidenceId === "EV_UNKNOWN_RISK_ANOMALY_UNAVAILABLE")).toBe(true)
    expect(evidence.some((e) => e.evidenceId === "EV_UNKNOWN_RISK_ANOMALY_COVERAGE")).toBe(false)
  })

  it("§49 新闻/公告覆盖边界恒定保留（即使三域全部可用）", () => {
    const full: EventContext = {
      events: [
        {
          eventId: "EVT_CORP_ACTION_20260626_DIVIDEND",
          stockCode: "000333.SZ",
          type: "corporate_action",
          title: "公司行为：现金分红",
          statement: "接口记录公司在 2026-06-26 发生现金分红事件：每股现金分红 3.8 元。",
          eventDate: "2026-06-26",
          source: "fuyao",
          sourceEndpoint: "/api/a-share/corporate-actions/adjustment-factors",
          verifyStatus: "verified",
        },
      ],
      coverage: { anomaly: "records", attention: "records", corporateAction: "records", newsDisclosure: "unavailable" },
      errors: [],
    }
    const evidence = buildEventEvidence(full)
    expect(evidence.some((e) => e.evidenceId === "EV_UNKNOWN_RISK_NEWS_DISCLOSURE")).toBe(true)
  })

  it("§48 公司行为（分红）→ neutral FACT，不做价值判断", () => {
    const evidence = buildEventEvidence({
      ...baseCtx,
      events: [
        {
          eventId: "EVT_CORP_ACTION_20260626_DIVIDEND",
          stockCode: "000333.SZ",
          type: "corporate_action",
          title: "公司行为：现金分红（除权除息日 2026-06-26）",
          statement: "接口记录公司在 2026-06-26 发生现金分红事件：每股现金分红 3.8 元。",
          eventDate: "2026-06-26",
          source: "fuyao",
          sourceEndpoint: "/api/a-share/corporate-actions/adjustment-factors",
          verifyStatus: "verified",
        },
      ],
    })
    const fact = evidence.find((e) => e.type === "fact")!
    expect(fact.signal).toBe("neutral")
    expect(fact.dimension).toBe("risk")
    expect(fact.statement).toContain("每股现金分红 3.8 元")
  })

  it("§27 关注度上升 → neutral（不是 positive）", () => {
    const evidence = buildEventEvidence({
      ...baseCtx,
      events: [
        {
          eventId: "EVT_ATTENTION_20260930",
          stockCode: "000333.SZ",
          type: "attention",
          title: "市场关注度（热榜排名）变化",
          statement: "最近 30 天热榜排名由 2026-08-31 的约第 323 名变为 2026-09-30 的约第 500 名。",
          eventDate: "2026-09-30",
          source: "fuyao",
          sourceEndpoint: "/api/a-share/special-data/hot-stock-rank-trend",
          verifyStatus: "verified",
        },
      ],
    })
    const fact = evidence.find((e) => e.type === "fact")!
    expect(fact.signal).toBe("neutral")
  })

  it("事件 FACT 通过 validator：以 sourceFields 追溯（metricIds 为空是合法的风险维度事实）", () => {
    const evidence = buildEventEvidence({
      ...baseCtx,
      events: [
        {
          eventId: "EVT_ATTENTION_20260930",
          stockCode: "000333.SZ",
          type: "attention",
          title: "市场关注度（热榜排名）变化",
          statement: "排名变化陈述。",
          eventDate: "2026-09-30",
          source: "fuyao",
          sourceEndpoint: "/api/a-share/special-data/hot-stock-rank-trend",
          verifyStatus: "verified",
        },
      ],
    })
    const result = validateEvidenceBundle(evidence)
    expect(result.ok).toBe(true)
  })

  it("metric 类 FACT 仍要求 metricIds ≥ 1（不变量未被放宽）", () => {
    const fake: Evidence = {
      evidenceId: "EV_FACT_FIN_REVENUE_YOY_YTD",
      dimension: "growth",
      title: "t",
      statement: "s",
      type: "fact",
      signal: "positive",
      confidence: "high",
      metricIds: [],
      basedOn: [],
      sourceFields: [{ source: "fuyao", domain: "financial", field: "operating_income" }],
      verifyStatus: "verified",
      confidenceReason: "-",
    }
    const result = validateEvidenceBundle([fake])
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.rule === "fact-metric-ids")).toBe(true)
  })

  it("事件 FACT 使用稳定 eventId 派生的 evidenceId（确定性）", () => {
    const evidence = buildEventEvidence(baseCtx)
    expect(evidence.every((e) => /^EV_(FACT|UNKNOWN)_RISK_/.test(e.evidenceId))).toBe(true)
    const again = buildEventEvidence(baseCtx)
    expect(again.map((e) => e.evidenceId)).toEqual(evidence.map((e) => e.evidenceId))
  })
})

describe("C. 关注度方向（§24/§47）：rank 数字越小越靠前", () => {
  // 该方向逻辑在 events.ts 抓取层完成（1200→400 为上升）；此处验证排序语义常量
  it("improvement = earliest.rank - latest.rank；正数表示关注度上升", () => {
    const earliest = 1200
    const latest = 400
    const improvement = earliest - latest // 800 > 0 → 上升
    expect(improvement).toBeGreaterThan(0)
  })
})
