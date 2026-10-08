// 证据快刷（阶段 4 / P1-2 路线 A）—— 合并纯函数与受影响 claim 判定测试

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  affectedClaimIds,
  applyReorganizedDimension,
  hasStaleTimeSensitiveEvidence,
  latestTimeSensitiveDataAsOf,
  mergeRefreshedTruth,
  type RefreshResponseLike,
} from "@/lib/v5/refresh-merge"
import type { ResearchSpacePayload } from "@/components/observatory/theme"
import type { Evidence } from "@/lib/evidence/types"

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures/observatory/midea-artdirection.json"), "utf-8"),
) as ResearchSpacePayload

/** 找一条指定维度的 fact 证据（fixture 证据无 freshness，测试注入） */
function timeSensitiveEvidence(e: Evidence, dataAsOf = "2026-09-25"): Evidence {
  return {
    ...e,
    freshness: {
      status: "stale",
      dataAsOf,
      retrievedAt: "2026-10-01T08:00:00.000Z",
      timeSensitive: true,
      ageDays: 9,
      reason: "数据日期距参考时间 9 天，超过行情类 7 天阈值",
    },
  }
}

function payloadWithStale(): { payload: ResearchSpacePayload; ev: Evidence } {
  const ev = timeSensitiveEvidence(FIXTURE.evidence.find((e) => e.type === "fact")!)
  const payload: ResearchSpacePayload = {
    ...FIXTURE,
    evidence: FIXTURE.evidence.map((x) => (x.evidenceId === ev.evidenceId ? ev : x)),
  }
  return { payload, ev }
}

function refreshFor(nextEvidence: Evidence[], over?: Partial<RefreshResponseLike>): RefreshResponseLike {
  return {
    stockCode: FIXTURE.company.stockCode,
    retrievedAt: "2026-10-08T09:00:00.000Z",
    metrics: FIXTURE.metrics,
    evidence: nextEvidence,
    marketHistory: { source: "fuyao", adjustment: "forward", latestDate: "2026-10-08", points: [{ date: "2026-10-08", close: 75.5 }] },
    trend: FIXTURE.trend,
    errors: [],
    ...over,
  }
}

describe("mergeRefreshedTruth（快刷合并）", () => {
  it("timeSensitive 证据原地替换；statement 变化 → 引用它的 claim 被标记", () => {
    const { payload, ev } = payloadWithStale()
    const claims = payload.claims.filter((c) => c.evidenceIds.includes(ev.evidenceId))
    expect(claims.length).toBeGreaterThan(0)

    const next: Evidence = {
      ...ev,
      statement: "最新收盘价对应 PE 为 12.3 倍（数据截至 2026-10-08）",
      freshness: { ...ev.freshness!, dataAsOf: "2026-10-08", retrievedAt: "2026-10-08T09:00:00.000Z" },
    }
    const merged = mergeRefreshedTruth(payload, refreshFor([next]))

    expect(merged.refreshedEvidenceIds).toEqual([ev.evidenceId])
    expect(merged.updatedClaimIds.sort()).toEqual(claims.map((c) => c.claimId).sort())
    const mergedEv = merged.payload.evidence.find((e) => e.evidenceId === ev.evidenceId)!
    expect(mergedEv.statement).toContain("2026-10-08")
    expect(mergedEv.freshness?.retrievedAt).toBe("2026-10-08T09:00:00.000Z")
    expect(mergedEv.freshness?.status).toBe("stale") // 服务端判定口径原样带出，前端不自行重判
  })

  it("statement 未变化（仅 retrievedAt 更新）→ 不标记（不打扰）", () => {
    const { payload, ev } = payloadWithStale()
    const freshSameText: Evidence = {
      ...ev,
      freshness: { ...ev.freshness!, status: "fresh", dataAsOf: "2026-10-08", retrievedAt: "2026-10-08T09:00:00.000Z", ageDays: 0, reason: "当日数据" },
    }
    const merged = mergeRefreshedTruth(payload, refreshFor([freshSameText]))
    expect(merged.refreshedEvidenceIds).toEqual([ev.evidenceId])
    expect(merged.updatedClaimIds).toEqual([])
  })

  it("非 timeSensitive（报告期类）证据不参与快刷替换", () => {
    const report = FIXTURE.evidence.find((e) => e.type === "fact" && e.dimension === "growth")!
    const payload: ResearchSpacePayload = {
      ...FIXTURE,
      evidence: FIXTURE.evidence.map((x) =>
        x.evidenceId === report.evidenceId
          ? { ...report, freshness: { status: "stale", retrievedAt: "2026-10-01T08:00:00.000Z", timeSensitive: false, reason: "报告期类按报告期判定" } }
          : x,
      ),
    }
    const doctored: Evidence = { ...report, statement: "被篡改的报告期结论" }
    const merged = mergeRefreshedTruth(payload, refreshFor([doctored]))
    expect(merged.skippedEvidenceIds).toContain(report.evidenceId)
    expect(merged.refreshedEvidenceIds).not.toContain(report.evidenceId)
    expect(merged.payload.evidence.find((e) => e.evidenceId === report.evidenceId)!.statement).toBe(report.statement)
  })

  it("metrics / marketHistory / trend / errors 与证据同源替换；spaceId 不变", () => {
    const { payload, ev } = payloadWithStale()
    const metrics = [{ ...FIXTURE.metrics[0] }]
    const errors = [{ domain: "prices", message: "行情接口超时" }]
    const merged = mergeRefreshedTruth(
      payload,
      refreshFor([{ ...ev, statement: "新价格" }], { metrics, errors, trend: [] as unknown as RefreshResponseLike["trend"] }),
    )
    expect(merged.payload.metrics).toBe(metrics)
    expect(merged.payload.marketHistory?.latestDate).toBe("2026-10-08")
    expect(merged.payload.errors).toBe(errors)
    expect(merged.payload.spaceId).toBe(FIXTURE.spaceId)
  })

  it("公司不一致 → 抛错（绝不跨公司合并）", () => {
    const { payload, ev } = payloadWithStale()
    expect(() =>
      mergeRefreshedTruth(payload, refreshFor([{ ...ev }], { stockCode: "000651.SZ" })),
    ).toThrow(/不一致/)
  })

  it("合并产物证据校验不过 → 抛错（调用方不得写入 state）", () => {
    const { payload, ev } = payloadWithStale()
    // fact 证据被替换成无 metricIds 且非 risk 维度的非法形态 → fact-metric-ids violation
    const invalid: Evidence = { ...ev, dimension: "market", metricIds: [], sourceFields: [] }
    expect(() => mergeRefreshedTruth(payload, refreshFor([invalid]))).toThrow(/校验未通过/)
  })
})

