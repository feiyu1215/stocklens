// Task 16 PART B：Research Shelf（研究架）——收藏公司 / 最近公司 / 每公司画布快照。
// 纯函数与存储分离：纯函数可测，存储只做 JSON 兜底、永不抛错。
// 只存产品状态；不存任何凭据。

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import type { MetricResult } from "@/lib/metrics/types"
import type { Evidence } from "@/lib/evidence/types"
import type { ChangeItem } from "@/lib/v5/change-diff"
import {
  clearStorageEviction,
  clearStorageFailure,
  currentBackend,
  deleteKV,
  getLastStorageEviction,
  getLastStorageFailure,
  migrateFromLocalStorage,
  migrateLocalStoragePrefix,
  onStorageEviction,
  onStorageFailure,
  readKV,
  requestStorageEviction,
  setStorageEvictionHook,
  writeKV,
} from "@/lib/v5/idb"

export interface SavedCompany {
  stockCode: string
  name: string
  industry?: string
  savedAt: number
  lastVisitedAt: number
  /** 研究库中的轻量摘要；只用于导航和状态呈现，不代替真实 ResearchSpace payload。 */
  dimensionCount?: number
  evidenceCount?: number
  aiStatus?: "success" | "partial_failure" | "failed"
  lastResearchAt?: number
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

/**
 * 研究重新生成后维度集合可能变化。恢复前只保留仍存在的维度引用，
 * 相机与用户笔记可以安全保留，失效的选中/停放/位置引用必须丢弃。
 */
export function reconcileCanvasSnapshot(
  snapshot: CanvasSnapshot,
  validDimensionIds: Iterable<string>,
): CanvasSnapshot {
  const valid = new Set(validDimensionIds)
  return {
    ...snapshot,
    positions: Object.fromEntries(
      Object.entries(snapshot.positions ?? {}).filter(([dimensionId]) => valid.has(dimensionId)),
    ),
    parked: (snapshot.parked ?? []).filter((dimensionId) => valid.has(dimensionId)),
    selection: (snapshot.selection ?? []).filter((dimensionId) => valid.has(dimensionId)),
    lastDimensionId:
      snapshot.lastDimensionId && valid.has(snapshot.lastDimensionId)
        ? snapshot.lastDimensionId
        : null,
  }
}

export const RECENT_LIMIT = 6

const SAVED_KEY = "stocklens.shelf.saved"
const RECENT_KEY = "stocklens.shelf.recent"
const LIBRARY_KEY = "stocklens.shelf.library"
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

/**
 * 研究库保留所有已进入过的公司，不受 RECENT_LIMIT 影响。
 * 再次访问会置顶，同时保留已有的研究摘要字段。
 */
export function upsertLibrary(
  list: SavedCompany[],
  company: Omit<SavedCompany, "savedAt" | "lastVisitedAt">,
  now = Date.now(),
): SavedCompany[] {
  const previous = list.find((item) => item.stockCode === company.stockCode)
  const next: SavedCompany = {
    ...previous,
    ...company,
    savedAt: previous?.savedAt ?? now,
    lastVisitedAt: now,
    lastResearchAt: company.lastResearchAt ?? previous?.lastResearchAt ?? now,
  }
  return [next, ...list.filter((item) => item.stockCode !== company.stockCode)]
}

/** 用于从旧版 SAVED / RECENT 无损迁移到研究库。 */
export function mergeLibraryCompanies(...lists: SavedCompany[][]): SavedCompany[] {
  const merged = new Map<string, SavedCompany>()
  for (const list of lists) {
    for (const company of list) {
      const previous = merged.get(company.stockCode)
      if (!previous) {
        merged.set(company.stockCode, company)
        continue
      }
      const latest = company.lastVisitedAt >= previous.lastVisitedAt ? company : previous
      const older = latest === company ? previous : company
      merged.set(company.stockCode, {
        ...older,
        ...latest,
        savedAt: Math.min(previous.savedAt, company.savedAt),
        dimensionCount: latest.dimensionCount ?? older.dimensionCount,
        evidenceCount: latest.evidenceCount ?? older.evidenceCount,
        aiStatus: latest.aiStatus ?? older.aiStatus,
        lastResearchAt: Math.max(previous.lastResearchAt ?? 0, company.lastResearchAt ?? 0) || undefined,
      })
    }
  }
  return [...merged.values()].sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
}

export function formatLastResearch(ts: number | null | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `Last research · ${hh}:${mm}`
}

// ---- 存储（异步；IndexedDB 优先，localStorage 兜底）----
//
// 阶段 1（P1-1）改动：原先这套是同步读 localStorage，且写入异常被裸 try/catch 吞掉，
// 配额超限时研究库会**无声地停止入库**。现在统一走 `idb.ts`：
// 容量更大、失败会通过 `onStorageFailure` 上报（由 UI 决定怎么告诉用户），
// 无存储环境下仍安全退化为"读得到空 / 写不进去也不会崩"。

async function readList(key: string): Promise<SavedCompany[]> {
  const value = await readKV<SavedCompany[]>(key)
  return Array.isArray(value) ? value : []
}

/** 写入结果不再被吞掉：失败会经 `idb.ts` 上报给订阅者。 */
async function writeList(key: string, list: SavedCompany[]): Promise<void> {
  await writeKV(key, list)
}

export const loadSaved = () => readList(SAVED_KEY)
export const saveSaved = (list: SavedCompany[]) => writeList(SAVED_KEY, list)
export const loadRecent = () => readList(RECENT_KEY)
export const saveRecent = (list: SavedCompany[]) => writeList(RECENT_KEY, list)
export const loadLibrary = () => readList(LIBRARY_KEY)
export const saveLibrary = (list: SavedCompany[]) => writeList(LIBRARY_KEY, list)

export async function saveResearch(payload: ResearchSpacePayload, recordedSample: boolean): Promise<void> {
  await writeKV(`stocklens.research.${payload.company.stockCode}`, { payload, recordedSample })
}

export async function loadResearch(
  stockCode: string,
): Promise<{ payload: ResearchSpacePayload; recordedSample: boolean } | null> {
  const saved = await readKV<{ payload: ResearchSpacePayload; recordedSample: boolean }>(
    `stocklens.research.${stockCode}`,
  )
  if (!saved) return null
  if (
    saved?.payload?.company?.stockCode !== stockCode ||
    !Array.isArray(saved.payload.dimensions) ||
    !Array.isArray(saved.payload.evidence)
  ) {
    return null
  }
  return saved
}

// ---- 变化记录（M1）----
//
// 口径（交叉评审）：只保留「上一个有效版本」+「本次变化清单」；
// **只在差异达标时才写**（无变化只更新 lastCheckedAt），且旧版本存的是
// metrics / evidence **全文对象而非 id**——否则旧证据一旦从当前 payload 消失就再也追不回。

export interface PreviousVersion {
  savedAt: number
  retrievedAt?: string
  metrics: MetricResult[]
  evidence: Evidence[]
  /** 只留结论与证据的引用关系，用于说明"哪些结论需要重新核验" */
  claims: { claimId: string; evidenceIds: string[] }[]
}

export interface ChangeRecord {
  at: number
  prev: PreviousVersion
  items: ChangeItem[]
  claimRecheckIds: string[]
}

const changeKey = (stockCode: string) => `stocklens.change.${stockCode}`
const checkKey = (stockCode: string) => `stocklens.check.${stockCode}`

export async function saveChangeRecord(stockCode: string, record: ChangeRecord): Promise<void> {
  await writeKV(changeKey(stockCode), record)
}

export async function loadChangeRecord(stockCode: string): Promise<ChangeRecord | null> {
  const saved = await readKV<ChangeRecord>(changeKey(stockCode))
  if (!saved || !Array.isArray(saved.items) || !saved.prev || !Array.isArray(saved.prev.metrics)) return null
  return saved
}

/** 无变化时只刷新检查时间——不写 payload、不新增快照。 */
export async function saveLastCheckedAt(stockCode: string, at: number): Promise<void> {
  await writeKV(checkKey(stockCode), at)
}

export async function loadLastCheckedAt(stockCode: string): Promise<number | null> {
  const at = await readKV<number>(checkKey(stockCode))
  return typeof at === "number" ? at : null
}

export async function loadCanvas(stockCode: string): Promise<CanvasSnapshot | null> {
  // 同标签页会话内优先取 sessionStorage（同步、最快），其余走 kv。
  try {
    const raw = globalThis.sessionStorage?.getItem(canvasKey(stockCode))
    if (raw) {
      const parsed = JSON.parse(raw) as CanvasSnapshot
      if (parsed?.camera) return parsed
    }
  } catch {
    // 继续走 kv
  }
  const parsed = await readKV<CanvasSnapshot>(canvasKey(stockCode))
  if (!parsed?.camera) return null
  return parsed
}

export async function saveCanvas(stockCode: string, snap: CanvasSnapshot): Promise<void> {
  try {
    globalThis.sessionStorage?.setItem(canvasKey(stockCode), JSON.stringify(snap))
  } catch {
    // session 镜像失败不影响持久化
  }
  await writeKV(canvasKey(stockCode), snap)
}

export async function demoSeen(): Promise<boolean> {
  return (await readKV<boolean>(DEMO_SEEN_KEY)) === true
}

export async function markDemoSeen(): Promise<void> {
  await writeKV(DEMO_SEEN_KEY, true)
}

export async function demoCompleted(): Promise<boolean> {
  return (await readKV<boolean>(DEMO_DONE_KEY)) === true
}

export async function markDemoCompleted(): Promise<void> {
  await writeKV(DEMO_DONE_KEY, true)
}

/**
 * 首屏调用一次：把 localStorage 里的旧数据搬进 IndexedDB，避免升级后历史"看起来没了"。
 * 幂等，重复调用只返回同一个结果。
 */
export function ensureShelfMigrated(): Promise<number> {
  return migrateLocalStoragePrefix([SAVED_KEY, RECENT_KEY, LIBRARY_KEY, DEMO_SEEN_KEY, DEMO_DONE_KEY, "stocklens.research.", "stocklens.canvas."])
}

/**
 * 写不进去时的自动解法：按"最久未访问"淘汰旧研究缓存，腾出空间。
 *
 * 只删**缓存**（stored payload 与画布快照），**不删研究库条目**——
 * 用户在研究库里仍看得到这家公司，只是需要重新生成研究内容（resume 会自然回落到 init）。
 * 这是"缓存淘汰"，不是"删用户的数据"。
 */
const EVICT_PER_ROUND = 3

async function evictOldestCachedResearch(protectKey: string): Promise<string[]> {
  const library = await loadLibrary()
  if (library.length === 0) return []
  const ordered = [...library].sort((a, b) => (a.lastVisitedAt ?? 0) - (b.lastVisitedAt ?? 0))
  const freed: string[] = []
  for (const company of ordered) {
    if (freed.length >= EVICT_PER_ROUND) break
    const researchKey = `stocklens.research.${company.stockCode}`
    const canvasKey = `stocklens.canvas.${company.stockCode}`
    for (const candidate of [researchKey, canvasKey]) {
      if (candidate === protectKey) continue
      if ((await readKV(candidate)) === undefined) continue
      await deleteKV(candidate)
      freed.push(candidate)
      if (freed.length >= EVICT_PER_ROUND) break
    }
  }
  return freed
}

/** 清理旧缓存（横幅按钮用）。返回清掉的 key。 */
export async function cleanupOldestCachedResearch(): Promise<string[]> {
  return requestStorageEviction()
}

// 模块加载即注册：保证任何写入路径都有"满了先自己腾空间"的能力，不依赖组件挂载顺序。
setStorageEvictionHook(evictOldestCachedResearch)

/** UI 用来如实告知"存储没写进去"，而不是假装成功。 */
export {
  onStorageFailure,
  onStorageEviction,
  clearStorageFailure,
  clearStorageEviction,
  getLastStorageFailure,
  getLastStorageEviction,
  currentBackend,
  migrateFromLocalStorage,
}
export type { StorageFailure, StorageFailureReason, StorageEviction } from "@/lib/v5/idb"

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
