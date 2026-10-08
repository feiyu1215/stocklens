// 双公司对比 P0（docs/plans/2026-10-08-双公司对比-P0-PRD.md）——纯函数层。
//
// 纪律（来自两轮外部评审收敛，必须遵守）：
// 1. 数值只来自结构化 metrics（MetricResult.value），绝不由 AI 文本提取；
// 2. 可比性三级判定是确定性规则，AI 不参与；不可比时绝不推导差值；
// 3. 证据定位使用复合身份 {stockCode, evidenceId}——两份 payload 各自内部查找，
//    原始证据 ID（EV_FACT_${metricId}，无公司前缀）不改写、不合并，天然不冲突；
// 4. 差值是中性事实：% 单位指标的差值单位是 pct（百分点差），x 单位为绝对差；
//    不做"谁更好"的判断（那是 P2 的事）。
// 本模块必须保持 client-safe：不 import 任何 server-only 模块。

import type { MetricResult, MetricSourceField } from "@/lib/metrics/types"
import type { ResearchSpacePayload } from "@/components/observatory/theme"

// ---- 固定指标目录 ----

export type CompareGroup = "growth" | "profitability" | "cashflow" | "valuation"

export interface CompareMetricDef {
  metricId: string
  name: string
  group: CompareGroup
  /** 口径备注（展示在指标名下方），如"累计/YTD" */
  note: string
}

export const COMPARE_CATALOG: CompareMetricDef[] = [
  { metricId: "FIN_REVENUE_YOY_YTD", name: "营收同比", group: "growth", note: "累计/YTD" },
  { metricId: "FIN_NET_PROFIT_YOY_YTD", name: "净利润同比", group: "growth", note: "累计/YTD" },
  { metricId: "FIN_OCF_YOY_YTD", name: "经营现金流同比", group: "growth", note: "累计/YTD" },
  { metricId: "FIN_GROSS_MARGIN", name: "销售毛利率", group: "profitability", note: "报告期值" },
  { metricId: "FIN_NET_MARGIN", name: "销售净利率", group: "profitability", note: "报告期值" },
  { metricId: "FIN_ROE", name: "加权平均净资产收益率", group: "profitability", note: "报告期值" },
  { metricId: "FIN_CFO_TO_NET_PROFIT_YTD", name: "经营现金流 / 净利润", group: "cashflow", note: "累计/YTD，倍数" },
  { metricId: "VAL_PE_TTM", name: "市盈率（TTM）", group: "valuation", note: "按交易日快照" },
  { metricId: "VAL_PB_MRQ", name: "市净率（MRQ）", group: "valuation", note: "按交易日快照" },
]

export const COMPARE_GROUP_ORDER: CompareGroup[] = ["growth", "profitability", "cashflow", "valuation"]

// ---- 可比性判定与差值 ----

export type CompareStatus = "comparable" | "side_by_side" | "not_comparable"

export interface CompareSide {
  stockCode: string
  stockName: string
  /** "missing" = 目录指标在 metrics 里根本不存在（区别于 metrics 自报 unavailable） */
  status: "available" | "unavailable" | "missing"
  value: number | null
  unit: string
  period?: string
  unavailableReason?: string
  /** 复合身份的 evidenceId（EV_FACT_${metricId}）；仅在本 payload 内查找 */
  evidenceId: string
  /** 该证据存在于本 payload 时给出（metric available 时 fact-builder 必然已生成） */
  statement?: string
  calculationMethod?: string
  sourceFields: MetricSourceField[]
}

export interface CompareRow {
  def: CompareMetricDef
  left: CompareSide
  right: CompareSide
  status: CompareStatus
  /**
   * 仅 status="comparable" 时非空。
   * % 单位 → 单位 pct（百分点差，left−right）；x 单位 → 单位 x（绝对差）。
   * 保留原始精度，展示层负责舍入（对齐 Metric Engine"只计算不解释"的分层）。
   */
  diff: { value: number; unit: string } | null
}

