import type { MetricResult } from "@/lib/metrics/types"

import type { EvidenceDimension, EvidenceSignal } from "./types"
import { growthWord } from "./fact-builder"

// Evidence Rules —— 全部确定性规则的唯一登记处（版本化）。
//
// 纪律：
// - 规则只在这里，不藏在 statement / Prompt / UI；
// - 阈值集中在 EVIDENCE_THRESHOLDS，不散落代码；
// - evaluate 为纯函数：输入指标查询函数，输出 statement 或 null（不触发）；
//   无网络 / 无 LLM / 无 DB / 无 UI state；
// - **数据决定 Evidence**：条件不满足就绝不生成，不为 Demo 预设结论。
//   例如 RULE_FIN_PROFIT_CASHFLOW_DIVERGENCE 只有 OCF 累计同比真实 < 0 才触发
//   （当前真实数据 OCF YoY = +0.73%，不触发——这是正确行为，有防回归测试）。

export const EVIDENCE_RULES_VERSION = "evidence_rules_v1"

/** 产品规则阈值（集中管理） */
export const EVIDENCE_THRESHOLDS = {
  /** 利润增速落后收入增速规则的最小差值（百分点），避免极小差异触发无意义 Evidence */
  PROFIT_REVENUE_GROWTH_GAP_PCT: 1.0,
} as const

export type MetricLookup = (metricId: string) => MetricResult | undefined

/** 财务趋势序列访问器（Task 08 §21–22）：与 MetricLookup 并列的规则输入 */
export interface TrendLookup {
  /** 最近 n 个可比单季同比（ASC；可能少于 n） */
  quarterYoY: (
    field: "revenueQuarterYoY" | "netProfitQuarterYoY" | "operatingCashflowQuarterYoY",
    n: number,
  ) => { period: string; value: number }[]
}

export type RuleContext = { metrics: MetricLookup; trend?: TrendLookup }

function num(lookup: MetricLookup, metricId: string): number | undefined {
  const m = lookup(metricId)
  if (!m || m.status !== "available") return undefined
  if (typeof m.value !== "number" || !Number.isFinite(m.value)) return undefined
  return m.value
}

function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0
}

