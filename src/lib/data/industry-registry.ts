import registryJson from "./industry-registry.json"

// Industry Registry 运行期查表（Task 12 §11/§14–15）：O(1)，不在运行时扫描行业。
// 数据由 scripts/build-industry-registry.mjs 从真实扶摇接口离线生成（含完整性冲突记录）。
// 未命中的股票返回 null —— 不猜测行业。

export interface IndustryRegistryEntry {
  stockCode: string
  industryIndexCode: string
  industryName: string
  source: "fuyao"
  verifiedAt: string
}

interface IndustryRegistryFile {
  generatedAt: string
  source: string
  method: string
  stats: { industries: number; stocks: number; conflicts: number; invalidCodes: number }
  industries: { industryIndexCode: string; industryName: string; memberCount: number }[]
  conflicts: { stockCode: string; kept: string; alsoListedIn: string; alsoListedInName: string }[]
  invalidCodes: { stockCode?: string; industryIndexCode?: string; reason: string }[]
  entries: IndustryRegistryEntry[]
}

const registry = registryJson as IndustryRegistryFile

const byStock = new Map(registry.entries.map((e) => [e.stockCode.toUpperCase(), e] as const))

export function lookupIndustry(stockCode: string): IndustryRegistryEntry | null {
  return byStock.get(stockCode.toUpperCase()) ?? null
}

export function industryRegistryMeta(): {
  generatedAt: string
  stats: IndustryRegistryFile["stats"]
} {
  return { generatedAt: registry.generatedAt, stats: registry.stats }
}

export const INDUSTRY_REGISTRY_SIZE = registry.entries.length
