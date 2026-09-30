import type { FinancialPeriodData } from "@/lib/data/types"
import { UNITS, type MetricResult, type MetricSourceField } from "./types"

// 财务类指标（确定性计算，无语义判断）。
//
// 口径铁律：扶摇 quarterly 报表是「年初至今累计值」。
//   YTD 同比 = 当前累计 / 上年同期累计 - 1
//   单季值   = 本期累计 - 上季累计（Q1 单季 = Q1 累计）
// 两套口径使用不同 metricId，绝不混用。

export type CumulativeField = "revenue" | "netProfit" | "operatingCashflow"

const RAW_FIELD_BY_KEY: Record<CumulativeField, string> = {
  revenue: "operating_income",
  netProfit: "parent_holder_net_profit",
  operatingCashflow: "act_cash_flow_net",
}

const FIELD_LABEL: Record<CumulativeField, string> = {
  revenue: "营业收入",
  netProfit: "归母净利润",
  operatingCashflow: "经营活动现金流净额",
}

function numberOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** 上年同期："2026-Q2" → "2025-Q2" */
export function prevYearSamePeriod(period: string): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(period)
  if (!m) throw new Error(`无法解析报告期：${period}`)
  return `${Number(m[1]) - 1}-Q${m[2]}`
}

/**
 * 单季值转换（纯函数）。
 * Q1 = 累计本身；Qn = 本期累计 - 上季累计。
 * 任一必需数据缺失 → null（unavailable），不得假设。
 */
export function getStandaloneQuarterValue(
  periods: FinancialPeriodData[],
  period: string,
  field: CumulativeField,
): number | null {
  const byPeriod = new Map(periods.map((p) => [p.period, p] as const))
  const current = numberOrNull(byPeriod.get(period)?.[field])
  if (current === null) return null

  const m = /^(\d{4})-Q([1-4])$/.exec(period)
  if (!m) return null
  const q = Number(m[2])
  if (q === 1) return current

  const prevQuarter = `${m[1]}-Q${q - 1}`
  const prevCumulative = numberOrNull(byPeriod.get(prevQuarter)?.[field])
  if (prevCumulative === null) return null
  return current - prevCumulative
}

function cumulativeField(
  periods: FinancialPeriodData[],
  period: string,
  field: CumulativeField,
): number | null {
  const byPeriod = new Map(periods.map((p) => [p.period, p] as const))
  return numberOrNull(byPeriod.get(period)?.[field])
}

function financialSource(field: string, period: string): MetricSourceField {
  return { source: "fuyao", domain: "financial", field, period }
}

/** 累计同比：当前累计 / 上年同期累计 - 1（×100，单位 %） */
function buildCumulativeYoY(
  periods: FinancialPeriodData[],
  latestPeriod: string,
  field: CumulativeField,
): MetricResult {
  const metricId =
    field === "revenue"
      ? "FIN_REVENUE_YOY_YTD"
      : field === "netProfit"
        ? "FIN_NET_PROFIT_YOY_YTD"
        : "FIN_OCF_YOY_YTD"
  const comparisonPeriod = prevYearSamePeriod(latestPeriod)
  const current = cumulativeField(periods, latestPeriod, field)
  const previous = cumulativeField(periods, comparisonPeriod, field)

  const base: MetricResult = {
    metricId,
    dimension: "growth",
    name: `${FIELD_LABEL[field]}同比（累计/YTD）`,
    status: "available",
    value: null,
    unit: UNITS.percent,
    period: latestPeriod,
    comparisonPeriod,
    sourceFields: [
      financialSource(RAW_FIELD_BY_KEY[field], latestPeriod),
      financialSource(RAW_FIELD_BY_KEY[field], comparisonPeriod),
    ],
    calculationMethod: `(${latestPeriod} cumulative ${RAW_FIELD_BY_KEY[field]} / ${comparisonPeriod} cumulative ${RAW_FIELD_BY_KEY[field]} - 1) × 100`,
  }

  if (current === null) {
    return { ...base, status: "unavailable", value: null, unavailableReason: `${latestPeriod} ${field} is missing` }
  }
  if (previous === null) {
    return { ...base, status: "unavailable", value: null, unavailableReason: `${comparisonPeriod} ${field} is missing` }
  }
  if (previous === 0) {
    return { ...base, status: "unavailable", value: null, unavailableReason: `denominator (${comparisonPeriod} ${field}) is 0` }
  }
  return { ...base, value: (current / previous - 1) * 100 }
}

