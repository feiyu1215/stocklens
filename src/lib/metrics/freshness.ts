import type { MetricSourceField } from "./types"

// Task 17.1 §P0：数据新鲜度（确定性、可测）。
//
// 目的：**过期数据不得静默支撑一个"当前状态"结论**。
//
// 两类口径必须分开：
//  - 时间敏感数据（行情 / 估值快照 / 行业指数行情 / 事件核查）→ 按数据日期与自然日阈值判定；
//  - 财务报表（报告期数据）→ **不按自然日判定**：2026-Q2 的报表不会因为"不是今天"而过期，
//    只以「最新报告期」的方式描述。
//
// 判定不出来时一律 status = "unknown"，绝不静默标为 fresh。

export type FreshnessStatus = "fresh" | "stale" | "unknown"

export interface DataFreshness {
  status: FreshnessStatus
  /** 数据自身的日期（行情/估值，YYYY-MM-DD）或报告期（财务，YYYY-QX） */
  dataAsOf?: string
  /** 取到该数据的时间（由调用方提供；缺失则不下结论） */
  retrievedAt?: string
  /** 是否属于按自然日判定时效的类别 */
  timeSensitive: boolean
  /** 数据日期距参考时间的天数（仅在能算出时给出） */
  ageDays?: number
  /** 判定依据或无法判定的原因（必须可读，会被展示与传给模型） */
  reason: string
}

/** 行情类数据时效阈值（自然日）：覆盖周末与短假期 */
export const MARKET_STALE_DAYS = 7
/** 估值快照时效阈值（自然日）：与行情同一交易日口径 */
export const VALUATION_STALE_DAYS = 7

const TIME_SENSITIVE_DOMAINS = new Set<string>(["prices", "valuation"])
/** 维度层面的兜底：行情/估值类指标即便 sourceFields 缺失也按时间敏感处理 */
const TIME_SENSITIVE_DIMENSIONS = new Set<string>(["market", "valuation", "industry"])

export function isTimeSensitive(sourceFields: MetricSourceField[], dimension?: string): boolean {
  if (dimension && TIME_SENSITIVE_DIMENSIONS.has(dimension)) return true
  return sourceFields.some((f) => TIME_SENSITIVE_DOMAINS.has(f.domain))
}

/** 只接受明确的日期形态，避免把 "2026-Q2" 误当日历日期 */
export function parseDataDate(raw: string | undefined | null): Date | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(raw).trim())
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(`${m[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`)
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== Number(m[1]) ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return d
}

/** 数据日期优先取 sourceFields[].date；其次才是可解析为日期的 period */
export function pickDataDate(sourceFields: MetricSourceField[], period?: string): string | undefined {
  for (const f of sourceFields) {
    if (f.date && parseDataDate(f.date)) return f.date
  }
  if (period && parseDataDate(period)) return period
  return undefined
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

/**
 * 判定一条证据/指标的数据新鲜度。
 * - 财务类（非时间敏感）：fresh，理由写明"以报告期为准"，dataAsOf = 报告期；
 * - 时间敏感类：dataAsOf 可解析 → 与阈值比较；不可解析 → unknown（绝不 fresh）。
 */
export function classifyFreshness(input: {
  sourceFields: MetricSourceField[]
  /** 证据/指标的维度（market / valuation / industry 视为时间敏感） */
  dimension?: string
  period?: string
  retrievedAt?: string
  now?: Date
}): DataFreshness {
  const { sourceFields, period, retrievedAt } = input
  const now = input.now ?? new Date()
  const timeSensitive = isTimeSensitive(sourceFields, input.dimension)
  const base = { timeSensitive, retrievedAt }

  if (!timeSensitive) {
    // 报告期数据：不按自然日判定时效
    return {
      ...base,
      status: "fresh",
      dataAsOf: period,
      reason: period
        ? `报告期数据：以报告期为准，不按自然日判定时效（最新报告期 ${period}）`
        : "报告期数据：以报告期为准，不按自然日判定时效",
    }
  }

  const threshold = sourceFields.some((f) => f.domain === "valuation") && !sourceFields.some((f) => f.domain === "prices")
    ? VALUATION_STALE_DAYS
    : MARKET_STALE_DAYS
  const dataAsOf = pickDataDate(sourceFields, period)
  if (!dataAsOf) {
    return {
      ...base,
      status: "unknown",
      reason: "无法确定该行情/估值数据的日期（缺少可解析的 date/period 字段），当前状态无法判断",
    }
  }
  const date = parseDataDate(dataAsOf)!
  const ageDays = daysBetween(now, date)
  if (ageDays < 0) {
    return {
      ...base,
      status: "unknown",
      dataAsOf,
      ageDays,
      reason: `数据日期 ${dataAsOf} 晚于当前时间，可能存在时钟或数据异常，当前状态无法判断`,
    }
  }
  if (ageDays > threshold) {
    return {
      ...base,
      status: "stale",
      dataAsOf,
      ageDays,
      reason: `数据日期 ${dataAsOf} 距当前 ${ageDays} 天，超过 ${threshold} 天时效阈值`,
    }
  }
  return {
    ...base,
    status: "fresh",
    dataAsOf,
    ageDays,
    reason: `数据日期 ${dataAsOf}（${ageDays} 天内，阈值 ${threshold} 天）`,
  }
}

/**
 * 过期数据必须显式声明"当前状态无法由此确认"——
 * 直接拼在 statement 末尾，让它在界面与 AI 上下文里都无法被忽略。
 */
export function staleQualifier(f: DataFreshness): string {
  if (f.status !== "stale") return ""
  const age = typeof f.ageDays === "number" ? `，距当前 ${f.ageDays} 天` : ""
  return `（该数据截至 ${f.dataAsOf ?? "未知日期"}${age}，当前状态无法由该数据确认）`
}
