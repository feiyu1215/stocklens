import {
  DEFAULT_WORLD_COMPANY,
  MAX_RECENT_COMPANIES,
  WORLD_STORAGE_KEY,
  type LocalResearchWorld,
  type WorldCompany,
  type WorldRendererId,
} from "./types"

// My World 持久化与列表逻辑（Task 14 §4–§7/§59–§61）：
// 仅 localStorage；纯函数部分（排序/合并）可在 Node 测试中直接验证。

export function emptyWorld(): LocalResearchWorld {
  return { recentCompanies: [], savedCompanies: [] }
}

/** 读取：首次访问返回默认（含美的集团 Demo，§7）；SSR 安全 */
export function loadWorld(): LocalResearchWorld {
  if (typeof window === "undefined") return emptyWorld()
  try {
    const raw = window.localStorage.getItem(WORLD_STORAGE_KEY)
    if (!raw) return emptyWorld()
    const parsed = JSON.parse(raw) as Partial<LocalResearchWorld>
    return {
      recentCompanies: Array.isArray(parsed.recentCompanies) ? parsed.recentCompanies : [],
      savedCompanies: Array.isArray(parsed.savedCompanies) ? parsed.savedCompanies : [],
      ...(parsed.lastActiveCompany ? { lastActiveCompany: parsed.lastActiveCompany } : {}),
      ...(parsed.lastRenderer ? { lastRenderer: parsed.lastRenderer } : {}),
    }
  } catch {
    return emptyWorld()
  }
}

export function saveWorld(world: LocalResearchWorld): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(world))
  } catch {
    // 隐私模式 / 配额不足：静默降级为会话内状态，不影响产品功能
  }
}

/**
 * 最近公司排序（§59/§60）：lastVisitedAt 倒序（无时间戳的排在最后），
 * 时间相同按 stockCode 稳定排序 —— 同一列表重复进入布局一致。
 */
export function sortRecentCompanies(companies: WorldCompany[]): WorldCompany[] {
  return [...companies].sort((a, b) => {
    const ta = a.lastVisitedAt ?? ""
    const tb = b.lastVisitedAt ?? ""
    if (ta !== tb) return tb.localeCompare(ta)
    return a.stockCode.localeCompare(b.stockCode)
  })
}

/** 记录一次访问（加入 recent 并更新时间戳；saved 状态保留） */
export function withVisitedCompany(
  world: LocalResearchWorld,
  company: Pick<WorldCompany, "stockCode" | "stockName" | "industryName">,
  visitedAt: string,
): LocalResearchWorld {
  const existingSaved = world.savedCompanies.some((c) => c.stockCode === company.stockCode)
  const merged: WorldCompany = {
    ...company,
    lastVisitedAt: visitedAt,
    isSaved: existingSaved,
  }
  const recents = sortRecentCompanies([
    merged,
    ...world.recentCompanies.filter((c) => c.stockCode !== company.stockCode),
  ]).slice(0, MAX_RECENT_COMPANIES)
  return {
    ...world,
    recentCompanies: recents,
    lastActiveCompany: company.stockCode,
  }
}

/** 更新探索过的维度数量（Territory richness 的唯一数据来源，§20） */
export function withExploredDimensions(
  world: LocalResearchWorld,
  stockCode: string,
  exploredDimensionCount: number,
): LocalResearchWorld {
  return {
    ...world,
    recentCompanies: world.recentCompanies.map((c) =>
      c.stockCode === stockCode ? { ...c, exploredDimensionCount } : c,
    ),
    savedCompanies: world.savedCompanies.map((c) =>
      c.stockCode === stockCode ? { ...c, exploredDimensionCount } : c,
    ),
  }
}

export function toggleSavedCompany(world: LocalResearchWorld, stockCode: string): LocalResearchWorld {
  const inSaved = world.savedCompanies.some((c) => c.stockCode === stockCode)
  if (inSaved) {
    return {
      ...world,
      savedCompanies: world.savedCompanies.filter((c) => c.stockCode !== stockCode),
      recentCompanies: world.recentCompanies.map((c) =>
        c.stockCode === stockCode ? { ...c, isSaved: false } : c,
      ),
    }
  }
  const source = world.recentCompanies.find((c) => c.stockCode === stockCode)
  const entry: WorldCompany = source
    ? { ...source, isSaved: true }
    : { stockCode, stockName: stockCode, isSaved: true }
  return {
    ...world,
    savedCompanies: [...world.savedCompanies, entry],
    recentCompanies: world.recentCompanies.map((c) =>
      c.stockCode === stockCode ? { ...c, isSaved: true } : c,
    ),
  }
}

export function setLastRenderer(world: LocalResearchWorld, renderer: WorldRendererId): LocalResearchWorld {
  return { ...world, lastRenderer: renderer }
}

/**
 * My World 展示集合（§7/§59）：recent + saved 去重合并；
 * 首次访问为空时仅含默认 Demo 公司（美的集团），不自动进入 Research。
 */
export function worldCompanies(world: LocalResearchWorld): WorldCompany[] {
  const byCode = new Map<string, WorldCompany>()
  for (const c of sortRecentCompanies(world.recentCompanies)) byCode.set(c.stockCode, c)
  for (const c of world.savedCompanies) {
    byCode.set(c.stockCode, { ...byCode.get(c.stockCode), ...c, isSaved: true })
  }
  // 默认 Demo 公司始终存在于 My World（§7：第一次访问 / 演示基线）
  if (!byCode.has(DEFAULT_WORLD_COMPANY.stockCode)) {
    byCode.set(DEFAULT_WORLD_COMPANY.stockCode, DEFAULT_WORLD_COMPANY)
  }
  return [...byCode.values()]
}
