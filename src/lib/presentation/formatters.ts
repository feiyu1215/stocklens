import type { MetricResult } from "@/lib/metrics/types"

// Presentation Formatter —— UI 唯一的数字格式化出口（Task 05 §58–60）。
// 只做展示格式化，底层 MetricResult.value 不改写；Evidence 卡正文直接用 statement。

export function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits)
}

/** 带符号百分比：-8.45% / +9.83% */
export function formatSignedPercentage(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : ""
  return `${sign}${formatNumber(value, digits)}%`
}

/** 百分点变化：-0.36 pct */
export function formatPctPoint(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : ""
  return `${sign}${formatNumber(value, digits)} pct`
}

/** 倍数：1.42x / 13.77x */
export function formatRatio(value: number, digits = 2): string {
  return `${formatNumber(value, digits)}x`
}

export function formatDate(iso: string | null | undefined): string {
  return iso ?? "—"
}

/** YYYY-Qn → 2026 年第 2 季度（累计口径说明由上下文承担） */
export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "—"
  const m = /^(\d{4})-Q([1-4])$/.exec(period)
  if (!m) return period
  return `${m[1]} 年第 ${m[2]} 季度`
}

const SIGNED_METRIC_PATTERN = /_YOY_|RETURN_|DRAWDOWN_|CHANGE_/

/** MetricResult → 展示字符串（按 unit 与指标语义选择格式，2 位小数） */
export function formatMetricValue(metric: MetricResult): string {
  const { value, unit, metricId } = metric
  if (value === null || !Number.isFinite(value)) return "—"
  if (unit === "pct") return formatPctPoint(value)
  if (unit === "x") return formatRatio(value)
  if (unit === "%") {
    return SIGNED_METRIC_PATTERN.test(metricId) ? formatSignedPercentage(value) : `${formatNumber(value)}%`
  }
  return formatNumber(value)
}

/** 证据卡脚注的报告期/区间描述 */
export function formatEvidencePeriod(period?: string | null, comparisonPeriod?: string | null): string {
  if (!period) return "—"
  if (comparisonPeriod) return `${period} vs ${comparisonPeriod}`
  return period
}