describe("快刷入口条件（UI 只对确属 stale 的行情类证据提供入口）", () => {
  it("有 timeSensitive+stale 证据 → 显示入口并给出数据日期；无 → 不显示", () => {
    const { payload, ev } = payloadWithStale()
    expect(hasStaleTimeSensitiveEvidence(payload)).toBe(true)
    expect(latestTimeSensitiveDataAsOf(payload)).toBe("2026-09-25")

    const fresh = { ...payload, evidence: payload.evidence.map((x) => (x.evidenceId === ev.evidenceId ? { ...ev, freshness: { ...ev.freshness!, status: "fresh" as const } } : x)) }
    expect(hasStaleTimeSensitiveEvidence(fresh)).toBe(false)

    const reportOnly: ResearchSpacePayload = {
      ...FIXTURE,
      evidence: FIXTURE.evidence.map((x) =>
        x.evidenceId === FIXTURE.evidence[0].evidenceId
          ? { ...x, freshness: { status: "stale", retrievedAt: "2026-10-01T08:00:00.000Z", timeSensitive: false, reason: "报告期类" } }
          : x,
      ),
    }
    expect(hasStaleTimeSensitiveEvidence(reportOnly)).toBe(false)
  })
})

describe("affectedClaimIds（直接判定）", () => {
  it("retrievedAt 变化不触发；statement 变化触发；新增证据（旧集合无）不触发", () => {
    const claim = FIXTURE.claims[0]
    const oldEv = FIXTURE.evidence.find((e) => e.evidenceId === claim.evidenceIds[0])!
    const onlyRetrievedAt = { ...oldEv, freshness: { status: "fresh" as const, retrievedAt: "2026-10-08T09:00:00.000Z", timeSensitive: true, reason: "当日" } }
    expect(affectedClaimIds([claim], [oldEv], [onlyRetrievedAt])).toEqual(new Set())

    const changedText = { ...oldEv, statement: `${oldEv.statement}（新）` }
    expect(affectedClaimIds([claim], [oldEv], [changedText])).toEqual(new Set([claim.claimId]))

    const brandNew: Evidence = { ...oldEv, evidenceId: "EV_BRAND_NEW", statement: "全新证据" }
    expect(affectedClaimIds([claim], [oldEv], [brandNew])).toEqual(new Set())
  })
})

describe("applyReorganizedDimension（重新组织合并）", () => {
  it("替换维度、整体替换该维度 claims、按 ID 合并证据", () => {
    const dim = FIXTURE.dimensions[0]
    const newClaim: ResearchSpacePayload["claims"][number] = {
      claimId: `${dim.dimensionId}_C09`,
      dimensionId: dim.dimensionId,
      text: "基于最新证据重新组织的结论",
      type: "inference",
      signal: "neutral",
      evidenceIds: [dim.evidenceIds[0]],
    }
    const merged = applyReorganizedDimension(FIXTURE, {
      dimensionId: dim.dimensionId,
      dimension: { ...dim, claimIds: [newClaim.claimId] },
      claims: [newClaim],
      evidence: [FIXTURE.evidence[0]],
    })
    expect(merged.dimensions.find((d) => d.dimensionId === dim.dimensionId)!.claimIds).toEqual([newClaim.claimId])
    expect(merged.claims.filter((c) => c.dimensionId === dim.dimensionId)).toEqual([newClaim])
    expect(merged.claims.filter((c) => c.dimensionId !== dim.dimensionId).length)
      .toBe(FIXTURE.claims.filter((c) => c.dimensionId !== dim.dimensionId).length)
    expect(merged.evidence.length).toBeGreaterThanOrEqual(FIXTURE.evidence.length)
  })

  it("未知维度 → 抛错", () => {
    const dim = FIXTURE.dimensions[0]
    expect(() =>
      applyReorganizedDimension(FIXTURE, {
        dimensionId: "DIM_NOT_EXIST",
        dimension: { ...dim, dimensionId: "DIM_NOT_EXIST" },
        claims: [],
        evidence: [],
      }),
    ).toThrow(/未知维度/)
  })
})
