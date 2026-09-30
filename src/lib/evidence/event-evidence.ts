import type { EventContext, StockEvent } from "@/lib/data/events"
import { NEWS_DISCLOSURE_BOUNDARY } from "@/lib/data/events"
import type { Evidence } from "./types"

// Event → Evidence（Task 10 Part B §30–33）：
// 事件证据进入 dimension = "risk"（不扩大已有 enum）；market_anomaly / attention /
// corporate_action 一律 signal = neutral（关注度上升不等于利好，分红不自动为 positive）。
// 「接口成功但无记录」→ UNKNOWN（绝不能写成「今日无事件」）；
// 新闻/公告覆盖边界恒定以 UNKNOWN 表达（Event Lite ≠ 全量事件覆盖）。

const EVENT_CONFIDENCE_REASON =
  "来自扶摇特色数据接口的真实记录（含接口原文与数据日期），非分析推断"

const DIMENSION = "risk" as const

function eventToFact(e: StockEvent): Evidence {
  return {
    evidenceId: `EV_FACT_RISK_${e.eventId.replace(/^EVT_/, "")}`,
    dimension: DIMENSION,
    title: e.title,
    statement: e.statement,
    type: "fact",
    signal: "neutral",
    confidence: "high",
    metricIds: [],
    basedOn: [],
    period: e.eventDate,
    sourceFields: [
      { source: "fuyao", domain: "prices", field: e.sourceEndpoint, date: e.eventDate },
    ],
    verifyStatus: "verified",
    confidenceReason: EVENT_CONFIDENCE_REASON,
  }
}

export function buildEventEvidence(context: EventContext | null): Evidence[] {
  const out: Evidence[] = []

  if (context) {
    for (const e of context.events) {
      if (e.verifyStatus !== "verified") continue
      out.push(eventToFact(e))
    }

    // 异动空态（§22/§32）：接口成功但无匹配记录 → UNKNOWN，明确「不能据此确认不存在其他事件」
    if (context.coverage.anomaly === "no_records") {
      out.push({
        evidenceId: "EV_UNKNOWN_RISK_ANOMALY_COVERAGE",
        dimension: DIMENSION,
        title: "异动数据未返回匹配记录",
        statement:
          "当前异动数据源未返回该股票的匹配记录，这不能用于确认今日不存在其他市场事件。",
        type: "unknown",
        signal: "unknown",
        confidence: "low",
        metricIds: [],
        basedOn: [],
        sourceFields: [],
        verifyStatus: "unverified",
        confidenceReason: "数据能力边界说明（接口成功但无匹配记录）",
        unavailableReason: "anomaly endpoint returned no matching records for this stock",
      })
    }

    // 异动接口失败：单独表达（与「无记录」区分）
    if (context.coverage.anomaly === "failed") {
      out.push({
        evidenceId: "EV_UNKNOWN_RISK_ANOMALY_UNAVAILABLE",
        dimension: DIMENSION,
        title: "异动数据当前不可用",
        statement: "异动数据接口本次调用未成功，因此无法判断近期是否存在个股异动记录。",
        type: "unknown",
        signal: "unknown",
        confidence: "low",
        metricIds: [],
        basedOn: [],
        sourceFields: [],
        verifyStatus: "unverified",
        confidenceReason: "数据能力边界说明（接口调用失败）",
        unavailableReason: "anomaly endpoint call failed",
      })
    }

    if (context.coverage.attention === "no_records") {
      out.push({
        evidenceId: "EV_UNKNOWN_RISK_ATTENTION_COVERAGE",
        dimension: DIMENSION,
        title: "热榜排名数据未返回记录",
        statement: "热榜排名接口在查询窗口内未返回该股票的排名点位，因此无法描述其市场关注度变化。",
        type: "unknown",
        signal: "unknown",
        confidence: "low",
        metricIds: [],
        basedOn: [],
        sourceFields: [],
        verifyStatus: "unverified",
        confidenceReason: "数据能力边界说明（接口成功但无记录）",
        unavailableReason: "hot rank trend returned no points in window",
      })
    }
  }

  // 新闻/公告覆盖边界（§33/§49）：恒定保留，即使三个事件域全部可用
  out.push({
    evidenceId: "EV_UNKNOWN_RISK_NEWS_DISCLOSURE",
    dimension: DIMENSION,
    title: "公告与新闻文本覆盖边界",
    statement: NEWS_DISCLOSURE_BOUNDARY,
    type: "unknown",
    signal: "unknown",
    confidence: "low",
    metricIds: [],
    basedOn: [],
    sourceFields: [],
    verifyStatus: "unverified",
    confidenceReason: "数据能力边界说明（新闻/公告文本源未接入）",
    unavailableReason: "news / disclosure text sources not connected",
  })

  return out
}
