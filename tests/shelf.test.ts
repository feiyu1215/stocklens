import { describe, expect, it } from "vitest"

import { DEMO_STEPS, DEMO_TOTAL_MS, isLastStep, stepAt, stepBy } from "@/lib/v5/demo"
import {
  RECENT_LIMIT,
  formatLastResearch,
  isSaved,
  loadCanvas,
  loadSaved,
  pushRecent,
  toggleSaved,
  touchSaved,
  type SavedCompany,
} from "@/lib/v5/shelf"

const midea = { stockCode: "000333.SZ", name: "美的集团", industry: "白色家电" }
const cmb = { stockCode: "600036.SH", name: "招商银行" }
const maotai = { stockCode: "600519.SH", name: "贵州茅台" }

describe("Research Shelf（§B7–§B10）", () => {
  it("保存是可逆的：一次收藏，再次取消", () => {
    const once = toggleSaved([], midea, 1000)
    expect(once).toHaveLength(1)
    expect(once[0].savedAt).toBe(1000)
    expect(isSaved(once, midea.stockCode)).toBe(true)

    const twice = toggleSaved(once, midea, 2000)
    expect(twice).toHaveLength(0)
    expect(isSaved(twice, midea.stockCode)).toBe(false)
  })

  it("最近访问去重并置顶，超过上限淘汰最旧的一条", () => {
    let list: SavedCompany[] = []
    for (let i = 0; i < RECENT_LIMIT; i++) {
      list = pushRecent(list, { stockCode: `00000${i}.SZ`, name: `公司${i}` }, 1000 + i)
    }
    expect(list).toHaveLength(RECENT_LIMIT)

    // 重新访问最早的一条 → 置顶，且不新增条目
    list = pushRecent(list, { stockCode: "000000.SZ", name: "公司0" }, 9999)
    expect(list).toHaveLength(RECENT_LIMIT)
    expect(list[0].stockCode).toBe("000000.SZ")
    expect(list[0].lastVisitedAt).toBe(9999)

    // 新公司进入 → 挤掉当前最旧的一条
    list = pushRecent(list, maotai, 10000)
    expect(list).toHaveLength(RECENT_LIMIT)
    expect(list[0].stockCode).toBe(maotai.stockCode)
    expect(list.some((c) => c.stockCode === "000001.SZ")).toBe(false)
  })

  it("收藏列表不受 recent 淘汰影响（两份数据独立）", () => {
    const saved = toggleSaved([], midea, 1)
    let recent: SavedCompany[] = []
    for (let i = 0; i < RECENT_LIMIT + 3; i++) recent = pushRecent(recent, { stockCode: `9${i}.SZ`, name: `x${i}` }, i)
    expect(isSaved(saved, midea.stockCode)).toBe(true)
    expect(recent).toHaveLength(RECENT_LIMIT)
  })

  it("touchSaved 只改 lastVisitedAt", () => {
    const list = toggleSaved(toggleSaved([], midea, 1), cmb, 2)
    const touched = touchSaved(list, cmb.stockCode, 500)
    const found = touched.find((c) => c.stockCode === cmb.stockCode)
    expect(found?.lastVisitedAt).toBe(500)
    expect(found?.savedAt).toBe(2)
    expect(touched.find((c) => c.stockCode === midea.stockCode)?.lastVisitedAt).toBe(1)
  })

  it("Last research 只表达时间，不暗示刚从接口重新拉取（§B16）", () => {
    expect(formatLastResearch(null)).toBeNull()
    expect(formatLastResearch(undefined)).toBeNull()
    const ts = new Date(2026, 8, 30, 21, 32).getTime()
    expect(formatLastResearch(ts)).toBe("Last research · 21:32")
  })

  it("无存储环境时读取退化为空，不抛错", () => {
    expect(loadSaved()).toEqual([])
    expect(loadCanvas("000333.SZ")).toBeNull()
  })
})

describe("Guided Demo 步骤（§C25/§C26/§C30）", () => {
  it("总时长落在 55–75 秒区间（不为了 60 秒卡死）", () => {
    expect(DEMO_TOTAL_MS).toBeGreaterThanOrEqual(55000)
    expect(DEMO_TOTAL_MS).toBeLessThanOrEqual(75000)
    expect(DEMO_STEPS).toHaveLength(8)
  })

  it("每一步只有 1 个标题 + 1 句话，且指针在视口内", () => {
    for (const step of DEMO_STEPS) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.caption.length).toBeGreaterThan(0)
      expect(step.caption.split("。").filter(Boolean).length).toBeLessThanOrEqual(2)
      expect(step.pointer.x).toBeGreaterThan(0)
      expect(step.pointer.x).toBeLessThan(1)
      expect(step.pointer.y).toBeGreaterThan(0)
      expect(step.pointer.y).toBeLessThan(1)
    }
  })

  it("步进被夹在范围内，不越界", () => {
    expect(stepBy(0, -1)).toBe(0)
    expect(stepBy(DEMO_STEPS.length - 1, 1)).toBe(DEMO_STEPS.length - 1)
    expect(isLastStep(DEMO_STEPS.length - 1)).toBe(true)
    expect(stepAt(99).id).toBe(DEMO_STEPS[DEMO_STEPS.length - 1].id)
    expect(stepAt(-3).id).toBe(DEMO_STEPS[0].id)
  })

  it("Demo 不包含任何会写入数据的动作（只展示入口）", () => {
    const kinds = DEMO_STEPS.map((s) => s.action)
    expect(kinds).not.toContain("submit-dimension")
    expect(kinds).not.toContain("send-ai")
    expect(kinds).not.toContain("switch-company")
    expect(kinds).toContain("open-add-dimension")
    expect(kinds).toContain("open-shelf")
  })
})
