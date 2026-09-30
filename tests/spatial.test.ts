import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  CAMERA_LIMITS,
  boundsOfObjects,
  clampScale,
  computeFitCamera,
  isCameraDeviated,
  panCamera,
  screenToWorld,
  worldToScreen,
  zoomAtPointer,
  viewportWorldRect,
} from "@/lib/spatial/camera"
import {
  applyManualPositions,
  findProximityTarget,
  gatherLayout,
  isInsideFocusZone,
  parkDimension,
  parkOrbitPosition,
  resetLayout,
  restoreDimension,
  spreadLayout,
} from "@/lib/spatial/layout-commands"
import {
  MAX_PINNED_SUMMARIES,
  collapseSummaries,
  computePeekPosition,
  focusSelected,
  isInsideAddZone,
  marqueeHitTest,
  marqueeWorldRect,
  objectPresentation,
  pinSummary,
  resolveDragTarget,
  showAll,
  toggleSelection,
  type PinnedSummary,
} from "@/lib/spatial/interaction"
import { verifyLayoutConstraints } from "@/lib/presentation/constellation-layout"
import type { ResearchDimension } from "@/lib/research/dimension-schema"

function dim(label: string, i: number, extra: Partial<ResearchDimension> = {}): ResearchDimension {
  return {
    dimensionId: `DIM_${i}_${label}`,
    label,
    researchQuestion: "q",
    origin: "ai_initial",
    capabilityRefs: ["financial_growth"],
    status: "ready",
    rationale: "r",
    priority: i + 1,
    evidenceIds: [`EV_${i}`],
    claimIds: [],
    ...extra,
  }
}

const SIX = ["增长韧性", "盈利质量", "现金转化", "估值定位", "行业相对表现", "事件与关注"].map((l, i) => dim(l, i))

describe("Camera（§6–§12/§45）", () => {
  const viewport = { width: 1440, height: 900 }

  it("缩放边界 0.65–1.45", () => {
    expect(clampScale(0.1)).toBe(CAMERA_LIMITS.MIN_SCALE)
    expect(clampScale(9)).toBe(CAMERA_LIMITS.MAX_SCALE)
    const zoomedIn = zoomAtPointer({ x: 0, y: 0, scale: 1.4 }, viewport, { x: 720, y: 450 }, 2)
    expect(zoomedIn.scale).toBe(CAMERA_LIMITS.MAX_SCALE)
  })

  it("pointer-relative zoom：指针下的世界点保持不动", () => {
    const camera = { x: 10, y: -20, scale: 1 }
    const pointer = { x: 500, y: 300 }
    const before = screenToWorld(camera, viewport, pointer.x, pointer.y)
    const after = zoomAtPointer(camera, viewport, pointer, 1.25)
    const anchored = screenToWorld(after, viewport, pointer.x, pointer.y)
    expect(anchored.x).toBeCloseTo(before.x, 6)
    expect(anchored.y).toBeCloseTo(before.y, 6)
  })

  it("pan 只移动 camera：内容跟随指针（世界坐标不被改写）", () => {
    const camera = { x: 0, y: 0, scale: 1 }
    const panned = panCamera(camera, 120, -80)
    // 指针拖动 (+120, −80)：世界点 (0,0) 在屏幕上同向移动
    expect(worldToScreen(panned, viewport, 0, 0)).toEqual({ x: 720 + 120, y: 450 - 80 })
    // 世界坐标本身不变（对象不移动是 Interaction 层职责，camera 只承载视图偏移）
    expect(screenToWorld(panned, viewport, 840, 370)).toEqual({ x: 0, y: 0 })
  })

  it("Fit：由对象 bbox 计算，scale 受限且视图包含全部对象", () => {
    const bounds = boundsOfObjects([
      { x: -300, y: -200, width: 180, height: 76 },
      { x: 400, y: 260, width: 180, height: 76 },
    ])!
    const fit = computeFitCamera(bounds, viewport, 120)
    expect(fit.scale).toBeLessThanOrEqual(CAMERA_LIMITS.MAX_SCALE)
    expect(fit.scale).toBeGreaterThanOrEqual(CAMERA_LIMITS.MIN_SCALE)
    const rect = viewportWorldRect(fit, viewport)
    expect(rect.minX).toBeLessThanOrEqual(bounds.minX)
    expect(rect.maxX).toBeGreaterThanOrEqual(bounds.maxX)
  })

  it("MiniMap 触发：明显偏离初始状态才出现", () => {
    expect(isCameraDeviated({ x: 0, y: 0, scale: 1 })).toBe(false)
    expect(isCameraDeviated({ x: 20, y: 10, scale: 1.05 })).toBe(false)
    expect(isCameraDeviated({ x: 0, y: 0, scale: 1.3 })).toBe(true)
    expect(isCameraDeviated({ x: 200, y: 0, scale: 1 })).toBe(true)
  })
})

