import "server-only"

// 证据快刷（阶段 4 / P1-2，路线 A）—— 数据层只重算，模型不重跑。
//
// 口径（用户拍板 2026-10-08）：
// - 刷新只更新 Truth Layer（metrics / evidence / marketHistory / trend），同源重算；
// - retrievedAt 必须一并更新（loadTruth 内部以当前时间生成），否则刷完仍判定 stale；
// - 引用旧数据的结论不重写：受影响 claim 由前端打上「证据已更新，该结论为更新前生成」的
//   可见标记，并提供「重新组织该维度」入口（单维度 composer 重跑，见 reorganize-dimension.ts）。
// - 受影响判定：claim 引用的证据中存在 statement 变化（数字/限定语变化必然反映在 statement
//   原文里）。statement 不变 → 结论文本仍准确 → 不标记，不打扰。

import type { Evidence } from "@/lib/evidence/types"
import type { MetricResult } from "@/lib/metrics/types"
import { loadTruthForResearch, marketHistoryFromTruth } from "./init-space"

export interface RefreshResponse {
  stockCode: string
  /** 本次刷新取回数据的时间（所有证据 freshness.retrievedAt 的新值基准） */
  retrievedAt: string
  metrics: MetricResult[]
  evidence: Evidence[]
  marketHistory: ReturnType<typeof marketHistoryFromTruth>
  trend: ReturnType<typeof import("@/lib/metrics/trend").buildFinancialTrend>
  errors: { domain: string; message: string }[]
}

export async function refreshEvidence(input: { stockCode: string }): Promise<RefreshResponse> {
  const { truth } = await loadTruthForResearch(input.stockCode)
  const retrievedTimes = truth.evidence
    .map((e) => e.freshness?.retrievedAt)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .sort()
  return {
    stockCode: input.stockCode,
    retrievedAt: retrievedTimes[retrievedTimes.length - 1] ?? new Date().toISOString(),
    metrics: truth.metrics.metrics,
    evidence: truth.evidence,
    marketHistory: marketHistoryFromTruth(truth),
    trend: truth.trend,
    errors: truth.dataResp.errors.map((e) => ({ domain: e.domain, message: e.message })),
  }
}
