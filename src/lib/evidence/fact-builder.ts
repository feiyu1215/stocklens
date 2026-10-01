import type { MetricResult } from "@/lib/metrics/types"
import { classifyFreshness, staleQualifier } from "@/lib/metrics/freshness"

import type { Evidence, EvidenceDimension, EvidenceSignal } from "./types"

// FACT Builder：把「关键 available 指标」转成事实证据。
//
// 纪律：
// - 一个 Metric 默认只对应一个 Fact（防止同一数字生成多张卡片）；
// - 每个模板都显式表达口径（累计同比 / 单季同比 / 百分点 / 倍数）；
// - statement 中的一切数字只能来自 MetricResult.value（格式化仅为展示）；
// - 绝对水平类指标（毛利率、ROE、PE、波动率、回撤）无 benchmark → signal = neutral，
//   不判断"高/低/贵/便宜"。

const FACT_CONFIDENCE_REASON = "来自扶摇真实数据的确定性指标计算结果（Metric Engine，可追溯到原始字段与报告期）"

function directionSignal(v: number): EvidenceSignal {
  return v > 0 ? "positive" : v < 0 ? "negative" : "neutral"
}

/** 同比方向措辞：增长 X% / 下降 X% / 与上年同期持平 */
export function growthWord(v: number): string {
  if (v > 0) return `增长 ${v.toFixed(2)}%`
  if (v < 0) return `下降 ${Math.abs(v).toFixed(2)}%`
  return "与上年同期持平"
}

/** 百分点方向措辞：上升 X 个百分点 / 下降 X 个百分点 / 与上年同期持平 */
export function pctWord(v: number): string {
  if (v > 0) return `上升 ${v.toFixed(2)} 个百分点`
  if (v < 0) return `下降 ${Math.abs(v).toFixed(2)} 个百分点`
  return "与上年同期持平"
}

interface FactDefinition {
  metricId: string
  dimension: EvidenceDimension
  title: string
  signal: (value: number) => EvidenceSignal
  statement: (metric: MetricResult) => string
}