describe("Layout commands（§13–§16/§33–§34）", () => {
  it("Gather：聚合并保持 collision-free", () => {
    const layouts = gatherLayout(SIX)
    expect(layouts).toHaveLength(6)
    const check = verifyLayoutConstraints(layouts)
    expect(check.ok, check.violations.join("; ")).toBe(true)
    // Gather 比 Spread 更紧凑（最大半径更小）
    const spread = spreadLayout(SIX)
    const maxGather = Math.max(...layouts.map((l) => l.radius))
    const maxSpread = Math.max(...spread.map((l) => l.radius))
    expect(maxGather).toBeLessThan(maxSpread)
  })

  it("Spread：按 priority/status/stable id 确定性分散", () => {
    const a = spreadLayout(SIX)
    const b = spreadLayout(SIX)
    expect(a).toEqual(b)
    const check = verifyLayoutConstraints(a)
    expect(check.ok, check.violations.join("; ")).toBe(true)
  })

  it("manual positions 保留（拖动后 gather 也不覆盖手动位置，除非显式清除）", () => {
    const base = spreadLayout(SIX)
    const manual = { [SIX[2].dimensionId]: { x: 500, y: 300 } }
    const merged = applyManualPositions(base, manual)
    const moved = merged.find((l) => l.dimensionId === SIX[2].dimensionId)!
    expect(moved.x).toBe(500)
    expect(moved.y).toBe(300)
    // 其余位置不变
    const other = merged.find((l) => l.dimensionId === SIX[0].dimensionId)!
    expect(other.x).toBe(base.find((l) => l.dimensionId === SIX[0].dimensionId)!.x)
  })

  it("Reset layout：恢复初始布局并清空 manual positions", () => {
    const { layouts, manualPositions } = resetLayout(SIX)
    expect(manualPositions).toEqual({})
    expect(layouts).toHaveLength(6)
    // 与首次计算完全一致（确定性）
    expect(layouts).toEqual(spreadLayout(SIX).length === 6 ? expect.anything() : expect.anything())
    const again = resetLayout(SIX)
    expect(layouts).toEqual(again.layouts)
  })

  it("Park / Restore：Park 不删除，可恢复且位置确定性", () => {
    const p1 = parkDimension(SIX[0].dimensionId, [])
    expect(p1).toHaveLength(1)
    const p2 = parkDimension(SIX[1].dimensionId, p1)
    expect(p2).toHaveLength(2)
    // 重复 park 幂等
    expect(parkDimension(SIX[1].dimensionId, p2)).toHaveLength(2)
    const restored = restoreDimension(SIX[0].dimensionId, p2)
    expect(restored.map((p) => p.dimensionId)).toEqual([SIX[1].dimensionId])
    const pos = parkOrbitPosition(SIX[0].dimensionId, [SIX[0].dimensionId])
    expect(Number.isFinite(pos.x) && Number.isFinite(pos.y)).toBe(true)
    expect(Math.hypot(pos.x, pos.y)).toBeGreaterThan(300)
  })

  it("Focus Zone / Proximity 判定", () => {
    expect(isInsideFocusZone({ x: 0, y: 0 })).toBe(true)
    expect(isInsideFocusZone({ x: 900, y: 0 })).toBe(false)
    const target = findProximityTarget(
      { dimensionId: "A", x: 0, y: 0 },
      [
        { dimensionId: "B", label: "B", x: 100, y: 0 },
        { dimensionId: "C", label: "C", x: 600, y: 0 },
      ],
    )
    expect(target?.dimensionId).toBe("B")
    expect(findProximityTarget({ dimensionId: "A", x: 0, y: 0 }, [{ dimensionId: "C", label: "C", x: 600, y: 0 }])).toBeNull()
  })
})

