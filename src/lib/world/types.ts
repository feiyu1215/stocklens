// World Model（Task 14 §2–§5）：多公司层与 World Renderer 标识。
// World ≠ Renderer：World 是"我研究了哪些公司 / 当前在哪家公司"，
// Renderer 决定这个世界长什么样（Terrain / Cosmos / Pearl / Dusk）。

export type WorldRendererId = "pearl" | "dusk" | "terrain" | "cosmos"

/** My World 中的公司对象（只存产品状态，禁止敏感信息，§5） */
export interface WorldCompany {
  stockCode: string
  stockName: string
  industryName?: string
  lastVisitedAt?: string
  exploredDimensionCount?: number
  isSaved?: boolean
}

/** localStorage 持久化结构（无账号，仅本机，§4） */
export interface LocalResearchWorld {
  recentCompanies: WorldCompany[]
  savedCompanies: WorldCompany[]
  lastActiveCompany?: string
  lastRenderer?: WorldRendererId
}

export const WORLD_STORAGE_KEY = "stocklens.world.v1"

export const DEFAULT_WORLD_COMPANY: WorldCompany = {
  stockCode: "000333.SZ",
  stockName: "美的集团",
  industryName: "白色家电",
}

export const MAX_RECENT_COMPANIES = 12

export const WORLD_RENDERER_IDS: WorldRendererId[] = ["pearl", "terrain", "cosmos"]

export const RENDERER_LABELS: Record<WorldRendererId, string> = {
  pearl: "Pearl",
  dusk: "Dusk",
  terrain: "Terrain",
  cosmos: "Cosmos",
}