const FACT_DEFINITIONS: FactDefinition[] = [
  // ---------- Growth ----------
  {
    metricId: "FIN_REVENUE_YOY_YTD",
    dimension: "growth",
    title: "营业收入累计同比",
    signal: directionSignal,
    statement: (m) => `最新报告期 ${m.period ?? ""} 营业收入累计同比${growthWord(m.value!)}。`,
  },
  {
    metricId: "FIN_REVENUE_YOY_QUARTER",
    dimension: "growth",
    title: "营业收入单季同比",
    signal: directionSignal,
    statement: (m) => `最新报告期 ${m.period ?? ""} 单季营业收入同比${growthWord(m.value!)}。`,
  },
  {
    metricId: "FIN_NET_PROFIT_YOY_YTD",
    dimension: "growth",
    title: "归母净利润累计同比",
    signal: directionSignal,
    statement: (m) => `最新报告期 ${m.period ?? ""} 归母净利润累计同比${growthWord(m.value!)}。`,
  },
  {
    metricId: "FIN_NET_PROFIT_YOY_QUARTER",
    dimension: "growth",
    title: "归母净利润单季同比",
    signal: directionSignal,
    statement: (m) => `最新报告期 ${m.period ?? ""} 单季归母净利润同比${growthWord(m.value!)}。`,
  },
  // ---------- Cashflow ----------
  {
    metricId: "FIN_OCF_YOY_YTD",
    dimension: "cashflow",
    title: "经营活动现金流净额累计同比",
    signal: directionSignal,
    statement: (m) => `最新报告期 ${m.period ?? ""} 经营活动现金流净额累计同比${growthWord(m.value!)}。`,
  },
  {
    metricId: "FIN_OCF_YOY_QUARTER",
    dimension: "cashflow",
    title: "经营活动现金流净额单季同比",
    signal: directionSignal,
    statement: (m) => `最新报告期 ${m.period ?? ""} 单季经营活动现金流净额同比${growthWord(m.value!)}。`,
  },
  {
    // 单期现金流受营运资金等多因素影响：仅陈述倍数关系，不做价值判断
    metricId: "FIN_CFO_TO_NET_PROFIT_YTD",
    dimension: "cashflow",
    title: "经营现金流净额 / 归母净利润（累计）",
    signal: () => "neutral",
    statement: (m) =>
      `最新报告期 ${m.period ?? ""} 经营活动现金流净额累计为归母净利润的 ${m.value!.toFixed(2)} 倍。`,
  },
  // ---------- Profitability（绝对水平无 benchmark → neutral；同比变化按方向） ----------
  {
    metricId: "FIN_GROSS_MARGIN",
    dimension: "profitability",
    title: "销售毛利率（当期）",
    signal: () => "neutral",
    statement: (m) => `最新报告期 ${m.period ?? ""} 销售毛利率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "FIN_NET_MARGIN",
    dimension: "profitability",
    title: "销售净利率（当期）",
    signal: () => "neutral",
    statement: (m) => `最新报告期 ${m.period ?? ""} 销售净利率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "FIN_ROE",
    dimension: "profitability",
    title: "加权平均净资产收益率（当期）",
    signal: () => "neutral",
    statement: (m) => `最新报告期 ${m.period ?? ""} 加权平均净资产收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "FIN_GROSS_MARGIN_CHANGE_YOY",
    dimension: "profitability",
    title: "毛利率同比变化",
    signal: directionSignal,
    statement: (m) => `最新报告期 ${m.period ?? ""} 销售毛利率较上年同期${pctWord(m.value!)}。`,
  },
  {
    metricId: "FIN_NET_MARGIN_CHANGE_YOY",
    dimension: "profitability",
    title: "净利率同比变化",
    signal: directionSignal,
    statement: (m) => `最新报告期 ${m.period ?? ""} 销售净利率较上年同期${pctWord(m.value!)}。`,
  },
  {
    metricId: "FIN_ROE_CHANGE_YOY",
    dimension: "profitability",
    title: "ROE 同比变化",
    signal: directionSignal,
    statement: (m) => `最新报告期 ${m.period ?? ""} 加权平均净资产收益率较上年同期${pctWord(m.value!)}。`,
  },
  // ---------- Valuation（无历史/行业 benchmark → neutral，禁止"便宜/合理"） ----------
  {
    metricId: "VAL_PE_TTM",
    dimension: "valuation",
    title: "市盈率 PE TTM（快照）",
    signal: () => "neutral",
    statement: (m) => `当前估值快照（${m.period ?? ""}）市盈率 PE TTM 为 ${m.value!.toFixed(2)} 倍。`,
  },
  {
    metricId: "VAL_PB_MRQ",
    dimension: "valuation",
    title: "市净率 PB MRQ（快照）",
    signal: () => "neutral",
    statement: (m) => `当前估值快照（${m.period ?? ""}）市净率 PB MRQ 为 ${m.value!.toFixed(2)} 倍。`,
  },
  // ---------- Market（收益率按方向；波动率/回撤无基准 → neutral） ----------
  {
    metricId: "MKT_RETURN_20D",
    dimension: "market",
    title: "20 交易日区间收益率",
    signal: directionSignal,
    statement: (m) => `最近 20 个交易日区间收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "MKT_RETURN_60D",
    dimension: "market",
    title: "60 交易日区间收益率",
    signal: directionSignal,
    statement: (m) => `最近 60 个交易日区间收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "MKT_RETURN_120D",
    dimension: "market",
    title: "120 交易日区间收益率",
    signal: directionSignal,
    statement: (m) => `最近 120 个交易日区间收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "MKT_VOLATILITY_20D",
    dimension: "market",
    title: "20 日年化波动率",
    signal: () => "neutral",
    statement: (m) => `最近 20 个交易日年化波动率为 ${m.value!.toFixed(2)}%（日对数收益率样本标准差年化）。`,
  },
  {
    metricId: "MKT_VOLATILITY_60D",
    dimension: "market",
    title: "60 日年化波动率",
    signal: () => "neutral",
    statement: (m) => `最近 60 个交易日年化波动率为 ${m.value!.toFixed(2)}%（日对数收益率样本标准差年化）。`,
  },
  {
    metricId: "MKT_MAX_DRAWDOWN_120D",
    dimension: "market",
    title: "120 交易日最大回撤",
    signal: () => "neutral",
    statement: (m) => `最近 120 个交易日最大回撤为 ${m.value!.toFixed(2)}%。`,
  },
  // ---------- Benchmark & Relative（Task 08 §24：仅表示相对表现方向，不是评级） ----------
  {
    metricId: "MKT_CSI300_RETURN_20D",
    dimension: "market",
    title: "沪深300 20 交易日区间收益率",
    signal: directionSignal,
    statement: (m) => `最近 20 个交易日沪深300 指数区间收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "MKT_CSI300_RETURN_60D",
    dimension: "market",
    title: "沪深300 60 交易日区间收益率",
    signal: directionSignal,
    statement: (m) => `最近 60 个交易日沪深300 指数区间收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "MKT_CSI300_RETURN_120D",
    dimension: "market",
    title: "沪深300 120 交易日区间收益率",
    signal: directionSignal,
    statement: (m) => `最近 120 个交易日沪深300 指数区间收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "MKT_RELATIVE_CSI300_20D",
    dimension: "market",
    title: "个股相对沪深300 表现（20 日，百分点差）",
    signal: directionSignal,
    statement: (m) =>
      m.value! >= 0
        ? `最近 20 个交易日，个股区间收益率较沪深300高 ${m.value!.toFixed(2)} 个百分点。`
        : `最近 20 个交易日，个股区间收益率较沪深300低 ${Math.abs(m.value!).toFixed(2)} 个百分点。`,
  },
  {
    metricId: "MKT_RELATIVE_CSI300_60D",
    dimension: "market",
    title: "个股相对沪深300 表现（60 日，百分点差）",
    signal: directionSignal,
    statement: (m) =>
      m.value! >= 0
        ? `最近 60 个交易日，个股区间收益率较沪深300高 ${m.value!.toFixed(2)} 个百分点。`
        : `最近 60 个交易日，个股区间收益率较沪深300低 ${Math.abs(m.value!).toFixed(2)} 个百分点。`,
  },
  {
    metricId: "MKT_RELATIVE_CSI300_120D",
    dimension: "market",
    title: "个股相对沪深300 表现（120 日，百分点差）",
    signal: directionSignal,
    statement: (m) =>
      m.value! >= 0
        ? `最近 120 个交易日，个股区间收益率较沪深300高 ${m.value!.toFixed(2)} 个百分点。`
        : `最近 120 个交易日，个股区间收益率较沪深300低 ${Math.abs(m.value!).toFixed(2)} 个百分点。`,
  },
  // ---------- Industry Context（Task 08 §25） ----------
  {
    metricId: "IND_RETURN_20D",
    dimension: "industry",
    title: "所属行业指数 20 交易日区间收益率",
    signal: directionSignal,
    statement: (m) => `最近 20 个交易日，所属行业指数区间收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "IND_RETURN_60D",
    dimension: "industry",
    title: "所属行业指数 60 交易日区间收益率",
    signal: directionSignal,
    statement: (m) => `最近 60 个交易日，所属行业指数区间收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "IND_RETURN_120D",
    dimension: "industry",
    title: "所属行业指数 120 交易日区间收益率",
    signal: directionSignal,
    statement: (m) => `最近 120 个交易日，所属行业指数区间收益率为 ${m.value!.toFixed(2)}%。`,
  },
  {
    metricId: "MKT_RELATIVE_INDUSTRY_20D",
    dimension: "industry",
    title: "个股相对所属行业表现（20 日，百分点差）",
    signal: directionSignal,
    statement: (m) =>
      m.value! >= 0
        ? `最近 20 个交易日，个股区间收益率较所属行业指数高 ${m.value!.toFixed(2)} 个百分点。`
        : `最近 20 个交易日，个股区间收益率较所属行业指数低 ${Math.abs(m.value!).toFixed(2)} 个百分点。`,
  },
  {
    metricId: "MKT_RELATIVE_INDUSTRY_60D",
    dimension: "industry",
    title: "个股相对所属行业表现（60 日，百分点差）",
    signal: directionSignal,
    statement: (m) =>
      m.value! >= 0
        ? `最近 60 个交易日，个股区间收益率较所属行业指数高 ${m.value!.toFixed(2)} 个百分点。`
        : `最近 60 个交易日，个股区间收益率较所属行业指数低 ${Math.abs(m.value!).toFixed(2)} 个百分点。`,
  },
  {
    metricId: "MKT_RELATIVE_INDUSTRY_120D",
    dimension: "industry",
    title: "个股相对所属行业表现（120 日，百分点差）",
    signal: directionSignal,
    statement: (m) =>
      m.value! >= 0
        ? `最近 120 个交易日，个股区间收益率较所属行业指数高 ${m.value!.toFixed(2)} 个百分点。`
        : `最近 120 个交易日，个股区间收益率较所属行业指数低 ${Math.abs(m.value!).toFixed(2)} 个百分点。`,
  },
  // ---------- Industry Valuation（Task 08 §28：事实陈述，不做高低判断） ----------
  {
    metricId: "VAL_PE_VS_INDUSTRY_MEDIAN",
    dimension: "valuation",
    title: "PE TTM 相对行业中位数（倍数差）",
    signal: () => "neutral",
    statement: (m) => `当前 PE TTM 较所属行业中位数${m.value! >= 0 ? "高" : "低"} ${Math.abs(m.value!).toFixed(2)} 倍。`,
  },
  {
    metricId: "VAL_PB_VS_INDUSTRY_MEDIAN",
    dimension: "valuation",
    title: "PB MRQ 相对行业中位数（倍数差）",
    signal: () => "neutral",
    statement: (m) => `当前 PB MRQ 较所属行业中位数${m.value! >= 0 ? "高" : "低"} ${Math.abs(m.value!).toFixed(2)} 倍。`,
  },
]

export function buildFacts(metrics: MetricResult[], opts?: { now?: Date; retrievedAt?: string }): Evidence[] {
  const byId = new Map(metrics.map((m) => [m.metricId, m] as const))
  const facts: Evidence[] = []
  for (const def of FACT_DEFINITIONS) {
    const metric = byId.get(def.metricId)
    // unavailable 指标不生成 Fact（由 unknown-builder 按能力组聚合为 UNKNOWN）
    if (!metric || metric.status !== "available" || typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
      continue
    }
    // Task 17.1 §P0：新鲜度随证据传播；过期数据必须在 statement 里显式声明
    // "当前状态无法由该数据确认"，不允许静默支撑一个当前结论。
    const freshness = classifyFreshness({
      sourceFields: metric.sourceFields,
      dimension: def.dimension,
      period: metric.period,
      retrievedAt: opts?.retrievedAt,
      now: opts?.now,
    })
    facts.push({
      evidenceId: `EV_FACT_${def.metricId}`,
      dimension: def.dimension,
      title: def.title,
      statement: def.statement(metric) + staleQualifier(freshness),
      type: "fact",
      signal: def.signal(metric.value),
      confidence: "high",
      metricIds: [def.metricId],
      basedOn: [],
      period: metric.period,
      comparisonPeriod: metric.comparisonPeriod,
      sourceFields: metric.sourceFields,
      verifyStatus: "verified",
      confidenceReason: FACT_CONFIDENCE_REASON,
      freshness,
      // Task 10：同比解释护栏（低基数/正负切换/极端变化）随证据传播
      ...(metric.interpretationFlags && metric.interpretationFlags.length > 0
        ? { interpretationFlags: metric.interpretationFlags }
        : {}),
      ...(metric.interpretationNote ? { interpretationNote: metric.interpretationNote } : {}),
    })
  }
  return facts
}
