import type { MetricResult } from "@/lib/metrics/types"

import type { Evidence, EvidenceContext, EvidenceDimension } from "./types"

// UNKNOWN Builder：UNKNOWN 是正式研究结果，不是异常。
// 与 Error 区分：UNKNOWN = 数据能力目前不存在/无法验证；Error = 本应取得但本次调用失败
// （Error 由 API 层 errors[] 透传，不在这里吞掉）。
//
// 聚合纪律：按「能力组」聚合 unavailable 指标，绝不为同一原因生成十几个重复卡片。

const UNKNOWN_CONFIDENCE_REASON = "当前数据能力尚不支持该项验证，属正式的研究边界陈述"

interface CapabilityGroup {
  evidenceId: string
  dimension: EvidenceDimension
  title: string
  metricIds: string[]
}

const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    evidenceId: "EV_UNKNOWN_FIN_STATEMENTS",
    dimension: "growth",
    title: "财务报表数据不足",
    metricIds: [
      "FIN_REVENUE_YOY_YTD",
      "FIN_REVENUE_YOY_QUARTER",
      "FIN_NET_PROFIT_YOY_YTD",
      "FIN_NET_PROFIT_YOY_QUARTER",
      "FIN_OCF_YOY_YTD",
      "FIN_OCF_YOY_QUARTER",
      "FIN_CFO_TO_NET_PROFIT_YTD",
    ],
  },
  {
    evidenceId: "EV_UNKNOWN_FIN_MARGIN_CURRENT",
    dimension: "profitability",
    title: "当期盈利能力指标信息不足",
    metricIds: ["FIN_GROSS_MARGIN", "FIN_NET_MARGIN", "FIN_ROE"],
  },
  {
    evidenceId: "EV_UNKNOWN_FIN_MARGIN_HISTORY",
    dimension: "profitability",
    title: "历史盈利能力对比信息不足",
    metricIds: [
      "FIN_GROSS_MARGIN_CHANGE_YOY",
      "FIN_NET_MARGIN_CHANGE_YOY",
      "FIN_ROE_CHANGE_YOY",
    ],
  },
  {
    evidenceId: "EV_UNKNOWN_VAL_SNAPSHOT",
    dimension: "valuation",
    title: "估值快照信息不足",
    metricIds: ["VAL_PE_TTM", "VAL_PB_MRQ"],
  },
  {
    evidenceId: "EV_UNKNOWN_MARKET_PRICE_HISTORY",
    dimension: "market",
    title: "行情历史数据不足",
    metricIds: [
      "MKT_RETURN_20D",
      "MKT_RETURN_60D",
      "MKT_RETURN_120D",
      "MKT_VOLATILITY_20D",
      "MKT_VOLATILITY_60D",
      "MKT_MAX_DRAWDOWN_120D",
    ],
  },
]

function unavailableMetricIds(metrics: MetricResult[], wanted: string[]): {
  missing: string[]
  reasons: string[]
} {
  const byId = new Map(metrics.map((m) => [m.metricId, m] as const))
  const missing: string[] = []
  const reasons: string[] = []
  for (const id of wanted) {
    const m = byId.get(id)
    if (!m || m.status !== "available") {
      missing.push(id)
      if (m?.unavailableReason) reasons.push(m.unavailableReason)
    }
  }
  return { missing, reasons }
}

export function buildUnknowns(metrics: MetricResult[], context: EvidenceContext): Evidence[] {
  const out: Evidence[] = []

  // 1) 确定性 UNKNOWN：历史估值位置（当前只有估值快照，无历史序列）
  out.push({
    evidenceId: "EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE",
    dimension: "valuation",
    title: "历史估值位置暂无法验证",
    statement:
      "当前仅取得 PE/PB 估值快照，尚未接入可靠历史估值序列，因此不能判断当前估值处于历史高位或低位。",
    type: "unknown",
    signal: "unknown",
    confidence: "low",
    metricIds: [],
    basedOn: [],
    period: context.latestPriceDate ?? undefined,
    sourceFields: [],
    verifyStatus: "unverified",
    confidenceReason: UNKNOWN_CONFIDENCE_REASON,
    unavailableReason:
      "historical valuation percentile unavailable because valuation history is not yet connected",
  })

  // 2) 确定性 UNKNOWN：行业比较（industry = null 或数据未接入时）
  if (context.industry == null) {
    out.push({
      evidenceId: "EV_UNKNOWN_INDUSTRY_COMPARISON",
      dimension: "industry",
      title: "行业位置比较暂无法验证",
      statement:
        "当前尚未接入可靠行业与同行比较数据，因此不能判断公司的估值、盈利能力或增长水平处于行业什么位置。",
      type: "unknown",
      signal: "unknown",
      confidence: "low",
      metricIds: [],
      basedOn: [],
      sourceFields: [],
      verifyStatus: "unverified",
      confidenceReason: UNKNOWN_CONFIDENCE_REASON,
      unavailableReason: "industry is unknown; industry-relative metrics are not computed",
    })
  }

  // 3) 能力组聚合 UNKNOWN：组内任一指标 unavailable 即生成一条，statement 列明缺失明细
  for (const group of CAPABILITY_GROUPS) {
    const { missing, reasons } = unavailableMetricIds(metrics, group.metricIds)
    if (missing.length === 0) continue
    out.push({
      evidenceId: group.evidenceId,
      dimension: group.dimension,
      title: group.title,
      statement: `本轮 ${group.metricIds.length} 项相关指标中有 ${missing.length} 项无法计算（${missing.join("、")}），因此该部分暂无法验证。`,
      type: "unknown",
      signal: "unknown",
      confidence: "low",
      metricIds: missing,
      basedOn: [],
      sourceFields: [],
      verifyStatus: "unverified",
      confidenceReason: UNKNOWN_CONFIDENCE_REASON,
      unavailableReason:
        reasons.length > 0
          ? `${missing.length} metric(s) unavailable: ${reasons[0]}${reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ""}`
          : `${missing.length} metric(s) unavailable`,
    })
  }

  return out
}
