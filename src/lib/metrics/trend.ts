import type { FinancialPeriodData } from "@/lib/data/types"
import { getStandaloneQuarterValue, type CumulativeField } from "./financial"

// 财务趋势（Task 08 §15–18）：
// 复用 Task 02 已验证的「累计 → 单季差分」算法（getStandaloneQuarterValue），不另写第二套。
// 只描述历史，不做任何预测/外推。

export interface FinancialTrendPoint {
  /** 报告期，ASC 排序（如 2024-Q3 → 2026-Q2） */
  period: string
  /** 单季值（差分所得；缺失为 null） */
  revenueQuarter?: number | null
  netProfitQuarter?: number | null
  operatingCashflowQuarter?: number | null
  /** 单季同比（存在上年同期单季才计算；缺失为 null） */
  revenueQuarterYoY?: number | null
  netProfitQuarterYoY?: number | null
  operatingCashflowQuarterYoY?: number | null
}

type TrendField = Extract<CumulativeField, "revenue" | "netProfit" | "operatingCashflow">

function setQuarterValue(
  point: FinancialTrendPoint,
  field: TrendField,
  value: number | null,
): void {
  if (field === "revenue") point.revenueQuarter = value
  else if (field === "netProfit") point.netProfitQuarter = value
  else point.operatingCashflowQuarter = value
}

function getQuarterValue(
  point: FinancialTrendPoint | undefined,
  field: TrendField,
): number | null | undefined {
  if (!point) return undefined
  if (field === "revenue") return point.revenueQuarter
  if (field === "netProfit") return point.netProfitQuarter
  return point.operatingCashflowQuarter
}

function setQuarterYoY(
  point: FinancialTrendPoint,
  field: TrendField,
  value: number | null,
): void {
  if (field === "revenue") point.revenueQuarterYoY = value
  else if (field === "netProfit") point.netProfitQuarterYoY = value
  else point.operatingCashflowQuarterYoY = value
}

function quarterSortKey(period: string): number {
  const m = /^(\d{4})-Q([1-4])$/.exec(period)
  return m ? Number(m[1]) * 10 + Number(m[2]) : 0
}

/** 单季值 + 单季同比时间序列（ASC）。缺失保留 null，不假设。 */
export function buildFinancialTrend(periods: FinancialPeriodData[]): FinancialTrendPoint[] {
  if (periods.length === 0) return []

  const fields: TrendField[] = ["revenue", "netProfit", "operatingCashflow"]

  const points = new Map<string, FinancialTrendPoint>()
  for (const p of periods) {
    points.set(p.period, { period: p.period })
  }

  for (const field of fields) {
    for (const period of points.keys()) {
      const standalone = getStandaloneQuarterValue(periods, period, field)
      setQuarterValue(points.get(period)!, field, standalone)
    }
  }

  // 单季同比：本期单季 / 上年同期单季 - 1（×100）；上年同期单季不可得 → null
  for (const field of fields) {
    for (const period of points.keys()) {
      const m = /^(\d{4})-Q([1-4])$/.exec(period)
      const point = points.get(period)!
      const current = getQuarterValue(point, field)
      const prevPeriod = m ? `${Number(m[1]) - 1}-Q${m[2]}` : null
      const previous = prevPeriod ? getQuarterValue(points.get(prevPeriod), field) : undefined

      if (
        typeof current === "number" &&
        typeof previous === "number" &&
        previous !== 0
      ) {
        setQuarterYoY(point, field, (current / previous - 1) * 100)
      } else {
        setQuarterYoY(point, field, null)
      }
    }
  }

  return [...points.values()].sort((a, b) => quarterSortKey(a.period) - quarterSortKey(b.period))
}

/** 取某字段最近 N 个可比单季同比（ASC，跳过 null） */
export function latestQuarterYoYValues(
  trend: FinancialTrendPoint[],
  field: "revenueQuarterYoY" | "netProfitQuarterYoY" | "operatingCashflowQuarterYoY",
  n: number,
): { period: string; value: number }[] {
  const values = trend
    .filter((p) => typeof p[field] === "number")
    .map((p) => ({ period: p.period, value: p[field] as number }))
  return values.slice(-n)
}
