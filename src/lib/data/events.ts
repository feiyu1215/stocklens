import "server-only"

import { fuyaoGet, FuyaoApiError } from "./fuyao"
import { msToShanghaiDate } from "./normalize"

// Event / Risk Lite（Task 10 Part B）：
// 只回答「最近是否出现值得注意的市场事件或市场关注变化」，不做新闻聚类/公告解析/事件预测。
//
// 数据能力（2026-09-30 Spike 实测）：
//   - 异动原因 anomaly-analysis-stock：code=0 且 item=[]（000333.SZ 当日无匹配记录）
//     → 必须按「接口未返回匹配记录」表达，绝不能写成「今日无事件」（§22）
//   - 热榜排名走势 hot-stock-rank-trend：真实序列（start_date/end_date，yyyy-MM-dd）
//   - 复权因子事件流 adjustment-factors：真实分红记录（ex_date_ms / dividend_per_share / per_share_bonus）
//   - 新闻/公告文本源：仍未接入 → 恒定 UNKNOWN 边界（§33）

export type EventType = "market_anomaly" | "attention" | "corporate_action"
export type EventVerifyStatus = "verified" | "unavailable"

export interface StockEvent {
  eventId: string
  stockCode: string
  type: EventType
  title: string
  statement: string
  eventDate?: string
  observedAt?: string
  source: "fuyao"
  sourceEndpoint: string
  verifyStatus: EventVerifyStatus
  /** 仅用于 debug / trace，不下发 UI */
  rawFields?: Record<string, unknown>
}

export interface EventContext {
  events: StockEvent[]
  /** 各数据域的真实状态（用于区分「无记录」与「接口失败」） */
  coverage: {
    anomaly: "records" | "no_records" | "failed"
    attention: "records" | "no_records" | "failed"
    corporateAction: "records" | "no_records" | "failed"
    newsDisclosure: "unavailable"
  }
  errors: { domain: string; message: string }[]
}

// ---------- 原始响应类型 ----------

interface FuyaoAnomalyItem {
  thscode: string
  stock_name: string | null
  analysis_content: string | null
  keyword_list: string[] | null
  tag_name: string | null
}

interface FuyaoAnomalyData {
  timestamp: number
  item: FuyaoAnomalyItem[] | null
}

interface FuyaoHotRankItem {
  thscode: string
  date: string
  date_ms: number
  rank: number
}

interface FuyaoHotRankData {
  timestamp: number
  item: FuyaoHotRankItem[] | null
}

interface FuyaoAdjustmentFactorItem {
  ticker: string
  ex_date_ms: number
  dividend_per_share: number | null
  per_share_bonus: number | null
}

interface FuyaoAdjustmentFactorsData {
  thscode: string
  ticker: string
  item: FuyaoAdjustmentFactorItem[] | null
}

// ---------- 抓取 ----------

async function fetchAnomaly(stockCode: string): Promise<StockEvent[]> {
  const data = await fuyaoGet<FuyaoAnomalyData>(
    "/api/a-share/special-data/anomaly-analysis-stock",
    { thscodes: stockCode },
  )
  const items = data.item ?? []
  const observedAt = msToShanghaiDate(data.timestamp)
  return items.map((item, index): StockEvent => {
    const tag = item.tag_name ?? "异动"
    const keywords = item.keyword_list ?? []
    return {
      eventId: `EVT_ANOMALY_${observedAt.replace(/-/g, "")}_${String(index + 1).padStart(3, "0")}`,
      stockCode,
      type: "market_anomaly",
      title: `个股异动：${tag}`,
      // 忠实于数据源：只转述接口文本，不添加因果
      statement: `同花顺异动数据记录 ${observedAt} 该股出现「${tag}」异动；接口给出的解读文本为：${item.analysis_content ?? "（无解读文本）"}${
        keywords.length > 0 ? `（关键词：${keywords.join("、")}）` : ""
      }。`,
      eventDate: observedAt,
      observedAt,
      source: "fuyao",
      sourceEndpoint: "/api/a-share/special-data/anomaly-analysis-stock",
      verifyStatus: "verified",
      rawFields: { tag_name: item.tag_name, keyword_list: keywords },
    }
  })
}