/** 单季同比：本期单季 / 上年同期单季 - 1（×100，单位 %） */
function buildQuarterlyYoY(
  periods: FinancialPeriodData[],
  latestPeriod: string,
  field: CumulativeField,
): MetricResult {
  const metricId =
    field === "revenue"
      ? "FIN_REVENUE_YOY_QUARTER"
      : field === "netProfit"
        ? "FIN_NET_PROFIT_YOY_QUARTER"
        : "FIN_OCF_YOY_QUARTER"
  const comparisonPeriod = prevYearSamePeriod(latestPeriod)
  const raw = RAW_FIELD_BY_KEY[field]

  const standalone = (period: string): number | null => {
    const m = /^(\d{4})-Q([1-4])$/.exec(period)
    if (!m) return null
    const current = cumulativeField(periods, period, field)
    if (current === null) return null
    if (Number(m[2]) === 1) return current
    const prevCumulative = cumulativeField(periods, `${m[1]}-Q${Number(m[2]) - 1}`, field)
    if (prevCumulative === null) return null
    return current - prevCumulative
  }

  const currentStandalone = standalone(latestPeriod)
  const previousStandalone = standalone(comparisonPeriod)

  const sourceFields: MetricSourceField[] = [
    financialSource(raw, latestPeriod),
    financialSource(raw, comparisonPeriod),
  ]
  // Qn(n>1) 的单季值还依赖上季累计，一并登记 provenance
  const quarterOfLatest = Number(latestPeriod.slice(-1))
  const quarterOfPrev = Number(comparisonPeriod.slice(-1))
  if (quarterOfLatest > 1) {
    sourceFields.push(financialSource(raw, `${latestPeriod.slice(0, 4)}-Q${quarterOfLatest - 1}`))
  }
  if (quarterOfPrev > 1) {
    sourceFields.push(financialSource(raw, `${comparisonPeriod.slice(0, 4)}-Q${quarterOfPrev - 1}`))
  }

  const base: MetricResult = {
    metricId,
    dimension: "growth",
    name: `${FIELD_LABEL[field]}同比（单季）`,
    status: "available",
    value: null,
    unit: UNITS.percent,
    period: latestPeriod,
    comparisonPeriod,
    sourceFields,
    calculationMethod: `((${latestPeriod} cumulative - previous-quarter cumulative) / (${comparisonPeriod} cumulative - previous-quarter cumulative) - 1) × 100`,
  }

  if (currentStandalone === null) {
    return { ...base, status: "unavailable", value: null, unavailableReason: `standalone quarter value for ${latestPeriod} is not derivable (missing cumulative data)` }
  }
  if (previousStandalone === null) {
    return { ...base, status: "unavailable", value: null, unavailableReason: `standalone quarter value for ${comparisonPeriod} is not derivable (missing cumulative data)` }
  }
  if (previousStandalone === 0) {
    return { ...base, status: "unavailable", value: null, unavailableReason: `denominator (${comparisonPeriod} standalone quarter) is 0` }
  }
  return { ...base, value: (currentStandalone / previousStandalone - 1) * 100 }
}

