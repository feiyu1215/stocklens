import type { DailyPrice, FinancialPeriodData, StockBasicInfo, ValuationData } from "./types"
import {
  FuyaoNotFoundError,
  type FuyaoCashFlowStatement,
  type FuyaoIncomeStatement,
  type FuyaoIndicatorsData,
  type FuyaoPriceBar,
  type FuyaoTickerSearchData,
  type FuyaoValuationData,
} from "./fuyao"

// 扶摇原始字段 → StockLens 内部模型的唯一归一化层（纯函数，无 I/O）。
// FIELD_CATALOG 是「内部字段 ← 原始字段 ← 单位」的登记簿，
// 每次新增映射必须同步登记，保证关键数字可追溯。

export const FIELD_CATALOG = [
  {
    internal: "stockName",
    raw: "tickers/search → item[].name",
    unit: "-",
    note: "仅取 asset_type=a-share 且 thscode 精确匹配的条目（避免误取同名基金）",
  },
  {
    internal: "industry",
    raw: "（扶摇当前接口无对应字段）",
    unit: "-",
    note: "取不到时为 null，禁止伪造",
  },
  {
    internal: "revenue",
    raw: "income-statements → operating_income",
    unit: "CNY 元",
    note: "quarterly 口径为年初至今累计",
  },
  {
    internal: "netProfit",
    raw: "income-statements → parent_holder_net_profit",
    unit: "CNY 元",
    note: "归母净利润；年初至今累计",
  },
  {
    internal: "operatingCashflow",
    raw: "cash-flow-statements → act_cash_flow_net",
    unit: "CNY 元",
    note: "经营活动现金流净额；年初至今累计",
  },
  {
    internal: "grossMargin",
    raw: "financials/indicators → sale_gross_margin",
    unit: "%",
    note: "仅最新报告期（官方指标接口按期查询），其余期次为 undefined",
  },
  {
    internal: "netMargin",
    raw: "financials/indicators → sale_net_interest_ratio",
    unit: "%",
    note: "销售净利率；仅最新报告期",
  },
  {
    internal: "roe",
    raw: "financials/indicators → index_weighted_avg_roe",
    unit: "%",
    note: "加权平均 ROE；仅最新报告期",
  },
  { internal: "peTtm", raw: "valuations/snapshot → pe_ttm", unit: "倍", note: "可为负（亏损公司），原样保留" },
  { internal: "pb", raw: "valuations/snapshot → pb_mrq", unit: "倍", note: "MRQ 口径市净率" },
  {
    internal: "price.close/open/high/low",
    raw: "prices/historical → close_price / open_price / high_price / low_price",
    unit: "CNY 元",
    note: "前复权（adjust=forward）；缺失 close_price 的 K 线条目被剔除",
  },
] as const

/** 毫秒时间戳 → 上海时区日期（YYYY-MM-DD）。A 股交易日以上海时间为准。 */
export function msToShanghaiDate(ms: number): string {
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10)
}

function msToIso(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null
  return new Date(ms).toISOString()
}

/** fiscal_year + fiscal_period("Q2") → 内部报告期 "2026-Q2" */
export function periodKeyOf(fiscalYear: number, fiscalPeriod: string): string {
  const q = fiscalPeriod.replace(/^Q/i, "")
  return `${fiscalYear}-Q${q}`
}

/** 内部报告期 "2026-Q2" → 指标接口 report 参数 "2026-2" */
export function periodToIndicatorReport(period: string): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(period)
  if (!m) throw new Error(`无法解析报告期：${period}（期望格式 YYYY-Qn）`)
  return `${m[1]}-${m[2]}`
}

/** 指标接口 report 参数 "2026-2" → 内部报告期 "2026-Q2" */
export function indicatorReportToPeriod(report: string): string {
  const m = /^(\d{4})-([1-4])$/.exec(report)
  if (!m) throw new Error(`无法解析指标报告期：${report}（期望格式 YYYY-n）`)
  return `${m[1]}-Q${m[2]}`
}

function periodSortKey(period: string): number {
  const m = /^(\d{4})-Q([1-4])$/.exec(period)
  if (!m) return 0
  return Number(m[1]) * 10 + Number(m[2])
}

// ---------- 基础信息 ----------