async function fetchAttention(stockCode: string, days = 30): Promise<StockEvent[]> {
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 3_600_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const data = await fuyaoGet<FuyaoHotRankData>(
    "/api/a-share/special-data/hot-stock-rank-trend",
    { thscode: stockCode, start_date: fmt(start), end_date: fmt(end) },
  )
  const series = (data.item ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
  if (series.length === 0) return []

  const earliest = series[0]
  const latest = series[series.length - 1]
  const best = series.reduce((acc, cur) => (cur.rank < acc.rank ? cur : acc), series[0])
  const improvement = earliest.rank - latest.rank // 数字越小排名越靠前；>0 表示关注度上升

  const statement =
    improvement >= 0
      ? `最近 ${days} 天热榜排名由 ${earliest.date} 的约第 ${earliest.rank} 名上升至 ${latest.date} 的约第 ${latest.rank} 名（期间最好约第 ${best.rank} 名）。`
      : `最近 ${days} 天热榜排名由 ${earliest.date} 的约第 ${earliest.rank} 名变为 ${latest.date} 的约第 ${latest.rank} 名（期间最好约第 ${best.rank} 名）。`

  return [
    {
      eventId: `EVT_ATTENTION_${latest.date.replace(/-/g, "")}`,
      stockCode,
      type: "attention",
      title: "市场关注度（热榜排名）变化",
      statement,
      eventDate: latest.date,
      observedAt: latest.date,
      source: "fuyao",
      sourceEndpoint: "/api/a-share/special-data/hot-stock-rank-trend",
      verifyStatus: "verified",
      rawFields: {
        earliestRank: earliest.rank,
        latestRank: latest.rank,
        bestRank: best.rank,
        sampleDays: series.length,
        improvement,
      },
    },
  ]
}

async function fetchCorporateActions(stockCode: string, months = 12): Promise<StockEvent[]> {
  const end = new Date()
  const start = new Date(end.getTime() - months * 30 * 24 * 3_600_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const data = await fuyaoGet<FuyaoAdjustmentFactorsData>(
    "/api/a-share/corporate-actions/adjustment-factors",
    { thscode: stockCode, from: fmt(start), to: fmt(end) },
  )
  return (data.item ?? []).map((item): StockEvent => {
    const exDate = msToShanghaiDate(item.ex_date_ms)
    const parts: string[] = []
    if (typeof item.dividend_per_share === "number" && item.dividend_per_share > 0) {
      parts.push(`每股现金分红 ${item.dividend_per_share} 元`)
    }
    if (typeof item.per_share_bonus === "number" && item.per_share_bonus > 0) {
      parts.push(`每股送股 ${item.per_share_bonus} 股`)
    }
    const detail = parts.length > 0 ? parts.join("、") : "接口未提供分红/送股明细"
    const kind = parts.some((p) => p.includes("现金")) ? "现金分红" : "股本变动"
    return {
      eventId: `EVT_CORP_ACTION_${exDate.replace(/-/g, "")}_${kind === "现金分红" ? "DIVIDEND" : "BONUS"}`,
      stockCode,
      type: "corporate_action",
      title: `公司行为：${kind}（除权除息日 ${exDate}）`,
      statement: `接口记录公司在 ${exDate} 发生${kind}事件：${detail}。`,
      eventDate: exDate,
      observedAt: exDate,
      source: "fuyao",
      sourceEndpoint: "/api/a-share/corporate-actions/adjustment-factors",
      verifyStatus: "verified",
      rawFields: {
        dividend_per_share: item.dividend_per_share,
        per_share_bonus: item.per_share_bonus,
      },
    }
  })
}

/**
 * 汇总事件上下文：三个数据域独立容错（partial failure 原则）。
 * 「接口成功但无记录」与「接口失败」严格区分（coverage 字段）。
 */
export async function gatherEventContext(stockCode: string): Promise<EventContext> {
  const errors: EventContext["errors"] = []
  const [anomalyR, attentionR, corpR] = await Promise.allSettled([
    fetchAnomaly(stockCode),
    fetchAttention(stockCode),
    fetchCorporateActions(stockCode),
  ])

  const events: StockEvent[] = []
  const coverage: EventContext["coverage"] = {
    anomaly: "failed",
    attention: "failed",
    corporateAction: "failed",
    newsDisclosure: "unavailable",
  }

  const ingest = (
    result: PromiseSettledResult<StockEvent[]>,
    domain: "anomaly" | "attention" | "corporateAction",
    label: string,
  ) => {
    if (result.status === "fulfilled") {
      events.push(...result.value)
      coverage[domain] = result.value.length > 0 ? "records" : "no_records"
    } else {
      const reason = result.reason
      errors.push({
        domain,
        message: reason instanceof FuyaoApiError ? `${reason.code}: ${reason.message}` : String(reason),
      })
      coverage[domain] = "failed"
    }
    void label
  }
  ingest(anomalyR, "anomaly", "异动")
  ingest(attentionR, "attention", "热榜")
  ingest(corpR, "corporateAction", "公司行为")

  // 确定性排序：按事件日期倒序，同日按 eventId（稳定）
  events.sort((a, b) => {
    const byDate = (b.eventDate ?? "").localeCompare(a.eventDate ?? "")
    return byDate !== 0 ? byDate : a.eventId.localeCompare(b.eventId)
  })

  return { events, coverage, errors }
}

export const NEWS_DISCLOSURE_BOUNDARY =
  "当前版本尚未接入可靠公告与新闻文本源，因此无法完整判断近期公司层面的所有重要事件。"