/** CFO / 归母净利润（同一累计报告期） */
function buildCfoToNetProfit(
  periods: FinancialPeriodData[],
  latestPeriod: string,
): MetricResult {
  const ocf = cumulativeField(periods, latestPeriod, "operatingCashflow")
  const netProfit = cumulativeField(periods, latestPeriod, "netProfit")
  const base: MetricResult = {
    metricId: "FIN_CFO_TO_NET_PROFIT_YTD",
    dimension: "cashflow",
    name: "经营现金流净额 / 归母净利润（累计）",
    status: "available",
    value: null,
    unit: UNITS.multiple,
    period: latestPeriod,
    sourceFields: [
      financialSource("act_cash_flow_net", latestPeriod),
      financialSource("parent_holder_net_profit", latestPeriod),
    ],
    calculationMethod: `${latestPeriod} cumulative act_cash_flow_net / ${latestPeriod} cumulative parent_holder_net_profit`,
  }
  if (ocf === null) {
    return { ...base, status: "unavailable", value: null, unavailableReason: `${latestPeriod} operatingCashflow is missing` }
  }
  if (netProfit === null) {
    return { ...base, status: "unavailable", value: null, unavailableReason: `${latestPeriod} netProfit is missing` }
  }
  if (netProfit === 0) {
    return { ...base, status: "unavailable", value: null, unavailableReason: "net profit = 0, ratio undefined" }
  }
  if (netProfit < 0) {
    // 明确规则：净利润 ≤ 0 时该比值失去解释价值，标记 unavailable 而非强行计算
    return { ...base, status: "unavailable", value: null, unavailableReason: "CFO / Net Profit ratio is not meaningful when net profit <= 0" }
  }
  return { ...base, value: ocf / netProfit }
}

interface MarginDefinition {
  metricId: string
  name: string
  key: "grossMargin" | "netMargin" | "roe"
  rawField: string
}

const MARGIN_DEFINITIONS: MarginDefinition[] = [
  { metricId: "FIN_GROSS_MARGIN", name: "销售毛利率", key: "grossMargin", rawField: "sale_gross_margin" },
  { metricId: "FIN_NET_MARGIN", name: "销售净利率", key: "netMargin", rawField: "sale_net_interest_ratio" },
  { metricId: "FIN_ROE", name: "加权平均净资产收益率", key: "roe", rawField: "index_weighted_avg_roe" },
]

const CHANGE_DEFINITIONS: MarginDefinition[] = [
  { metricId: "FIN_GROSS_MARGIN_CHANGE_YOY", name: "毛利率同比变化", key: "grossMargin", rawField: "sale_gross_margin" },
  { metricId: "FIN_NET_MARGIN_CHANGE_YOY", name: "净利率同比变化", key: "netMargin", rawField: "sale_net_interest_ratio" },
  { metricId: "FIN_ROE_CHANGE_YOY", name: "ROE 同比变化", key: "roe", rawField: "index_weighted_avg_roe" },
]

function indicatorSource(rawField: string, period: string): MetricSourceField {
  return { source: "fuyao", domain: "financial", field: `indicators:${rawField}`, period }
}

/** 盈利能力事实指标（官方指标，最新期） */
function buildMarginFacts(
  periods: FinancialPeriodData[],
  latestPeriod: string,
): MetricResult[] {
  const byPeriod = new Map(periods.map((p) => [p.period, p] as const))
  const latest = byPeriod.get(latestPeriod)
  return MARGIN_DEFINITIONS.map((def): MetricResult => {
    const base: MetricResult = {
      metricId: def.metricId,
      dimension: "profitability",
      name: def.name,
      status: "available",
      value: null,
      unit: UNITS.percent,
      period: latestPeriod,
      sourceFields: [indicatorSource(def.rawField, latestPeriod)],
      calculationMethod: `${def.rawField} from fuyao financials/indicators (report ${latestPeriod.replace("-Q", "-")}), taken as-is`,
    }
    const value = latest?.[def.key]
    if (typeof value === "number" && Number.isFinite(value)) {
      return { ...base, value }
    }
    return {
      ...base,
      status: "unavailable",
      value: null,
      unavailableReason:
        value === null
          ? `indicator ${def.rawField} is null for ${latestPeriod}`
          : `indicators not fetched for ${latestPeriod}`,
    }
  })
}

