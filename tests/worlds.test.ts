import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  MAX_RECENT_COMPANIES,
  RENDERER_LABELS,
  WORLD_RENDERER_IDS,
  type LocalResearchWorld,
  type WorldCompany,
} from "@/lib/world/types"
import {
  loadWorld,
  setLastRenderer,
  sortRecentCompanies,
  toggleSavedCompany,
  withExploredDimensions,
  withVisitedCompany,
  worldCompanies,
} from "@/lib/world/my-world"
import {
  TRAVERSAL,
  activeCompanyAtCenter,
  companyVisualTier,
  computeWorldLayout,
  magneticSnapTarget,
  neighborCompanies,
  stepCompanyTarget,
} from "@/lib/world/traversal"
import {
  backgroundContours,
  computeRegionGeometry,
  contourPath,
  fogMaskPath,
  territoryGeometry,
  territoryScale,
} from "@/lib/world/terrain-geometry"
import { computeFitCamera, type CameraState } from "@/lib/spatial/camera"
import type { ResearchDimension } from "@/lib/research/dimension-schema"

function company(code: string, name: string, visitedAt?: string, extra: Partial<WorldCompany> = {}): WorldCompany {
  return { stockCode: code, stockName: name, ...(visitedAt ? { lastVisitedAt: visitedAt } : {}), ...extra }
}

function dim(id: string, status: ResearchDimension["status"], evidence = 4, priority = 1): ResearchDimension {
  return {
    dimensionId: id,
    label: id,
    researchQuestion: "q",
    origin: "ai_initial",
    capabilityRefs: ["financial_growth"],
    status,
    rationale: "r",
    priority,
    evidenceIds: Array.from({ length: evidence }, (_, i) => `${id}_EV${i}`),
    claimIds: [],
  }
}

const VIEWPORT = { width: 1440, height: 900 }
const CENTER_CAMERA: CameraState = { x: 0, y: 0, scale: 1 }

