import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  TERRAIN_MOTION,
  interpolateRect,
  motionScaleForQuery,
  morphRectFor,
  readingRectFor,
  regionCoverageSpec,
  regionLandmarkBudget,
  reverseMorphForEvent,
  territoryEnvelope,
  easeInOut,
} from "@/lib/world/terrain-coverage"
import {
  contourPath,
  fracturePath,
  openContourPath,
  territoryContourPath,
} from "@/lib/world/terrain-geometry"

// Task 15.1 §89：只加真正防回归所需的 tests（6–12）。
// Terrain 表示 research structure / coverage / uncertainty / conflict，
// 绝不表达股票好坏（§19）；时序锁定 §71 区间。

const dim = (status: "ready" | "partial" | "unknown", evidenceCount = 5) =>
  ({ status, evidenceIds: Array.from({ length: evidenceCount }, (_, i) => `EV_${i}`) }) as Parameters<
    typeof regionCoverageSpec
  >[0]

describe("Region coverage 映射（§14–§18）", () => {
  it("READY：闭合轮廓 + 3 圈内部结构 + 满 landmark 密度", () => {
    const spec = regionCoverageSpec(dim("ready"), 0)
    expect(spec.contour).toBe("closed")
    expect(spec.ringCount).toBe(3)
    expect(spec.fog).toBe(false)
    expect(spec.landmarkDensity).toBe(1)
  })

  it("PARTIAL：半开虚线边界 + 更少结构与 landmark", () => {
    const spec = regionCoverageSpec(dim("partial"), 0)
    expect(spec.contour).toBe("partialDashed")
    expect(spec.ringCount).toBeLessThan(3)
    expect(spec.fog).toBe(false)
  })

  it("UNKNOWN：fog + 未闭合轮廓 + 最少 landmark（§17）", () => {
    const spec = regionCoverageSpec(dim("unknown"), 0)
    expect(spec.contour).toBe("openFog")
    expect(spec.fog).toBe(true)
    expect(spec.ringCount).toBe(0)
    expect(spec.landmarkDensity).toBeLessThan(regionCoverageSpec(dim("partial")).landmarkDensity)
  })

  it("CONFLICT 只追加小 fracture，不改整体形态（§18 禁止大红裂缝）", () => {
    const without = regionCoverageSpec(dim("ready"), 0)
    const withConflict = regionCoverageSpec(dim("ready"), 2)
    expect(withConflict.fracture).toBe(true)
    expect(without.fracture).toBe(false)
    expect(withConflict.contour).toBe(without.contour)
    expect(withConflict.ringCount).toBe(without.ringCount)
  })

  it("landmark 预算：6 区 × 预算合计不超过全场预算的约 1.5 倍，且 UNKNOWN 区少于 READY 区", () => {
    const ready = regionCoverageSpec(dim("ready"))
    const unknown = regionCoverageSpec(dim("unknown"))
    const readyBudget = regionLandmarkBudget(ready, 6, 16)
    const unknownBudget = regionLandmarkBudget(unknown, 6, 16)
    expect(readyBudget * 6).toBeLessThanOrEqual(24)
    expect(unknownBudget).toBeLessThan(readyBudget)
    expect(regionLandmarkBudget(ready, 12, 16)).toBeGreaterThanOrEqual(1)
  })
})

