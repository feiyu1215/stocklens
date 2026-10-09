import { describe, expect, it } from "vitest"
import {
  CFO_TO_PROFIT_MIN,
  DECELERATION_PCT_THRESHOLD,
  evaluateJudgmentReport,
  evaluateJudgments,
} from "@/lib/v5/judgment"
import type { MetricResult } from "@/lib/metrics/types"

const m = (over: Partial<MetricResult> & { metricId: string }): MetricResult => ({
  dimension: "growth",
  name: over.metricId,
  status: "available",
  value: null,
  unit: "%",
  sourceFields: [],
  calculationMethod: "test",
  ...over,
})

const CFO = (v: number, period = "2026-Q2", extra: Partial<MetricResult> = {}) =>
  m({ metricId: "FIN_CFO_TO_NET_PROFIT_YTD", value: v, unit: "x", period, dimension: "cashflow", ...extra })
const YTD = (v: number, period = "2026-Q2", extra: Partial<MetricResult> = {}) =>
  m({ metricId: "FIN_REVENUE_YOY_YTD", value: v, period, ...extra })
const Q = (v: number, period = "2026-Q2", extra: Partial<MetricResult> = {}) =>
  m({ metricId: "FIN_REVENUE_YOY_QUARTER", value: v, period, ...extra })

/** 取某条规则的检查痕迹（含未触发原因） */
const checked = (metrics: MetricResult[], id: string) =>
  evaluateJudgmentReport(metrics).checked.find((c) => c.id === id)!

describe("M4 · 条件性判断层", () => {
  describe("规则一：利润的现金含量", () => {
    it("经营现金流/净利润低于阈值 → 触发关注信号", () => {
      const out = evaluateJudgments([CFO(0.4)])
      expect(out).toHaveLength(1)
      expect(out[0].id).toBe("cashflow_profit_mismatch")
      expect(out[0].level).toBe("conditional")
      expect(out[0].signal).toBe("watch")
      // 评审要求：阈值 + 适用边界必须同时给出
      expect(out[0].basis).toContain("阈值")
      expect(out[0].boundary).toContain("适用边界")
      expect(out[0].statement).toContain("0.40")
      expect(out[0].evidenceIds).toEqual(["EV_FACT_FIN_CFO_TO_NET_PROFIT_YTD"])
    })

    it("不误报：≥ 阈值不触发", () => {
      expect(evaluateJudgments([CFO(CFO_TO_PROFIT_MIN)])).toHaveLength(0)
      expect(evaluateJudgments([CFO(1.2)])).toHaveLength(0)
    })

    it("失效边界：≤ 0（净利或经营现金流为负）→ 倍数不适用，不判定", () => {
      expect(evaluateJudgments([CFO(0)])).toHaveLength(0)
      expect(evaluateJudgments([CFO(-0.5)])).toHaveLength(0)
    })

    it("失效边界：带解释护栏 → 不判定", () => {
      expect(
        evaluateJudgments([CFO(0.3, "2026-Q2", { interpretationFlags: ["extreme_change"] })]),
      ).toHaveLength(0)
    })

    it("指标不可用 → 不判定，且原因写明缺哪个指标", () => {
      expect(evaluateJudgments([CFO(0.3, "2026-Q2", { status: "unavailable", value: null })])).toHaveLength(0)
      expect(checked([], "cashflow_profit_mismatch").reason).toContain("FIN_CFO_TO_NET_PROFIT_YTD")
    })

    it("未触发时给出可读原因（实际数字 + 阈值），不是静默消失", () => {
      const c = checked([CFO(1.42)], "cashflow_profit_mismatch")
      expect(c.fired).toBe(false)
      expect(c.reason).toContain("1.42")
      expect(c.reason).toContain("0.8")
      expect(c.threshold).toContain("0.8")
    })
  })

  describe("规则二：单季增速较累计增速放缓", () => {
    it("累计 − 单季 ≥ 阈值且两者为正 → 触发", () => {
      const out = evaluateJudgments([YTD(20), Q(3)])
      expect(out).toHaveLength(1)
      expect(out[0].id).toBe("growth_deceleration")
      expect(out[0].boundary).toContain("季节性")
      expect(out[0].evidenceIds).toEqual([
        "EV_FACT_FIN_REVENUE_YOY_YTD",
        "EV_FACT_FIN_REVENUE_YOY_QUARTER",
      ])
    })

    it("不误报：差距未达阈值 / 单季反超累计（加速）→ 不触发", () => {
      expect(evaluateJudgments([YTD(20), Q(15)])).toHaveLength(0)
      expect(evaluateJudgments([YTD(3.55), Q(4.59)])).toHaveLength(0) // 美的真实数据：单季高于累计
    })

    it("失效边界：两者需同为正（异号由证据层的方向背离规则处理，此处不重复）", () => {
      expect(evaluateJudgments([YTD(1.47), Q(-5.14)])).toHaveLength(0) // 茅台真实数据
      expect(evaluateJudgments([YTD(-5), Q(-20)])).toHaveLength(0)
    })

    it("失效边界：报告期不同 → 不可比较，不判定", () => {
      expect(evaluateJudgments([YTD(20, "2026-Q2"), Q(3, "2025-Q4")])).toHaveLength(0)
    })

    it("失效边界：带解释护栏 → 不判定", () => {
      expect(
        evaluateJudgments([YTD(20, "2026-Q2", { interpretationFlags: ["low_base"] }), Q(3)]),
      ).toHaveLength(0)
    })
  })

  describe("整体行为", () => {
    it("两条规则可同时触发", () => {
      const both = evaluateJudgments([CFO(0.3), YTD(20), Q(3)])
      expect(both.map((j) => j.id)).toEqual(["cashflow_profit_mismatch", "growth_deceleration"])
    })

    it("一条都不触发时，fired 为空但 checked 仍返回全部规则（判定层跑过要可核验）", () => {
      const report = evaluateJudgmentReport([CFO(1.42), YTD(3.55), Q(4.59)])
      expect(report.fired).toHaveLength(0)
      expect(report.checked).toHaveLength(2)
      expect(report.checked.every((c) => !c.fired && c.reason)).toBe(true)
    })

    it("真实样例不触发——不靠调低阈值制造触发", () => {
      // 美的 000333：CFO/净利 1.42；累计 3.55 / 单季 4.59
      expect(evaluateJudgments([CFO(1.42), YTD(3.55), Q(4.59)])).toHaveLength(0)
      // 茅台 600519：CFO/净利 1.59；累计 1.47 / 单季 -5.14（异号）
      expect(evaluateJudgments([CFO(1.59), YTD(1.47), Q(-5.14)])).toHaveLength(0)
    })

    it("空输入 / undefined → 空数组，不猜", () => {
      expect(evaluateJudgments([])).toHaveLength(0)
      expect(evaluateJudgments(undefined)).toHaveLength(0)
      expect(evaluateJudgmentReport(undefined).checked).toHaveLength(2)
    })

    it("阈值是显式常量（便于质疑与调整，不藏在逻辑里）", () => {
      expect(CFO_TO_PROFIT_MIN).toBe(0.8)
      expect(DECELERATION_PCT_THRESHOLD).toBe(10)
    })

    it("本层不做综合评价：level 恒为 conditional、signal 恒为 watch", () => {
      const out = evaluateJudgments([CFO(0.2), YTD(30), Q(1)])
      expect(out.every((j) => j.level === "conditional" && j.signal === "watch")).toBe(true)
      expect(out.some((j) => /质量差|偏贵|不好|优秀/.test(j.statement))).toBe(false)
    })
  })
})
