import type { ValuationData } from "@/lib/data/types"
import { UNITS, type MetricResult, type MetricSourceField } from "./types"

// 估值类指标：快照事实指标（fact metric）。
// 明确不做历史 PE 分位：当前没有历史估值时间序列，
// 禁止用价格历史代替 PE 历史、用当前 PE 推算历史 PE 或 Mock 历史估值。

function valuationSource(field: string, date?: string): MetricSourceField {
  return { source: "fuyao", domain: "valuation", field, date }
}

function valuationFact(
  valuation: ValuationData | null,
  opts: { metricId: string; name: string; key: "peTtm" | "pb"; rawField: string },
): MetricResult {
  const base: MetricResult = {
    metricId: opts.metricId,
    dimension: "valuation",
    name: opts.name,
    status: "available",
    value: null,
    unit: UNITS.multiple,
    period: valuation?.date,
    sourceFields: [valuationSource(opts.rawField, valuation?.date)],
    calculationMethod: `${opts.rawField} from fuyao valuations/snapshot, taken as-is`,
  }
  if (!valuation) {
    return { ...base, status: "unavailable", value: null, period: undefined, sourceFields: [], unavailableReason: "valuation snapshot unavailable" }
  }
  const value = valuation[opts.key]
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ...base, value }
  }
  return {
    ...base,
    status: "unavailable",
    value: null,
    unavailableReason: `${opts.rawField} is null in valuation snapshot`,
  }
}

export function buildValuationMetrics(valuation: ValuationData | null): MetricResult[] {
  return [
    valuationFact(valuation, { metricId: "VAL_PE_TTM", name: "市盈率（TTM）", key: "peTtm", rawField: "pe_ttm" }),
    valuationFact(valuation, { metricId: "VAL_PB_MRQ", name: "市净率（MRQ）", key: "pb", rawField: "pb_mrq" }),
  ]
}