describe("Territory（§6/§9–§10）与 morph 几何", () => {
  const points = [
    { dimensionId: "a", x: -300, y: -160, radius: 100 },
    { dimensionId: "b", x: 320, y: -140, radius: 96 },
    { dimensionId: "c", x: 280, y: 200, radius: 90 },
    { dimensionId: "d", x: -260, y: 220, radius: 88 },
  ]

  it("territory 外包络覆盖全部 region（Company = 整片 Territory，不是群岛）", () => {
    const env = territoryEnvelope(points)
    expect(env).not.toBeNull()
    for (const p of points) {
      expect(Math.abs(p.x - env!.centerX)).toBeLessThanOrEqual(env!.radiusX)
      expect(Math.abs(p.y - env!.centerY)).toBeLessThanOrEqual(env!.radiusY)
    }
    expect(territoryEnvelope([])).toBeNull()
  })

  it("morph 源矩形在屏幕坐标内且包含 region 中心；阅读面在顶部 chrome 之下", () => {
    const camera = { x: 0, y: 0, scale: 1 }
    const viewport = { width: 1440, height: 900 }
    const rect = morphRectFor({ x: 200, y: 100, radius: 100 }, camera, viewport)
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.x + rect.width / 2).toBeCloseTo(200 - 0 + viewport.width / 2, 0)
    const reading = readingRectFor(viewport)
    expect(reading.y).toBe(56)
    expect(reading.height).toBe(900 - 56)
  })

  it("插值：t=0 返回源、t=1 返回目标、单调（§32–§36 帧序列的数学基础）", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    const b = { x: 400, y: 200, width: 1440, height: 800 }
    expect(interpolateRect(a, b, 0)).toEqual(a)
    expect(interpolateRect(a, b, 1)).toEqual(b)
    const mid = interpolateRect(a, b, 0.5)
    expect(mid.x).toBeGreaterThan(0)
    expect(mid.x).toBeLessThan(400)
    let prev = -Infinity
    for (let t = 0; t <= 1.001; t += 0.1) {
      const v = easeInOut(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it("反向 morph 事件映射：back / zoom_out / select_company → collapse；前进事件不触发（§40–§43）", () => {
    expect(reverseMorphForEvent({ type: "back" }).direction).toBe("collapse")
    expect(reverseMorphForEvent({ type: "zoom_out" }).endScene).toBe("SPACE_OVERVIEW")
    expect(reverseMorphForEvent({ type: "select_company" }).direction).toBe("collapse")
    expect(reverseMorphForEvent({ type: "open_dimension" }).direction).toBe("none")
  })
})

describe("Morph 时序（§71–§73）", () => {
  it("各 transition 落在 Spec 区间，且任何动作 ≤ 900ms 生产力阈值", () => {
    expect(TERRAIN_MOTION.regionHover).toBeGreaterThanOrEqual(120)
    expect(TERRAIN_MOTION.regionHover).toBeLessThanOrEqual(180)
    expect(TERRAIN_MOTION.regionExpanded).toBeGreaterThanOrEqual(240)
    expect(TERRAIN_MOTION.regionExpanded).toBeLessThanOrEqual(360)
    expect(TERRAIN_MOTION.regionToReading).toBeGreaterThanOrEqual(500)
    expect(TERRAIN_MOTION.regionToReading).toBeLessThanOrEqual(750)
    expect(TERRAIN_MOTION.evidenceExpand).toBeGreaterThanOrEqual(280)
    expect(TERRAIN_MOTION.evidenceExpand).toBeLessThanOrEqual(420)
    expect(TERRAIN_MOTION.reverse).toBeLessThanOrEqual(TERRAIN_MOTION.regionToReading)
    for (const value of Object.values(TERRAIN_MOTION)) {
      expect(value).toBeLessThanOrEqual(TERRAIN_MOTION.PRODUCTIVITY_THRESHOLD_MS)
    }
  })

  it("captureSlow 只用于采样（×5），默认不改变时长", () => {
    expect(motionScaleForQuery(null)).toBe(1)
    expect(motionScaleForQuery("0")).toBe(1)
    expect(motionScaleForQuery("1")).toBe(5)
  })
})

describe("Terrain 几何（§17/§18/§6）", () => {
  it("UNKNOWN 开口轮廓不闭合（无 Z），闭合轮廓有 Z", () => {
    const open = openContourPath({ x: 0, y: 0 }, 80, "k")
    const closed = contourPath({ x: 0, y: 0 }, 80, "k")
    expect(open.endsWith("Z")).toBe(false)
    expect(closed.endsWith("Z")).toBe(true)
  })

  it("CONFLICT 断裂线受控（尺寸 ≈ radius*0.5 内，非巨缝）", () => {
    const d = fracturePath({ x: 0, y: 0 }, 100, "k")
    const xs = [...d.matchAll(/[-\d.]+ [-\d.]+/g)].flatMap((m) => m[0].split(" ").map(Number))
    expect(Math.max(...xs)).toBeLessThanOrEqual(80)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-80)
  })

  it("territory 轮廓闭合且由确定性种子生成（两次调用一致）", () => {
    const env = { centerX: 0, centerY: 0, radiusX: 500, radiusY: 380 }
    const a = territoryContourPath(env, "seed")
    const b = territoryContourPath(env, "seed")
    expect(a).toBe(b)
    expect(a.endsWith("Z")).toBe(true)
  })
})

describe("纯函数边界（§44：视觉映射不外溢）", () => {
  it("terrain-coverage 不 import 任何 renderer / 组件", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "world", "terrain-coverage.ts"), "utf8")
    const imports = src
      .split("\n")
      .filter((l) => l.trim().startsWith("import") || l.includes('from "'))
      .join("\n")
    expect(imports).not.toMatch(/components\//)
    expect(imports).not.toMatch(/[Rr]enderer/)
  })

  it("terrain 视觉收敛在 terrain.tsx（kit 不含 territory/UNEXPLORED 概念）", () => {
    const dir2 = join(process.cwd(), "src", "components", "observatory", "renderers")
    for (const f of readdirSync(dir2).filter((f) => f.endsWith(".tsx") && f !== "terrain.tsx")) {
      const src = readFileSync(join(dir2, f), "utf8")
      expect(src).not.toMatch(/UNEXPLORED|territoryContourPath|RESOLVING/)
    }
  })
})