export function normalizeBasicInfo(data: FuyaoTickerSearchData, stockCode: string): StockBasicInfo {
  const hit = (data.item ?? []).find(
    (it) =>
      it.asset_type === "a-share" && it.thscode.toUpperCase() === stockCode.toUpperCase(),
  )
  if (!hit) {
    throw new FuyaoNotFoundError(`未在扶摇标的检索中找到 A 股 ${stockCode}（可能不存在、已退市或非 A 股）`)
  }
  return {
    stockCode: hit.thscode,
    stockName: hit.name,
    industry: null, // 扶摇未返回行业字段，如实为 null
    source: "fuyao",
    updatedAt: msToIso(data.timestamp),
  }
}

// ---------- 财务数据 ----------

function pickIndicator(abilities: FuyaoIndicatorsData["abilities"], indexId: string): number | null {
  for (const ability of abilities) {
    for (const entry of ability.indicators) {
      if (entry.index_id !== indexId) continue
      if (entry.value === null || entry.value === "") return null
      const n = Number(entry.value)
      return Number.isFinite(n) ? n : null
    }
  }
  return null
}

export function zipFinancialPeriods(
  stockCode: string,
  income: FuyaoIncomeStatement[],
  cashflow: FuyaoCashFlowStatement[],
  latestIndicators: FuyaoIndicatorsData | null,
  fetchedAt: string | null,
): FinancialPeriodData[] {
  const cfByKey = new Map(
    cashflow.map((c) => [periodKeyOf(c.fiscal_year, c.fiscal_period), c] as const),
  )
  const latestIndicatorPeriod = latestIndicators
    ? indicatorReportToPeriod(latestIndicators.report)
    : null

  const periods = new Set<string>()
  for (const row of income) periods.add(periodKeyOf(row.fiscal_year, row.fiscal_period))
  for (const key of cfByKey.keys()) periods.add(key)

  return [...periods]
    .sort((a, b) => periodSortKey(b) - periodSortKey(a))
    .map((period): FinancialPeriodData => {
      const inc = income.find((r) => periodKeyOf(r.fiscal_year, r.fiscal_period) === period)
      const cf = cfByKey.get(period)
      const isLatest = period === latestIndicatorPeriod
      return {
        stockCode,
        period,
        // 字段缺失时保留 null；真实 0 必须原样保留，绝不用 0 兜底
        revenue: inc ? inc.operating_income : null,
        netProfit: inc ? inc.parent_holder_net_profit : null,
        operatingCashflow: cf ? cf.act_cash_flow_net : null,
        // 官方指标仅按期查询最新一期：最新期取值（可为 null），其余期次 undefined（未请求）
        grossMargin: isLatest && latestIndicators ? pickIndicator(latestIndicators.abilities, "sale_gross_margin") : undefined,
        netMargin: isLatest && latestIndicators ? pickIndicator(latestIndicators.abilities, "sale_net_interest_ratio") : undefined,
        roe: isLatest && latestIndicators ? pickIndicator(latestIndicators.abilities, "index_weighted_avg_roe") : undefined,
        source: "fuyao",
        updatedAt: fetchedAt,
      }
    })
}

// ---------- 估值 ----------

export function normalizeValuation(data: FuyaoValuationData, stockCode: string): ValuationData {
  const hit = (data.item ?? []).find(
    (it) => it.thscode.toUpperCase() === stockCode.toUpperCase(),
  )
  if (!hit) {
    throw new FuyaoNotFoundError(`估值快照未包含 ${stockCode} 的数据`)
  }
  return {
    stockCode: hit.thscode,
    date: msToShanghaiDate(data.timestamp),
    peTtm: hit.pe_ttm, // 可为负数（亏损），原样保留
    pb: hit.pb_mrq,
    source: "fuyao",
    updatedAt: msToIso(data.timestamp),
  }
}

// ---------- 历史行情 ----------

export function normalizePrices(
  data: { item: FuyaoPriceBar[] | null },
  stockCode: string,
): DailyPrice[] {
  return (data.item ?? [])
    .filter(
      (bar): bar is FuyaoPriceBar & { close_price: number } =>
        typeof bar.date_ms === "number" && typeof bar.close_price === "number",
    )
    .map(
      (bar): DailyPrice => ({
        stockCode,
        date: msToShanghaiDate(bar.date_ms),
        open: bar.open_price,
        high: bar.high_price,
        low: bar.low_price,
        close: bar.close_price,
        source: "fuyao",
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
}
