import type { Evidence } from "@/lib/evidence/types"
import type { MetricResult } from "@/lib/metrics/types"
import type { EventContext } from "@/lib/data/events"

// Capability Manifest（Task 12 §12–§15）：
// 内部稳定能力枚举 = 「系统有哪些证据能力」；用户看到的 Research Dimension 由 AI 据此组织。
// 可用性必须由真实数据/指标/证据 availability 决定，禁止按公司类型模板假定。

export const CAPABILITY_KEYS = [
  "financial_growth",
  "profitability",
  "cashflow",
  "valuation",
  "market_price",
  "market_benchmark",
  "industry_market",
  "industry_valuation",
  "event",
  "corporate_action",
  "risk",
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

export interface CapabilityAvailability {
  key: CapabilityKey
  status: "ready" | "partial" | "unavailable"
  reason?: string
  /** 人类可读说明（进入 Framer 上下文，供 AI 判断能研究什么） */
  description: string
}

const CAPABILITY_DESCRIPTIONS: Record<CapabilityKey, string> = {
  financial_growth: "营收/归母净利润的累计与单季同比、单季差分趋势序列",
  profitability: "毛利率、净利率、ROE 及其同比变化（百分点）",
  cashflow: "经营活动现金流同比、经营现金流/归母净利润、现金流单季趋势",
  valuation: "PE TTM / PB MRQ 快照、与行业中位数比较（含有效样本数）",
  market_price: "个股区间收益（20/60/120 交易日）、年化波动率、最大回撤",
  market_benchmark: "沪深300 同口径区间收益与个股相对表现（百分点差）",
  industry_market: "所属行业指数区间收益与个股相对行业表现（需已解析行业）",
  industry_valuation: "行业成分股 PE/PB 中位数（含有效样本数）",
  event: "个股异动记录（接口原文）、热榜关注度排名变化",
  corporate_action: "分红/送股等公司行为记录（12 个月）",
  risk: "事件覆盖边界（异动无记录、公告/新闻未接入）等风险维度证据",
}

/** 每个 capability 依赖的指标 ID（用于从 MetricResult availability 推导状态） */
const CAPABILITY_METRIC_IDS: Record<CapabilityKey, string[]> = {
  financial_growth: ["FIN_REVENUE_YOY_YTD", "FIN_NET_PROFIT_YOY_YTD", "FIN_REVENUE_YOY_QUARTER"],
  profitability: ["FIN_GROSS_MARGIN", "FIN_NET_MARGIN", "FIN_ROE"],
  cashflow: ["FIN_OCF_YOY_YTD", "FIN_CFO_TO_NET_PROFIT_YTD"],
  valuation: ["VAL_PE_TTM", "VAL_PB_MRQ"],
  market_price: ["MKT_RETURN_20D", "MKT_VOLATILITY_20D", "MKT_MAX_DRAWDOWN_120D"],
  market_benchmark: ["MKT_RELATIVE_CSI300_20D", "MKT_CSI300_RETURN_20D"],
  industry_market: ["IND_RETURN_20D", "MKT_RELATIVE_INDUSTRY_20D"],
  industry_valuation: ["VAL_PE_VS_INDUSTRY_MEDIAN", "VAL_PB_VS_INDUSTRY_MEDIAN"],
  event: [], // 由事件上下文决定
  corporate_action: [],
  risk: [], // 风险维度由事件边界 UNKNOWN 兜底，恒为 partial
}

function metricStatus(metrics: MetricResult[], ids: string[]): "ready" | "partial" | "unavailable" {
  const present = ids
    .map((id) => metrics.find((m) => m.metricId === id))
    .filter((m): m is MetricResult => Boolean(m))
  if (present.length === 0) return "unavailable"
  const available = present.filter((m) => m.status === "available").length
  if (available === present.length) return "ready"
  if (available === 0) return "unavailable"
  return "partial"
}

export interface CapabilityManifestInput {
  metrics: MetricResult[]
  evidence: Evidence[]
  events: EventContext | null
  industryResolved: boolean
  industryValuationAvailable: boolean
}

/**
 * 计算某只股票当前真实的 capability 可用性。
 * 规则：指标域 readiness + 事件域记录情况 + 行业解析结果共同决定，绝无公司类型模板。
 */
export function computeCapabilityManifest(input: CapabilityManifestInput): CapabilityAvailability[] {
  const { metrics, evidence, events, industryResolved, industryValuationAvailable } = input

  return CAPABILITY_KEYS.map((key): CapabilityAvailability => {
    const description = CAPABILITY_DESCRIPTIONS[key]

    if (key === "event") {
      const coverage = events?.coverage
      if (!coverage || coverage.anomaly === "failed" && coverage.attention === "failed") {
        return { key, status: "unavailable", reason: "event endpoints unavailable in this run", description }
      }
      const hasRecords = coverage.anomaly === "records" || coverage.attention === "records"
      return {
        key,
        status: hasRecords ? "ready" : "partial",
        ...(hasRecords ? {} : { reason: "endpoints returned no matching records (coverage boundaries only)" }),
        description,
      }
    }

    if (key === "corporate_action") {
      const coverage = events?.coverage.corporateAction
      if (!coverage || coverage === "failed") {
        return { key, status: "unavailable", reason: "corporate-action endpoint unavailable", description }
      }
      return coverage === "records"
        ? { key, status: "ready", description }
        : { key, status: "partial", reason: "no corporate actions recorded in the last 12 months", description }
    }

    if (key === "industry_market") {
      if (!industryResolved) {
        return { key, status: "unavailable", reason: "industry not resolved for this stock", description }
      }
      return metricStatus(metrics, CAPABILITY_METRIC_IDS[key]) === "ready"
        ? { key, status: "ready", description }
        : { key, status: "partial", reason: "industry index prices partially unavailable", description }
    }

    if (key === "industry_valuation") {
      if (!industryResolved) {
        return { key, status: "unavailable", reason: "industry not resolved for this stock", description }
      }
      return industryValuationAvailable
        ? { key, status: "ready", description }
        : { key, status: "unavailable", reason: "industry valuation samples unavailable", description }
    }

    if (key === "risk") {
      const hasRiskEvidence = evidence.some((e) => e.dimension === "risk")
      return {
        key,
        status: hasRiskEvidence ? "partial" : "unavailable",
        reason: hasRiskEvidence ? "coverage boundaries only (no news/disclosure text source)" : undefined,
        description,
      }
    }

    const status = metricStatus(metrics, CAPABILITY_METRIC_IDS[key])
    return status === "ready"
      ? { key, status, description }
      : { key, status, reason: "one or more underlying metrics unavailable", description }
  })
}

export function capabilityManifestSummary(manifest: CapabilityAvailability[]): {
  available: CapabilityKey[]
  unavailable: CapabilityKey[]
  partial: CapabilityKey[]
} {
  return {
    available: manifest.filter((c) => c.status === "ready").map((c) => c.key),
    partial: manifest.filter((c) => c.status === "partial").map((c) => c.key),
    unavailable: manifest.filter((c) => c.status === "unavailable").map((c) => c.key),
  }
}