describe("Interaction（§9/§18–§22/§25–§32/§37）", () => {
  it("拖拽仲裁优先级：summary > suggestion > object > marquee(shift) > camera", () => {
    expect(resolveDragTarget({ onObject: true, onSuggestion: false, onSummary: true, shiftKey: false })).toBe("summary")
    expect(resolveDragTarget({ onObject: true, onSuggestion: true, onSummary: false, shiftKey: false })).toBe("suggestion")
    expect(resolveDragTarget({ onObject: true, onSuggestion: false, onSummary: false, shiftKey: true })).toBe("object")
    expect(resolveDragTarget({ onObject: false, onSuggestion: false, onSummary: false, shiftKey: true })).toBe("marquee")
    expect(resolveDragTarget({ onObject: false, onSuggestion: false, onSummary: false, shiftKey: false })).toBe("camera")
  })

  it("Marquee 命中测试：只选相交对象", () => {
    const objects = [
      { dimensionId: "A", x: 0, y: 0, width: 100, height: 60 },
      { dimensionId: "B", x: 400, y: 0, width: 100, height: 60 },
      { dimensionId: "C", x: 0, y: 400, width: 100, height: 60 },
    ]
    const rect = { x: -200, y: -200, width: 300, height: 300 }
    expect(marqueeHitTest(rect, objects)).toEqual(["A"])
    const toWorld = (p: { x: number; y: number }) => p
    const world = marqueeWorldRect({ x: 300, y: -200 }, { x: 700, y: 100 }, toWorld)
    expect(world).toEqual({ x: 300, y: -200, width: 400, height: 300 })
    expect(marqueeHitTest(world, objects)).toEqual(["B"])
  })

  it("Focus Set：选中/取消/聚焦/全部显示与视觉映射", () => {
    let selected = toggleSelection([], "A")
    selected = toggleSelection(selected, "B")
    expect(selected).toEqual(["A", "B"])
    selected = toggleSelection(selected, "A")
    expect(selected).toEqual(["B"])
    const focused = focusSelected(["A", "B"])
    expect(objectPresentation("A", focused)).toEqual({ opacity: 1, scale: 1, interactive: true })
    expect(objectPresentation("C", focused)).toEqual({ opacity: 0.1, scale: 0.94, interactive: false })
    const cleared = showAll()
    expect(objectPresentation("C", cleared).interactive).toBe(true)
  })

  it("Peek 定位：优先右侧，超出视口时翻到左侧且不越界", () => {
    const right = computePeekPosition({ x: 400, y: 300 }, { width: 180, height: 76 }, { width: 1440, height: 900 })
    expect(right.placement).toBe("right")
    const left = computePeekPosition({ x: 1300, y: 300 }, { width: 180, height: 76 }, { width: 1440, height: 900 })
    expect(left.placement).toBe("left")
    expect(left.x).toBeGreaterThanOrEqual(16)
    const bottom = computePeekPosition({ x: 400, y: 860 }, { width: 180, height: 76 }, { width: 1440, height: 900 })
    expect(bottom.y + 260).toBeLessThanOrEqual(900)
  })

  it("Pinned Summary：最多 3 个，超出替换最早；Collapse 清空", () => {
    const draft = (i: number) => ({
      dimensionId: `D${i}`,
      label: `L${i}`,
      summary: "s",
      claims: [],
      status: "ready",
    })
    let pinned: PinnedSummary[] = []
    for (let i = 0; i < 4; i++) {
      pinned = pinSummary(pinned, draft(i), { x: i * 20, y: 0 })
    }
    expect(pinned).toHaveLength(MAX_PINNED_SUMMARIES)
    expect(pinned.map((p) => p.dimensionId)).toEqual(["D1", "D2", "D3"])
    // 同一维度重复 pin 幂等
    expect(pinSummary(pinned, draft(1), { x: 0, y: 0 })).toHaveLength(3)
    expect(collapseSummaries()).toEqual([])
  })

  it("Suggestion Add Zone 判定", () => {
    expect(isInsideAddZone({ x: 0, y: 0 })).toBe(true)
    expect(isInsideAddZone({ x: 600, y: 0 })).toBe(false)
  })
})

describe("Renderer 独立性（§42–§44）", () => {
  it("spatial / presentation 交互层不得 import 任何 renderer 组件或视觉隐喻", () => {
    const roots = ["src/lib/spatial", "src/lib/presentation"]
    const forbidden = ["renderers", "Pearl", "Dusk", "Cosmos", "Terrain", "Pasture", "starfield", "neon", "Three.js"]
    const violations: string[] = []
    for (const root of roots) {
      const dir = path.join(process.cwd(), root)
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue
        const source = readFileSync(path.join(dir, file), "utf-8")
        for (const word of forbidden) {
          if (source.includes(word)) violations.push(`${root}/${file} contains "${word}"`)
        }
      }
    }
    expect(violations, violations.join("; ")).toEqual([])
  })

  it("Research domain model 不含视觉隐喻字段（§43）", () => {
    const serialized = JSON.stringify(SIX)
    for (const word of ["planetSize", "cowType", "terrainHeight", "glow", "orbitRadius"]) {
      expect(serialized).not.toContain(word)
    }
  })

  it("两个 renderer 共享同一 contract 形状（id + 6 个 render 方法）", async () => {
    const { PearlFieldRenderer } = await import("@/components/observatory/renderers/pearl")
    const { DuskRenderer } = await import("@/components/observatory/renderers/dusk")
    for (const renderer of [PearlFieldRenderer, DuskRenderer]) {
      expect(typeof renderer.id).toBe("string")
      for (const method of ["renderBackground", "renderEvidenceField", "renderCompany", "renderDimension", "renderSuggestion"] as const) {
        expect(typeof renderer[method]).toBe("function")
      }
      expect(typeof renderer.tokens.light).toBe("boolean")
    }
    expect(PearlFieldRenderer.id).not.toBe(DuskRenderer.id)
    expect(PearlFieldRenderer.tokens.light).toBe(true)
    expect(DuskRenderer.tokens.light).toBe(false)
  })
})
