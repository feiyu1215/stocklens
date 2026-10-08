// 研究笔记导出（打印版）—— buildNotesDocument 纯函数测试（阶段 3 / P2-2）
//
// 核心纪律：纸面文档必须强制带齐 5 项必带元素，缺一项宁可不做导出：
//   ① 研究级 retrievedAt 与行情 dataAsOf  ② 每条证据 freshness + statement 原文（stale 限定语原样）
//   ③ UNKNOWN 分区恒导出（保留 unavailableReason）  ④ spaceId + 导出时间  ⑤ 免责声明

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { buildNotesDocument, NOTES_DISCLAIMER } from "@/lib/v5/notes-export"
import type { ResearchSpacePayload } from "@/components/observatory/theme"
import type { Evidence } from "@/lib/evidence/types"

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures/observatory/midea-artdirection.json"), "utf-8"),
) as ResearchSpacePayload

const EXPORTED_AT = "2026-10-08T09:00:00.000Z"

function evidenceById(id: string): Evidence {
  const e = FIXTURE.evidence.find((x) => x.evidenceId === id)
  if (!e) throw new Error(`fixture evidence not found: ${id}`)
  return e
}

/** 注入 stale freshness 的证据（statement 末尾按规范带限定语原文） */
function withStale(e: Evidence, dataAsOf: string): Evidence {
  return {
    ...e,
    statement: `${e.statement}当前状态无法由该数据确认`,
    freshness: {
      status: "stale",
      dataAsOf,
      retrievedAt: "2026-10-08T08:30:00.000Z",
      timeSensitive: true,
      ageDays: 9,
      reason: "数据日期距参考时间 9 天，超过行情类 7 天阈值",
    },
  }
}