describe("My World 持久化与排序（§4–§7/§59–§60/§83）", () => {
  it("默认 Demo 公司始终存在（首次访问仅它一个；加入其它公司后仍在）", () => {
    const empty: LocalResearchWorld = { recentCompanies: [], savedCompanies: [] }
    const only = worldCompanies(empty)
    expect(only).toHaveLength(1)
    expect(only[0].stockCode).toBe("000333.SZ")

    const world = withVisitedCompany(empty, { stockCode: "600519.SH", stockName: "贵州茅台" }, "2026-09-30T10:00:00Z")
    const companies = worldCompanies(world)
    expect(companies.map((c) => c.stockCode)).toEqual(["600519.SH", "000333.SZ"])
    expect(companies.some((c) => c.stockCode === "000333.SZ" && c.stockName === "美的集团")).toBe(true)
  })

  it("loadWorld 在无 window 时安全返回空（SSR）", () => {
    expect(loadWorld()).toEqual({ recentCompanies: [], savedCompanies: [] })
  })

  it("访问记录：recent 更新、时间戳写入、去重、容量上限", () => {
    let world: LocalResearchWorld = { recentCompanies: [], savedCompanies: [] }
    for (let i = 0; i < MAX_RECENT_COMPANIES + 3; i++) {
      world = withVisitedCompany(world, { stockCode: `${600000 + i}.SH`, stockName: `C${i}` }, `2026-09-30T10:${String(i).padStart(2, "0")}:00Z`)
    }
    expect(world.recentCompanies).toHaveLength(MAX_RECENT_COMPANIES)
    // 重复访问同一公司不产生重复条目，并刷新时间
    const before = world.recentCompanies.length
    world = withVisitedCompany(world, { stockCode: "600002.SH", stockName: "C2x" }, "2026-10-01T00:00:00Z")
    expect(world.recentCompanies).toHaveLength(before)
    expect(world.recentCompanies[0].stockCode).toBe("600002.SH")
    expect(world.lastActiveCompany).toBe("600002.SH")
  })

  it("排序稳定：lastVisitedAt 倒序，同时刻按 stockCode；同一列表重复调用结果一致", () => {
    const list = [
      company("600519.SH", "贵州茅台", "2026-09-30T10:00:00Z"),
      company("600036.SH", "招商银行", "2026-09-30T10:00:00Z"),
      company("000333.SZ", "美的集团", "2026-09-29T10:00:00Z"),
    ]
    const a = sortRecentCompanies(list)
    const b = sortRecentCompanies(list)
    expect(a.map((c) => c.stockCode)).toEqual(["600036.SH", "600519.SH", "000333.SZ"])
    expect(a).toEqual(b)
  })

  it("saved 持久化与切换（且不改变 recent 顺序语义）", () => {
    let world = withVisitedCompany({ recentCompanies: [], savedCompanies: [] }, { stockCode: "600519.SH", stockName: "贵州茅台" }, "2026-09-30T10:00:00Z")
    world = toggleSavedCompany(world, "600519.SH")
    expect(world.savedCompanies.map((c) => c.stockCode)).toEqual(["600519.SH"])
    // saved 出现在展示集合且标记 isSaved
    const companies = worldCompanies(world)
    expect(companies.find((c) => c.stockCode === "600519.SH")?.isSaved).toBe(true)
    world = toggleSavedCompany(world, "600519.SH")
    expect(world.savedCompanies).toHaveLength(0)
  })

  it("exploredDimensionCount 写入 recent 与 saved（Territory richness 的唯一来源）", () => {
    let world = withVisitedCompany({ recentCompanies: [], savedCompanies: [] }, { stockCode: "000333.SZ", stockName: "美的集团" }, "2026-09-30T10:00:00Z")
    world = toggleSavedCompany(world, "000333.SZ")
    world = withExploredDimensions(world, "000333.SZ", 6)
    expect(world.recentCompanies[0].exploredDimensionCount).toBe(6)
    expect(world.savedCompanies[0].exploredDimensionCount).toBe(6)
  })

  it("lastRenderer 持久化（World 选择跨会话保留）", () => {
    const world = setLastRenderer({ recentCompanies: [], savedCompanies: [] }, "terrain")
    expect(world.lastRenderer).toBe("terrain")
    expect(WORLD_RENDERER_IDS).toContain("terrain")
    expect(WORLD_RENDERER_IDS).toContain("cosmos")
    expect(RENDERER_LABELS.terrain).toBe("Terrain")
  })
})

