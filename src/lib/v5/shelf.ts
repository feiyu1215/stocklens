// Task 16 PART B：Research Shelf（研究架）——收藏公司 / 最近公司 / 每公司画布快照。
// 纯函数与存储分离：纯函数可测，存储只做 JSON 兜底、永不抛错。
// 只存产品状态；不存任何凭据。

export interface SavedCompany {
  stockCode: string
  name: string
  industry?: string
  savedAt: number
  lastVisitedAt: number
}

export interface CanvasSnapshot {
  camera: { x: number; y: number; scale: number }
  positions: Record<string, { x: number; y: number }>
  parked: string[]
  notes: { id: string; title: string; summary: string; x: number; y: number }[]
  selection: string[]
  lastDimensionId: string | null
  updatedAt: number
}

export const RECENT_LIMIT = 6

const SAVED_KEY = "stocklens.shelf.saved"
const RECENT_KEY = "stocklens.shelf.recent"
const DEMO_SEEN_KEY = "stocklens.demo.seen"
const DEMO_DONE_KEY = "stocklens.demo.completed"
const canvasKey = (stockCode: string) => `stocklens.canvas.${stockCode}`

// ---- 纯函数 ----

export function isSaved(list: SavedCompany[], stockCode: string): boolean {
  return list.some((c) => c.stockCode === stockCode)
}

export function toggleSaved(list: SavedCompany[], company: Omit<SavedCompany, "savedAt" | "lastVisitedAt">, now = Date.now()): SavedCompany[] {
  if (isSaved(list, company.stockCode)) return list.filter((c) => c.stockCode !== company.stockCode)
  return [...list, { ...company, savedAt: now, lastVisitedAt: now }]
}

/** 最近访问：同代码去重、置顶、上限淘汰；已收藏不受影响（两个列表独立） */
export function pushRecent(list: SavedCompany[], company: Omit<SavedCompany, "savedAt" | "lastVisitedAt">, now = Date.now(), limit = RECENT_LIMIT): SavedCompany[] {
  const rest = list.filter((c) => c.stockCode !== company.stockCode)
  const prev = list.find((c) => c.stockCode === company.stockCode)
  return [{ ...company, savedAt: prev?.savedAt ?? now, lastVisitedAt: now }, ...rest].slice(0, limit)
}

export function touchSaved(list: SavedCompany[], stockCode: string, now = Date.now()): SavedCompany[] {
  return list.map((c) => (c.stockCode === stockCode ? { ...c, lastVisitedAt: now } : c))
}

export function formatLastResearch(ts: number | null | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `Last research · ${hh}:${mm}`
}

// ---- 存储（容错，绝不抛出）----

function readList(key: string): SavedCompany[] {
  try {
    const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedCompany[]) : []
  } catch {
    return []
  }
}

function writeList(key: string, list: SavedCompany[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // 隐私模式 / 配额：忽略
  }
}

export const loadSaved = () => readList(SAVED_KEY)
export const saveSaved = (list: SavedCompany[]) => writeList(SAVED_KEY, list)
export const loadRecent = () => readList(RECENT_KEY)
export const saveRecent = (list: SavedCompany[]) => writeList(RECENT_KEY, list)

export function loadCanvas(stockCode: string): CanvasSnapshot | null {
  try {
    const raw = sessionStorage.getItem(canvasKey(stockCode))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CanvasSnapshot
    if (!parsed?.camera) return null
    return parsed
  } catch {
    return null
  }
}

export function saveCanvas(stockCode: string, snap: CanvasSnapshot) {
  try {
    sessionStorage.setItem(canvasKey(stockCode), JSON.stringify(snap))
  } catch {
    // 忽略
  }
}

export function demoSeen(): boolean {
  try {
    return localStorage.getItem(DEMO_SEEN_KEY) === "true"
  } catch {
    return false
  }
}

export function markDemoSeen() {
  try {
    localStorage.setItem(DEMO_SEEN_KEY, "true")
  } catch {
    // 忽略
  }
}

export function demoCompleted(): boolean {
  try {
    return localStorage.getItem(DEMO_DONE_KEY) === "true"
  } catch {
    return false
  }
}

export function markDemoCompleted() {
  try {
    localStorage.setItem(DEMO_DONE_KEY, "true")
  } catch {
    // 忽略
  }
}

/** 供 Company Switcher 搜索接口复用（§11） */
export async function searchCompanies(q: string): Promise<{ stockCode: string; stockName: string }[]> {
  try {
    const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q.trim())}`)
    const body = await res.json()
    const items = (body.items ?? body.results ?? body ?? []) as { stockCode: string; stockName: string }[]
    return Array.isArray(items) ? items.slice(0, 5) : []
  } catch {
    return []
  }
}