describe("buildNotesDocument（研究笔记导出）", () => {
  it("必带元素 ④⑤：spaceId、导出时间、免责声明恒存在", () => {
    const doc = buildNotesDocument(FIXTURE, EXPORTED_AT)
    expect(doc.meta.spaceId).toBe(FIXTURE.spaceId)
    expect(doc.meta.exportedAt).toBe(EXPORTED_AT)
    expect(doc.meta.companyName).toBe(FIXTURE.company.stockName)
    expect(doc.meta.stockCode).toBe(FIXTURE.company.stockCode)
    expect(doc.disclaimer).toBe(NOTES_DISCLAIMER)
    expect(doc.disclaimer).toContain("不构成投资建议")
  })

  it("必带元素 ①：retrievedAt 取证据中最晚取回时间；marketDataAsOf 取行情最新日期", () => {
    const base = buildNotesDocument(FIXTURE, EXPORTED_AT)
    // fixture 证据没有 freshness.retrievedAt → 如实为 null（不编造）
    expect(base.meta.retrievedAt).toBeNull()
    expect(base.meta.marketDataAsOf).toBe(FIXTURE.marketHistory?.latestDate ?? null)

    // 注入两条不同 retrievedAt 的 stale 证据 → 取最晚
    const evA = evidenceById(FIXTURE.dimensions[0].evidenceIds[0])
    const injected: ResearchSpacePayload = {
      ...FIXTURE,
      evidence: [
        withStale(evA, "2026-09-25"),
        withStale(evidenceById(FIXTURE.dimensions[1].evidenceIds[0]), "2026-09-28"),
      ],
    }
    injected.evidence[1] = {
      ...injected.evidence[1],
      freshness: { ...injected.evidence[1].freshness!, retrievedAt: "2026-10-08T09:10:00.000Z" },
    }
    const doc = buildNotesDocument(injected, EXPORTED_AT)
    expect(doc.meta.retrievedAt).toBe("2026-10-08T09:10:00.000Z")
  })

  it("必带元素 ②：stale 证据 statement 原样带出（限定语不截断），freshness 三元组齐全", () => {
    const ev = evidenceById(FIXTURE.dimensions[0].evidenceIds[0])
    const payload: ResearchSpacePayload = { ...FIXTURE, evidence: [withStale(ev, "2026-09-25")] }
    const doc = buildNotesDocument(payload, EXPORTED_AT)

    const all = doc.sections.flatMap((s) => s.evidence)
    const line = all.find((x) => x.evidenceId === ev.evidenceId)
    expect(line).toBeDefined()
    expect(line!.statement).toBe(`${ev.statement}当前状态无法由该数据确认`)
    expect(line!.statement.endsWith("当前状态无法由该数据确认")).toBe(true)
    expect(line!.freshnessStatus).toBe("stale")
    expect(line!.freshnessDataAsOf).toBe("2026-09-25")
    expect(line!.freshnessReason).toContain("7 天阈值")
  })

  it("必带元素 ③：UNKNOWN 分区恒导出且保留 unavailableReason；UNKNOWN 不重复出现在维度分区", () => {
    const doc = buildNotesDocument(FIXTURE, EXPORTED_AT)
    const fixtureUnknowns = FIXTURE.evidence.filter((e) => e.type === "unknown")
    expect(fixtureUnknowns.length).toBeGreaterThan(0)
    expect(doc.unknowns.length).toBe(fixtureUnknowns.length)

    for (const u of doc.unknowns) {
      const src = fixtureUnknowns.find((e) => e.evidenceId === u.evidenceId)!
      expect(u.unavailableReason).toBe(src.unavailableReason)
      expect(u.statement).toBe(src.statement)
    }
    // UNKNOWN 不进任何维度分区（不重复导出）
    const sectionEvidence = doc.sections.flatMap((s) => s.evidence)
    expect(sectionEvidence.some((e) => e.type === "unknown")).toBe(false)
  })

  it("证据按维度 evidenceIds 反查归属（Evidence.dimension 枚举与动态 dimensionId 对不上）", () => {
    const doc = buildNotesDocument(FIXTURE, EXPORTED_AT)
    // 共享证据只归属首次引用它的维度（不重复导出）
    const claimed = new Set<string>()
    for (const section of doc.sections) {
      const dim = FIXTURE.dimensions.find((d) => d.dimensionId === section.dimensionId)!
      const expected = dim.evidenceIds.filter((id) => {
        if (claimed.has(id)) return false
        const e = FIXTURE.evidence.find((x) => x.evidenceId === id)
        if (!e || e.type === "unknown") return false
        claimed.add(id)
        return true
      })
      expect(section.evidence.map((x) => x.evidenceId)).toEqual(expected)
      expect(section.label).toBe(dim.label)
      expect(section.researchQuestion).toBe(dim.researchQuestion)
    }
  })

  it("未被任何维度引用的证据不静默丢弃（进 unassigned）", () => {
    const orphan = evidenceById(FIXTURE.dimensions[0].evidenceIds[0])
    const payload: ResearchSpacePayload = {
      ...FIXTURE,
      dimensions: FIXTURE.dimensions.map((d) => ({
        ...d,
        evidenceIds: d.evidenceIds.filter((id) => id !== orphan.evidenceId),
      })),
    }
    const doc = buildNotesDocument(payload, EXPORTED_AT)
    expect(doc.unassigned?.map((e) => e.evidenceId)).toContain(orphan.evidenceId)
  })

  it("AI 部分失败与数据错误如实带出，不做修饰", () => {
    const payload: ResearchSpacePayload = {
      ...FIXTURE,
      ai: { status: "partial_failure", issues: ["composer 超时重试 1 次后成功"] },
      errors: [{ domain: "prices", message: "行情接口超时" }],
    }
    const doc = buildNotesDocument(payload, EXPORTED_AT)
    expect(doc.meta.aiStatus).toBe("partial_failure")
    expect(doc.meta.aiIssues).toContain("composer 超时重试 1 次后成功")
    expect(doc.meta.errors).toEqual([{ domain: "prices", message: "行情接口超时" }])
  })

  it("指标附注：值 + 单位 + 报告期 + 计算方式 + 来源字段；unavailable 指标带原因", () => {
    const doc = buildNotesDocument(FIXTURE, EXPORTED_AT)
    const line = doc.sections.flatMap((s) => s.evidence).find((e) => e.metrics.length > 0)
    expect(line).toBeDefined()
    for (const m of line!.metrics) {
      const src = FIXTURE.metrics.find((x) => x.metricId === m.metricId)!
      expect(m.name).toBe(src.name)
      expect(m.calculationMethod).toBe(src.calculationMethod)
      if (src.value === null || src.value === undefined) {
        expect(m.valueLabel).toBe("—")
        expect(m.unavailableReason).toBe(src.unavailableReason)
      } else {
        expect(m.valueLabel).not.toBe("—")
      }
      expect(m.sourceFields.length).toBe(src.sourceFields.length)
    }
  })

  it("无 claims 也无证据的维度不导出空分区；入口问题随 meta 带出", () => {
    const doc = buildNotesDocument(FIXTURE, EXPORTED_AT)
    for (const section of doc.sections) {
      expect(section.claims.length + section.evidence.length).toBeGreaterThan(0)
    }
    if (FIXTURE.entryQuestion) {
      expect(doc.meta.entryQuestion).toBe(FIXTURE.entryQuestion)
    }
  })
})