/** 带符号百分比（对比句中正负号显式呈现，如 "+9.83%" / "-8.45%"） */
function signedPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`
}

export interface RuleDefinition {
  ruleId: string
  evidenceId: string
  dimension: EvidenceDimension
  title: string
  signal: EvidenceSignal
  /** 规则输入指标；同时决定 inference.basedOn 指向哪些 FACT（趋势规则为空数组） */
  requires: string[]
  /** 返回 statement（触发）或 null（不触发） */
  evaluate: (lookup: MetricLookup, trend?: TrendLookup) => string | null
}

export const RULE_DEFINITIONS: RuleDefinition[] = [
  {
    ruleId: "RULE_FIN_PROFIT_CASHFLOW_DIVERGENCE",
    evidenceId: "EV_INF_FIN_PROFIT_CASHFLOW_DIVERGENCE",
    dimension: "cashflow",
    title: "利润增长与经营现金流走势背离",
    signal: "conflict",
    requires: ["FIN_NET_PROFIT_YOY_YTD", "FIN_OCF_YOY_YTD"],
    evaluate: (lookup) => {
      const np = num(lookup, "FIN_NET_PROFIT_YOY_YTD")
      const ocf = num(lookup, "FIN_OCF_YOY_YTD")
      if (np === undefined || ocf === undefined) return null
      if (!(np > 0 && ocf < 0)) return null
      return `最新报告期归母净利润累计同比增长 ${np.toFixed(2)}%，但经营活动现金流净额累计同比下降 ${Math.abs(ocf).toFixed(2)}%。`
    },
  },
  {
    ruleId: "RULE_FIN_REVENUE_PROFIT_DIVERGENCE",
    evidenceId: "EV_INF_FIN_REVENUE_PROFIT_DIVERGENCE",
    dimension: "growth",
    title: "收入增长但利润下降",
    signal: "conflict",
    requires: ["FIN_REVENUE_YOY_YTD", "FIN_NET_PROFIT_YOY_YTD"],
    evaluate: (lookup) => {
      const rev = num(lookup, "FIN_REVENUE_YOY_YTD")
      const np = num(lookup, "FIN_NET_PROFIT_YOY_YTD")
      if (rev === undefined || np === undefined) return null
      if (!(rev > 0 && np < 0)) return null
      return `最新报告期营业收入累计同比增长 ${rev.toFixed(2)}%，但归母净利润累计同比下降 ${Math.abs(np).toFixed(2)}%。`
    },
  },
  {
    ruleId: "RULE_FIN_GROWTH_MARGIN_DIVERGENCE",
    evidenceId: "EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE",
    dimension: "profitability",
    title: "收入增长但毛利率下降",
    signal: "conflict",
    requires: ["FIN_REVENUE_YOY_YTD", "FIN_GROSS_MARGIN_CHANGE_YOY"],
    evaluate: (lookup) => {
      const rev = num(lookup, "FIN_REVENUE_YOY_YTD")
      const gm = num(lookup, "FIN_GROSS_MARGIN_CHANGE_YOY")
      if (rev === undefined || gm === undefined) return null
      if (!(rev > 0 && gm < 0)) return null
      return `最新报告期营业收入累计同比增长 ${rev.toFixed(2)}%，但销售毛利率较上年同期下降 ${Math.abs(gm).toFixed(2)} 个百分点。`
    },
  },
  {
    // 描述性关系（neutral，不是风险结论）：利润增速明显慢于收入增速
    ruleId: "RULE_FIN_PROFIT_GROWTH_LAGS_REVENUE",
    evidenceId: "EV_INF_FIN_PROFIT_GROWTH_LAGS_REVENUE",
    dimension: "growth",
    title: "利润增速低于收入增速",
    signal: "neutral",
    requires: ["FIN_REVENUE_YOY_YTD", "FIN_NET_PROFIT_YOY_YTD"],
    evaluate: (lookup) => {
      const rev = num(lookup, "FIN_REVENUE_YOY_YTD")
      const np = num(lookup, "FIN_NET_PROFIT_YOY_YTD")
      if (rev === undefined || np === undefined) return null
      if (!(rev > 0 && np > 0 && rev - np >= EVIDENCE_THRESHOLDS.PROFIT_REVENUE_GROWTH_GAP_PCT)) return null
      return `最新报告期营业收入累计同比增长 ${rev.toFixed(2)}%，归母净利润累计同比增长 ${np.toFixed(2)}%，利润增速低于收入增速 ${(rev - np).toFixed(2)} 个百分点。`
    },
  },
  {
    ruleId: "RULE_MKT_HORIZON_DIVERGENCE",
    evidenceId: "EV_INF_MARKET_HORIZON_DIVERGENCE",
    dimension: "market",
    title: "短期与中期行情方向背离",
    signal: "conflict",
    requires: ["MKT_RETURN_20D", "MKT_RETURN_120D"],
    evaluate: (lookup) => {
      const r20 = num(lookup, "MKT_RETURN_20D")
      const r120 = num(lookup, "MKT_RETURN_120D")
      if (r20 === undefined || r120 === undefined) return null
      const opposite = (r20 < 0 && r120 > 0) || (r20 > 0 && r120 < 0)
      if (!opposite) return null
      return `最近 20 个交易日收益率为 ${signedPct(r20)}，而最近 120 个交易日收益率为 ${signedPct(r120)}，不同时间尺度的行情方向存在背离。`
    },
  },
  {
    // 可选 P0：单季与累计异号才触发；数值不同但同号不算 conflict
    ruleId: "RULE_FIN_QUARTER_YTD_GROWTH_DIVERGENCE",
    evidenceId: "EV_INF_FIN_QUARTER_YTD_GROWTH_DIVERGENCE",
    dimension: "growth",
    title: "单季收入增长方向与累计表现不同",
    signal: "conflict",
    requires: ["FIN_REVENUE_YOY_YTD", "FIN_REVENUE_YOY_QUARTER"],
    evaluate: (lookup) => {
      const ytd = num(lookup, "FIN_REVENUE_YOY_YTD")
      const q = num(lookup, "FIN_REVENUE_YOY_QUARTER")
      if (ytd === undefined || q === undefined) return null
      if (!(sign(ytd) !== 0 && sign(q) !== 0 && sign(ytd) !== sign(q))) return null
      return `最新报告期营业收入累计同比${growthWord(ytd)}，而单季营业收入同比${growthWord(q)}，两者方向不同。`
    },
  },
  {
    ruleId: "RULE_FIN_QUARTER_YTD_PROFIT_DIVERGENCE",
    evidenceId: "EV_INF_FIN_QUARTER_YTD_PROFIT_DIVERGENCE",
    dimension: "growth",
    title: "单季利润增长方向与累计表现不同",
    signal: "conflict",
    requires: ["FIN_NET_PROFIT_YOY_YTD", "FIN_NET_PROFIT_YOY_QUARTER"],
    evaluate: (lookup) => {
      const ytd = num(lookup, "FIN_NET_PROFIT_YOY_YTD")
      const q = num(lookup, "FIN_NET_PROFIT_YOY_QUARTER")
      if (ytd === undefined || q === undefined) return null
      if (!(sign(ytd) !== 0 && sign(q) !== 0 && sign(ytd) !== sign(q))) return null
      return `最新报告期归母净利润累计同比${growthWord(ytd)}，而单季归母净利润同比${growthWord(q)}，两者方向不同。`
    },
  },
  {
    // Task 08 §21：最近 3 个可比单季收入同比同向。这是描述性连续趋势，非预测。
    ruleId: "RULE_TREND_REVENUE_QUARTER_DIRECTION_RUN",
    evidenceId: "EV_INF_TREND_REVENUE_QUARTER_DIRECTION_RUN",
    dimension: "growth",
    title: "单季收入同比连续同向",
    signal: "neutral",
    requires: ["FIN_REVENUE_YOY_QUARTER", "FIN_REVENUE_YOY_YTD"],
    evaluate: (_lookup, trend) => {
      const series = trend?.quarterYoY("revenueQuarterYoY", 3) ?? []
      if (series.length < 3) return null
      const allPositive = series.every((p) => p.value > 0)
      const allNegative = series.every((p) => p.value < 0)
      if (!allPositive && !allNegative) return null
      const periods = series.map((p) => p.period).join("、")
      const word = allPositive ? "为正" : "为负"
      return `最近 3 个可比单季（${periods}）营业收入同比均${word}，单季收入同比连续同向。`
    },
  },
  {
    // Task 08 §22：单季收入同比方向反转（上期为负本期为正，或反向）
    ruleId: "RULE_TREND_REVENUE_QUARTER_REVERSAL",
    evidenceId: "EV_INF_TREND_REVENUE_QUARTER_REVERSAL",
    dimension: "growth",
    title: "最新单季收入同比方向反转",
    signal: "conflict",
    requires: ["FIN_REVENUE_YOY_QUARTER", "FIN_REVENUE_YOY_YTD"],
    evaluate: (_lookup, trend) => {
      const series = trend?.quarterYoY("revenueQuarterYoY", 2) ?? []
      if (series.length < 2) return null
      const [previous, latest] = series
      const flipped =
        (previous.value < 0 && latest.value > 0) || (previous.value > 0 && latest.value < 0)
      if (!flipped) return null
      const word = latest.value > 0 ? "由负转正" : "由正转负"
      return `${latest.period} 单季营业收入同比${word}（${previous.period}：${previous.value.toFixed(2)}% → ${latest.period}：${latest.value.toFixed(2)}%）。`
    },
  },
]