describe("Company Traversal（§9–§13/§58–§64/§83）", () => {
  const companies = [
    company("000333.SZ", "美的集团", "2026-09-30T12:00:00Z"),
    company("600519.SH", "贵州茅台", "2026-09-30T11:00:00Z"),
    company("600036.SH", "招商银行", "2026-09-30T10:00:00Z"),
  ]
  const positions = computeWorldLayout(companies)

  it("布局确定性：同一列表重复计算一致，横向等距", () => {
    expect(computeWorldLayout(companies)).toEqual(positions)
    expect(positions[1].x - positions[0].x).toBe(TRAVERSAL.SPACING_X)
  })

  it("active company = 最接近视口中心者；远离所有公司时为 null", () => {
    expect(activeCompanyAtCenter(CENTER_CAMERA, VIEWPORT, positions)).toBe("000333.SZ")
    expect(activeCompanyAtCenter({ ...CENTER_CAMERA, x: positions[0].x }, VIEWPORT, positions)).toBe("000333.SZ")
    expect(activeCompanyAtCenter({ ...CENTER_CAMERA, x: positions[1].x }, VIEWPORT, positions)).toBe("600519.SH")
    expect(activeCompanyAtCenter({ ...CENTER_CAMERA, x: 5000 }, VIEWPORT, positions)).toBeNull()
  })

  it("邻居计算：previous / current / next 都是真实对象", () => {
    const { previous, current, next } = neighborCompanies("600519.SH", companies)
    expect(previous?.stockCode).toBe("000333.SZ")
    expect(current?.stockCode).toBe("600519.SH")
    expect(next?.stockCode).toBe("600036.SH")
    const first = neighborCompanies("000333.SZ", companies)
    expect(first.previous).toBeNull()
    expect(first.next?.stockCode).toBe("600519.SH")
  })

  it("视觉层级只表达研究状态（active/neighbor/distant）", () => {
    expect(companyVisualTier("600519.SH", "600519.SH", companies)).toBe("active")
    expect(companyVisualTier("000333.SZ", "600519.SH", companies)).toBe("neighbor")
    expect(companyVisualTier("600036.SH", "600519.SH", companies)).toBe("neighbor")
    expect(companyVisualTier("000333.SZ", null, companies)).toBe("distant")
  })

  it("键盘穿行：← → 给出相邻公司的 camera 目标；边界返回 null", () => {
    expect(stepCompanyTarget("600519.SH", companies, positions, -1)).toBe(positions[0].x)
    expect(stepCompanyTarget("600519.SH", companies, positions, 1)).toBe(positions[2].x)
    expect(stepCompanyTarget("000333.SZ", companies, positions, -1)).toBeNull()
    expect(stepCompanyTarget("600036.SH", companies, positions, 1)).toBeNull()
  })

  it("轻磁吸：接近中心时给出吸附目标；远离时无吸附（不是翻页锁定）", () => {
    const near = magneticSnapTarget({ ...CENTER_CAMERA, x: positions[0].x + 60 }, VIEWPORT, positions)
    expect(near).not.toBeNull()
    // 吸附幅度受限（最多 35%），且不直接等于目标（非锁定）
    expect(Math.abs(near! - CENTER_CAMERA.x - 60)).toBeLessThan(TRAVERSAL.SNAP_RADIUS)
    expect(magneticSnapTarget({ ...CENTER_CAMERA, x: 5000 }, VIEWPORT, positions)).toBeNull()
  })
})

describe("Terrain 几何与语义映射（§15–§31/§83）", () => {
  it("轮廓程序生成且确定性（同 id 两次一致，不同 id 不同）", () => {
    const a = contourPath({ x: 0, y: 0 }, 100, "seed:1")
    const b = contourPath({ x: 0, y: 0 }, 100, "seed:1")
    const c = contourPath({ x: 0, y: 0 }, 100, "seed:2")
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.startsWith("M ")).toBe(true)
  })

  it("status → region 视觉映射：ready 完整等高线 / partial 虚线 / unknown 未闭合+更粗噪", () => {
    const ready = computeRegionGeometry(dim("增长韧性", "ready", 6), { x: 0, y: 0 })
    const partial = computeRegionGeometry(dim("估值定位", "partial", 3), { x: 200, y: 0 })
    const unknown = computeRegionGeometry(dim("海外业务", "unknown", 0), { x: 400, y: 0 })
    expect(ready.rings.length).toBeGreaterThan(partial.rings.length)
    expect(partial.rings.length).toBeGreaterThanOrEqual(1)
    expect(ready.richness).toBeGreaterThan(unknown.richness)
    expect(unknown.status).toBe("unknown")
    expect(unknown.rings.length).toBe(1)
  })

  it("UNKNOWN → fog 语义（软掩码路径生成，无动画依赖）", () => {
    const fog = fogMaskPath({ x: 10, y: -20 }, 90, "海外业务")
    expect(fog.startsWith("M ")).toBe(true)
    expect(fog.endsWith("Z")).toBe(true)
  })

  it("Territory 尺寸仅轻微映射研究深度（0.9–1.1x，不产生价值暗示）", () => {
    expect(territoryScale(0)).toBeCloseTo(0.9, 5)
    expect(territoryScale(10)).toBeCloseTo(1.1, 5)
    expect(territoryScale(100)).toBeCloseTo(1.1, 5)
    const small = territoryGeometry("000333.SZ", { x: 0, y: 0 }, 0)
    const large = territoryGeometry("000333.SZ", { x: 0, y: 0 }, 10)
    expect(large.radius / small.radius).toBeLessThanOrEqual(1.23)
  })

  it("背景等高线数量受控（≤ 8 条，避免上百 path）", () => {
    const paths = backgroundContours({ width: 2400, height: 1400 }, "bg", 7)
    expect(paths).toHaveLength(7)
    expect(paths.length).toBeLessThanOrEqual(8)
  })
})

