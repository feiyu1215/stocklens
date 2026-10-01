import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { DEMO_SCENES, DEMO_TOTAL_MS, isLastScene, sceneAt, sceneBy } from "@/lib/v5/demo"
import { createSwitchGuard } from "@/lib/v5/switch-guard"
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

describe("Guided Demo V2 场景（§26/§27/§30）", () => {
  it("6 个场景，总时长落在 28–35 秒（Task 17.1 §P2 收紧节奏后的契约）", () => {
    expect(DEMO_SCENES).toHaveLength(6)
    expect(DEMO_TOTAL_MS).toBeGreaterThanOrEqual(28000)
    expect(DEMO_TOTAL_MS).toBeLessThanOrEqual(35000)
  })

  it("§P2：单场景不短于 3 秒、不长于 7.5 秒，Scene 4（Reading+Evidence）最长", () => {
    for (const scene of DEMO_SCENES) {
      expect(scene.ms).toBeGreaterThanOrEqual(3000)
      expect(scene.ms).toBeLessThanOrEqual(7500)
    }
    const longest = DEMO_SCENES.reduce((a, b) => (b.ms > a.ms ? b : a))
    expect(longest.id).toBe("reading-evidence")
  })

  it("§P2：Scene 4 先让 Reading 稳定再进 Evidence（两次动作间隔 ≥ 3 秒）", () => {
    const scene = DEMO_SCENES.find((s) => s.id === "reading-evidence")!
    const read = scene.actions.find((a) => a.kind === "open-reading")!
    const evidence = scene.actions.find((a) => a.kind === "select-evidence")!
    expect(evidence.atMs - read.atMs).toBeGreaterThanOrEqual(3000)
  })

  it("§P2：演示入口与控制文案统一为「快速演示 / 下一步 →」，且不再承诺精确秒数", () => {
    const canvas = readFileSync(join(process.cwd(), "src/components/v5/ResearchCanvas.tsx"), "utf8")
    const overlay = readFileSync(join(process.cwd(), "src/components/v5/DemoOverlay.tsx"), "utf8")
    const demo = readFileSync(join(process.cwd(), "src/lib/v5/demo.ts"), "utf8")
    for (const src of [canvas, overlay, demo]) {
      expect(src).not.toMatch(/60s 演示|60 秒演示|观看 60 秒/)
    }
    expect(canvas).toContain("▶ 快速演示")
    expect(canvas).toContain("▶ 观看快速演示")
    expect(overlay).toContain("下一步 →")
    // 控件里不再出现 Skip（onSkip / data-demo-skip 属于属性名，不受影响）
    expect(overlay).not.toMatch(/\bSkip\b/)
  })

  it("每条字幕最多 1 标题 + 1 句话，指针在视口内", () => {
    for (const scene of DEMO_SCENES) {
      expect(scene.captions.length).toBeGreaterThan(0)
      for (const c of scene.captions) {
        expect(c.title.length).toBeGreaterThan(0)
        expect(c.text.split("。").filter(Boolean).length).toBeLessThanOrEqual(1)
      }
      expect(scene.pointer.x).toBeGreaterThan(0)
      expect(scene.pointer.x).toBeLessThan(1)
      expect(scene.pointer.y).toBeGreaterThan(0)
      expect(scene.pointer.y).toBeLessThan(1)
    }
  })

  it("同一时刻只有一个焦点动作（动作时间点不重叠）", () => {
    for (const scene of DEMO_SCENES) {
      const times = scene.actions.map((a) => a.atMs)
      const unique = new Set(times)
      expect(unique.size).toBe(times.length)
    }
  })

  it("步进被夹在范围内，不越界", () => {
    expect(sceneBy(0, -1)).toBe(0)
    expect(sceneBy(DEMO_SCENES.length - 1, 1)).toBe(DEMO_SCENES.length - 1)
    expect(isLastScene(DEMO_SCENES.length - 1)).toBe(true)
    expect(sceneAt(99).id).toBe(DEMO_SCENES[DEMO_SCENES.length - 1].id)
    expect(sceneAt(-3).id).toBe(DEMO_SCENES[0].id)
  })

  it("Demo 不包含任何会写入数据的动作（只展示入口）", () => {
    const kinds = DEMO_SCENES.flatMap((s) => s.actions.map((a) => a.kind))
    expect(kinds).not.toContain("submit-dimension")
    expect(kinds).not.toContain("send-ai")
    expect(kinds).not.toContain("switch-company")
    expect(kinds).toContain("open-add-dimension")
    expect(kinds).toContain("open-shelf")
    expect(kinds).toContain("focus-ai-typing")
  })
})

describe("公司切换过期响应守卫（§15）", () => {
  it("后发起的切换使先前的响应失效", () => {
    const guard = createSwitchGuard()
    const first = guard.begin()
    expect(guard.isCurrent(first)).toBe(true)
    const second = guard.begin()
    expect(guard.isCurrent(first)).toBe(false)
    expect(guard.isCurrent(second)).toBe(true)
  })

  it("取消会让所有在途响应失效", () => {
    const guard = createSwitchGuard()
    const inflight = guard.begin()
    guard.cancel()
    expect(guard.isCurrent(inflight)).toBe(false)
    expect(guard.isCurrent(guard.begin())).toBe(true)
  })
})