/** 盈利能力同比变化（百分点差，非百分比增速） */
function buildMarginChanges(
  periods: FinancialPeriodData[],
  latestPeriod: string,
): MetricResult[] {
  const byPeriod = new Map(periods.map((p) => [p.period, p] as const))
  const comparisonPeriod = prevYearSamePeriod(latestPeriod)
  const latest = byPeriod.get(latestPeriod)
  const previous = byPeriod.get(comparisonPeriod)
  return CHANGE_DEFINITIONS.map((def): MetricResult => {
    const base: MetricResult = {
      metricId: def.metricId,
      dimension: "profitability",
      name: def.name,
      status: "available",
      value: null,
      unit: UNITS.pctPoint,
      period: latestPeriod,
      comparisonPeriod,
      sourceFields: [
        indicatorSource(def.rawField, latestPeriod),
        indicatorSource(def.rawField, comparisonPeriod),
      ],
      calculationMethod: `${def.rawField}(${latestPeriod}) - ${def.rawField}(${comparisonPeriod}), in percentage points`,
    }
    const current = latest?.[def.key]
    const prior = previous?.[def.key]
    if (!(typeof current === "number" && Number.isFinite(current))) {
      return { ...base, status: "unavailable", value: null, unavailableReason: `indicator ${def.rawField} unavailable for ${latestPeriod}` }
    }
    if (!(typeof prior === "number" && Number.isFinite(prior))) {
      return { ...base, status: "unavailable", value: null, unavailableReason: `same-period-previous-year (${comparisonPeriod}) indicator ${def.rawField} unavailable` }
    }
    return { ...base, value: current - prior }
  })
}

export function buildFinancialMetrics(
  periods: FinancialPeriodData[],
  latestPeriod: string | null,
): MetricResult[] {
  if (!latestPeriod) {
    // 无任何财务数据：13 个财务指标全部以 unavailable 呈现（不静默丢弃）
    const reason = "financial data unavailable (no report period discovered)"
    const unavailable = (
      metricId: string,
      dimension: "growth" | "profitability" | "cashflow",
      unit: string,
    ): MetricResult => ({
      metricId,
      dimension,
      name: metricId,
      status: "unavailable",
      value: null,
      unit,
      sourceFields: [],
      calculationMethod: "-",
      unavailableReason: reason,
    })
    const growth = ["FIN_REVENUE_YOY_YTD", "FIN_REVENUE_YOY_QUARTER", "FIN_NET_PROFIT_YOY_YTD", "FIN_NET_PROFIT_YOY_QUARTER", "FIN_OCF_YOY_YTD", "FIN_OCF_YOY_QUARTER"]
    return [
      ...growth.map((id) => unavailable(id, "growth", UNITS.percent)),
      unavailable("FIN_CFO_TO_NET_PROFIT_YTD", "cashflow", UNITS.multiple),
      ...MARGIN_DEFINITIONS.map((d) => unavailable(d.metricId, "profitability", UNITS.percent)),
      ...CHANGE_DEFINITIONS.map((d) => unavailable(d.metricId, "profitability", UNITS.pctPoint)),
    ]
  }

  const fields: CumulativeField[] = ["revenue", "netProfit", "operatingCashflow"]
  return [
    ...fields.map((f) => buildCumulativeYoY(periods, latestPeriod, f)),
    ...fields.map((f) => buildQuarterlyYoY(periods, latestPeriod, f)),
    buildCfoToNetProfit(periods, latestPeriod),
    ...buildMarginFacts(periods, latestPeriod),
    ...buildMarginChanges(periods, latestPeriod),
  ]
}