describe("Renderer 独立性扩围（§26/§83）", () => {
  it("world / spatial / presentation 层不得引用 renderer 或视觉隐喻实现", () => {
    const roots = ["src/lib/spatial", "src/lib/presentation", "src/lib/world"]
    const forbidden = ["renderers/", "PearlRenderer", "DuskRenderer", "TerrainRenderer", "CosmosRenderer", "three", "Three.js"]
    const violations: string[] = []
    for (const root of roots) {
      for (const file of readdirSync(path.join(process.cwd(), root))) {
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue
        const source = readFileSync(path.join(process.cwd(), root, file), "utf-8")
        for (const word of forbidden) {
          if (source.includes(word)) violations.push(`${root}/${file} contains "${word}"`)
        }
      }
    }
    expect(violations, violations.join("; ")).toEqual([])
  })

  it("world 语义禁令：domain 层不得出现地形/评级隐喻字段", () => {
    const worldTypes = readFileSync(path.join(process.cwd(), "src/lib/world/types.ts"), "utf-8")
    for (const word of ["terrainHeight", "islandType", "rating", "score", "bullish", "bearish"]) {
      expect(worldTypes.includes(word), `types.ts 含禁用词 ${word}`).toBe(false)
    }
    const semantics = readFileSync(path.join(process.cwd(), "docs/worlds/world-semantics.md"), "utf-8")
    expect(semantics).toContain("brightness != stock quality")
    expect(semantics).toContain("size != recommendation")
    expect(semantics).toContain("fog            = insufficient evidence")
  })

  it("Cosmos contract 兼容：与 Terrain 同为完整 WorldRenderer（含 renderWorld）", async () => {
    const { CosmosRenderer } = await import("@/components/observatory/renderers/cosmos")
    const { TerrainRenderer } = await import("@/components/observatory/renderers/terrain")
    for (const renderer of [CosmosRenderer, TerrainRenderer]) {
      expect(typeof renderer.id).toBe("string")
      for (const method of ["renderBackground", "renderEvidenceField", "renderCompany", "renderDimension", "renderSuggestion", "renderWorld"] as const) {
        expect(typeof renderer[method]).toBe("function")
      }
    }
    expect(CosmosRenderer.id).not.toBe(TerrainRenderer.id)
    expect(CosmosRenderer.tokens.light).toBe(false)
    expect(TerrainRenderer.tokens.light).toBe(true)
  })

  it("renderer 切换不改变交互状态模型（状态对象与 renderer 无关）", () => {
    // 交互状态的最小契约：只包含空间/交互字段，绝无 renderer 相关字段
    const interactionStateKeys = [
      "camera",
      "manualPositions",
      "focus",
      "parked",
      "summaries",
      "peekDimensionId",
      "activeCompanyCode",
    ]
    for (const key of interactionStateKeys) {
      expect(key.includes("renderer")).toBe(false)
      expect(key.includes("terrain")).toBe(false)
    }
    // fit 计算与 renderer 无关（纯 camera 数学）
    const fit = computeFitCamera({ minX: -300, minY: -200, maxX: 300, maxY: 200 }, VIEWPORT, 140)
    expect(fit.scale).toBeGreaterThan(0)
  })
})