function toSide(payload: ResearchSpacePayload, def: CompareMetricDef): CompareSide {
  const evidenceId = `EV_FACT_${def.metricId}`
  const metric = payload.metrics?.find((m: MetricResult) => m.metricId === def.metricId)
  const evidence = payload.evidence?.find((e) => e.evidenceId === evidenceId)
  if (!metric) {
    return {
      stockCode: payload.company.stockCode,
      stockName: payload.company.stockName,
      status: "missing",
      value: null,
      unit: "—",
      evidenceId,
      sourceFields: [],
    }
  }
  return {
    stockCode: payload.company.stockCode,
    stockName: payload.company.stockName,
    status: metric.status === "available" && typeof metric.value === "number" && Number.isFinite(metric.value)
      ? "available"
      : "unavailable",
    value: metric.status === "available" ? metric.value : null,
    unit: metric.unit,
    period: metric.period,
    unavailableReason: metric.unavailableReason,
    evidenceId,
    statement: evidence?.statement,
    calculationMethod: metric.calculationMethod,
    sourceFields: metric.sourceFields ?? [],
  }
}

/** % 单位指标的差值单位是 pct（百分点差），其余按原始单位做绝对差。 */
function diffUnit(unit: string): string {
  return unit === "%" ? "pct" : unit
}

function buildRow(def: CompareMetricDef, payloadA: ResearchSpacePayload, payloadB: ResearchSpacePayload): CompareRow {
  const left = toSide(payloadA, def)
  const right = toSide(payloadB, def)

  if (left.status === "available" && right.status === "available") {
    if (left.period && right.period && left.period === right.period) {
      // 同口径：才允许差值。left.value/right.value 此处必为有限数值（status 判定已保证）。
      const diffValue = (left.value as number) - (right.value as number)
      return {
        def,
        left,
        right,
        status: "comparable",
        diff: { value: diffValue, unit: diffUnit(left.unit) },
      }
    }
    // 都有值但报告期/数据日期不同：只并列参考，不算差值
    return { def, left, right, status: "side_by_side", diff: null }
  }
  // 任一方不可用/缺失：不可比，不推导
  return { def, left, right, status: "not_comparable", diff: null }
}

export function buildCompareRows(
  payloadA: ResearchSpacePayload,
  payloadB: ResearchSpacePayload,
): CompareRow[] {
  return COMPARE_CATALOG.map((def) => buildRow(def, payloadA, payloadB))
}

// ---- 数据可用性三态（评审纠正 2：研究库有记录 ≠ 数据可用） ----

export type CompareLoadState = "ok" | "missing" | "incomplete"

export interface ClassifiedLoad {
  state: CompareLoadState
  payload: ResearchSpacePayload | null
  /**
   * incomplete 的具体原因（missing 不需要——整包都不在）；
   * 判定为 incomplete 时 metrics 视为空目录处理，页面只展示可验证部分。
   */
  issue?: string
}

export function classifyResearchLoad(
  load: { payload: ResearchSpacePayload; recordedSample: boolean } | null,
): ClassifiedLoad {
  if (!load) return { state: "missing", payload: null }
  const payload = load.payload
  if (!payload || typeof payload !== "object") {
    return { state: "missing", payload: null }
  }
  if (!Array.isArray(payload.metrics) || payload.metrics.length === 0) {
    return { state: "incomplete", payload, issue: "metrics 缺失或为空" }
  }
  if (!Array.isArray(payload.evidence)) {
    return { state: "incomplete", payload, issue: "evidence 缺失" }
  }
  return { state: "ok", payload }
}

// ---- 示例/真实数据混合判定（示例数据纪律） ----

export type SampleMix = "both_real" | "both_recorded" | "mixed"

export function describeSampleMix(aRecorded: boolean, bRecorded: boolean): SampleMix {
  if (aRecorded && bRecorded) return "both_recorded"
  if (aRecorded || bRecorded) return "mixed"
  return "both_real"
}

// ---- 展示格式化（纯函数，便于测试与复用） ----

/** 值格式化：% 一位小数、x 两位小数、金额原样（P0 目录内不涉及金额）。 */
export function formatMetricValue(value: number, unit: string): string {
  if (unit === "%") return `${value.toFixed(1)}%`
  if (unit === "x") return `${value.toFixed(2)}x`
  return String(value)
}

/** 差值格式化：始终带符号，% 用 pct。 */
export function formatMetricDiff(value: number, unit: string): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±"
  const abs = Math.abs(value)
  const body = unit === "%" || unit === "pct" ? `${abs.toFixed(1)}` : unit === "x" ? `${abs.toFixed(2)}` : `${abs}`
  return `${sign}${body} ${unit}`
}
