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
  mergeLibraryCompanies,
  loadSaved,
  pushRecent,
  reconcileCanvasSnapshot,
  toggleSaved,
  touchSaved,
  upsertLibrary,
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

  it("研究库保留全部访问记录，且重访时更新摘要并置顶", () => {
    let library: SavedCompany[] = []
    for (let i = 0; i < RECENT_LIMIT + 4; i++) {
      library = upsertLibrary(library, { stockCode: `8${i}.SZ`, name: `研究${i}` }, i + 1)
    }
    expect(library).toHaveLength(RECENT_LIMIT + 4)

    library = upsertLibrary(
      library,
      { stockCode: "80.SZ", name: "研究0", dimensionCount: 8, evidenceCount: 36, aiStatus: "success" },
      999,
    )
    expect(library[0]).toMatchObject({ stockCode: "80.SZ", dimensionCount: 8, evidenceCount: 36, lastVisitedAt: 999 })
  })

  it("旧版 SAVED / RECENT 迁移时去重，保留最新访问与已有研究摘要", () => {
    const saved = [{ ...midea, savedAt: 1, lastVisitedAt: 10, dimensionCount: 6 }]
    const recent = [{ ...midea, savedAt: 8, lastVisitedAt: 20, evidenceCount: 42 }]
    const merged = mergeLibraryCompanies(saved, recent)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ savedAt: 1, lastVisitedAt: 20, dimensionCount: 6, evidenceCount: 42 })
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

  it("无存储环境时读取退化为空，不抛错", async () => {
    await expect(loadSaved()).resolves.toEqual([])
    await expect(loadCanvas("000333.SZ")).resolves.toBeNull()
  })

  it("刷新恢复前过滤已经不存在的维度引用", () => {
    const reconciled = reconcileCanvasSnapshot(
      {
        camera: { x: 720, y: 450, scale: 0.9 },
        positions: { DIM_KEEP: { x: 1, y: 2 }, DIM_OLD: { x: 3, y: 4 } },
        parked: ["DIM_KEEP", "DIM_OLD"],
        notes: [{ id: "n1", title: "笔记", summary: "保留", x: 10, y: 20 }],
        selection: ["DIM_OLD"],
        lastDimensionId: "DIM_OLD",
        updatedAt: 123,
      },
      ["DIM_KEEP"],
    )

    expect(reconciled.camera).toEqual({ x: 720, y: 450, scale: 0.9 })
    expect(reconciled.positions).toEqual({ DIM_KEEP: { x: 1, y: 2 } })
    expect(reconciled.parked).toEqual(["DIM_KEEP"])
    expect(reconciled.selection).toEqual([])
    expect(reconciled.lastDimensionId).toBeNull()
    expect(reconciled.notes).toHaveLength(1)
  })
})

describe("Guided Demo V2 场景（§26/§27/§30）", () => {
  it("7 个场景（原 Scene 6 拆为 EXTEND/SWITCH），总时长落在 28–35 秒", () => {
    expect(DEMO_SCENES).toHaveLength(7)
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
    // 其余控制统一为中文：暂停 / 继续 / 退出
    expect(overlay).toContain('"继续"')
    expect(overlay).toContain('"暂停"')
    expect(overlay).not.toMatch(/\bSkip\b/)
    expect(overlay).not.toMatch(/\bPause\b|\bResume\b|\bExit\b/)
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

// ---- M3 版本历史（纯函数部分）----
import { HISTORY_LIMIT, pushVersion, type ResearchVersion } from "@/lib/v5/shelf"

const version = (at: number, changes = 0): ResearchVersion => ({
  at,
  metrics: [],
  evidence: [],
  claims: [],
  changes: changes ? ([{ kind: "value", metricId: "X" }] as never) : [],
  claimRecheckIds: [],
})

describe("M3 · 研究版本历史", () => {
  it("新版本置顶，且按上限淘汰最旧", () => {
    let list: ResearchVersion[] = []
    for (let i = 1; i <= HISTORY_LIMIT + 4; i++) list = pushVersion(list, version(i * 10000))
    expect(list).toHaveLength(HISTORY_LIMIT)
    expect(list[0].at).toBe((HISTORY_LIMIT + 4) * 10000)
    expect(list[list.length - 1].at).toBe(5 * 10000)
  })

  it("同一毫秒内的重复写入被忽略（连续进入不堆版本）", () => {
    const once = pushVersion([], version(1000, 1))
    const twice = pushVersion(once, version(1400, 2)) // 差 400ms < 1000ms
    expect(twice).toHaveLength(1)
    expect(twice[0].changes).toHaveLength(1)
  })

  it("首个版本是基线（changes 为空）也能进历史", () => {
    const list = pushVersion([], version(1000))
    expect(list).toHaveLength(1)
    expect(list[0].changes).toHaveLength(0)
  })
})
