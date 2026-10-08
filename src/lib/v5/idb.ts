// 阶段 1（P1-1）：研究历史的持久化后端。
//
// 为什么要有这一层：
// 1. localStorage 只有 5–10MB，而每家公司的 payload 含全量日线，多存几家必然配额超限；
//    原 shelf.ts 的写入用裸露 try/catch 吞掉异常，超限后**研究库会无声地停止入库**，
//    界面上完全看不出来。这是本次改造要解决的真问题。
// 2. IndexedDB 容量通常是磁盘剩余空间的一个比例，够放研究历史。
//
// 设计约束：
// - **写不进去要自己解决，而不是把难题丢给用户**：先自动淘汰最旧的缓存并重试，
//   只有连淘汰都救不了时才上报失败。上报是最后一道，不是第一反应。
// - IndexedDB 不可用时（隐私模式、SSR、老浏览器）降级到 localStorage，而不是消失。
// - 迁移只读不改：localStorage 里的旧数据会被搬进 IndexedDB，但**不删除旧数据**，便于回滚。

const DB_NAME = "stocklens"
const DB_VERSION = 1
const STORE = "kv"

export type StorageFailureReason = "unavailable" | "quota" | "unknown"

export interface StorageFailure {
  key: string
  reason: StorageFailureReason
  message: string
  at: number
}

type FailureListener = (failure: StorageFailure) => void

const failureListeners = new Set<FailureListener>()
let lastFailure: StorageFailure | null = null

export function onStorageFailure(listener: FailureListener): () => void {
  failureListeners.add(listener)
  return () => failureListeners.delete(listener)
}

export function getLastStorageFailure(): StorageFailure | null {
  return lastFailure
}

export function clearStorageFailure() {
  lastFailure = null
}

/** 自动腾空间的结果：淘汰了哪些 key。用于如实告知"为了保存，清理了什么"。 */
export interface StorageEviction {
  keys: string[]
  at: number
}

type EvictionListener = (eviction: StorageEviction) => void

const evictionListeners = new Set<EvictionListener>()
let lastEviction: StorageEviction | null = null

export function onStorageEviction(listener: EvictionListener): () => void {
  evictionListeners.add(listener)
  return () => evictionListeners.delete(listener)
}

const EVICTION_LOG_KEY = "stocklens.storage.eviction"

function persistEviction(eviction: StorageEviction) {
  try {
    ;(globalThis as unknown as { localStorage?: Storage }).localStorage?.setItem(
      EVICTION_LOG_KEY,
      JSON.stringify(eviction),
    )
  } catch {
    // 记录失败不影响主流程（此时存储本来就紧张）
  }
}

export function getLastStorageEviction(): StorageEviction | null {
  if (lastEviction) return lastEviction
  // 淘汰常发生在画布页，用户随后去研究库是**新的页面上下文**，模块级状态会丢。
  // "删了用户的缓存"这件事必须跨页面可见，不能只活在当前会话里。
  try {
    const raw = (globalThis as unknown as { localStorage?: Storage }).localStorage?.getItem(EVICTION_LOG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StorageEviction
    return parsed && Array.isArray(parsed.keys) ? parsed : null
  } catch {
    return null
  }
}

export function clearStorageEviction() {
  lastEviction = null
  try {
    ;(globalThis as unknown as { localStorage?: Storage }).localStorage?.removeItem(EVICTION_LOG_KEY)
  } catch {
    // 忽略
  }
}

/**
 * 淘汰策略由领域层（shelf）注册：它知道"哪条研究最旧、可以安全丢弃"。
 * `protectKey` 是本次正在写的 key，淘汰时不得删除它自己，否则会自己删自己再写回去空转。
 * 返回清掉的 key；空数组表示腾不出空间。
 */
type EvictionHook = (protectKey: string) => Promise<string[]>

let evictionHook: EvictionHook | null = null

export function setStorageEvictionHook(hook: EvictionHook | null) {
  evictionHook = hook
}

function recordEviction(keys: string[]) {
  if (keys.length === 0) return
  lastEviction = { keys, at: Date.now() }
  persistEviction(lastEviction)
  evictionListeners.forEach((listener) => listener(lastEviction as StorageEviction))
}

/** 手动清理入口：横幅上的按钮调它，而不是让用户自己去翻浏览器设置。 */
export async function requestStorageEviction(protectKey = ""): Promise<string[]> {
  if (!evictionHook) return []
  const keys = await evictionHook(protectKey)
  recordEviction(keys)
  return keys
}

function reportFailure(key: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  const name = err instanceof Error ? err.name : ""
  // DOMException.name === "QuotaExceededError"（Chrome/Edge/Firefox 一致）
  const reason: StorageFailureReason =
    name === "QuotaExceededError" || /quota/i.test(message) ? "quota" : name === "InvalidStateError" ? "unavailable" : "unknown"
  const failure: StorageFailure = { key, reason, message, at: Date.now() }
  lastFailure = failure
  failureListeners.forEach((listener) => listener(failure))
}

// 注意：这里一律通过 globalThis 取 storage / indexedDB，不用 `window.`。
// 浏览器里两者等价，但测试环境（node）没有 window，而原 shelf.ts 的契约是
// 「无存储环境时读取退化为空、不抛错」——必须能在无 window 下被正确识别。
const hasIDB = () => typeof (globalThis as { indexedDB?: IDBFactory }).indexedDB !== "undefined"
const hasLocalStorage = () => {
  try {
    return typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined"
  } catch {
    return false
  }
}

export function currentBackend(): "idb" | "local" | "none" {
  if (hasIDB()) return "idb"
  return hasLocalStorage() ? "local" : "none"
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (!hasIDB()) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = (globalThis as { indexedDB: IDBFactory }).indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
  return dbPromise
}

// IndexedDB 的 open/put 都可能永远不 resolve（用户禁用、磁盘异常），加超时兜底。
function withTimeout<T>(work: Promise<T>, ms = 3000): Promise<T | null> {
  return Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))])
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB()
  if (!db) return undefined
  return new Promise<T | undefined>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly")
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result?.value as T | undefined)
      req.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

async function idbSet(key: string, value: unknown): Promise<boolean> {
  const db = await openDB()
  if (!db) return false
  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put({ key, value })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

function storeGet(name: "localStorage" | "sessionStorage"): Storage | undefined {
  try {
    return (globalThis as unknown as Record<string, Storage | undefined>)[name]
  } catch {
    return undefined
  }
}

function localGetRaw(key: string): string | null {
  const local = storeGet("localStorage")
  if (!local) return null
  try {
    const session = storeGet("sessionStorage")
    return (session?.getItem(key) ?? null) ?? local.getItem(key)
  } catch {
    try {
      return local.getItem(key)
    } catch {
      return null
    }
  }
}

type LocalWrite = { ok: true } | { ok: false; error: unknown }

function localSetRaw(key: string, value: string): LocalWrite {
  const local = storeGet("localStorage")
  if (!local) return { ok: false, error: new Error("no localStorage") }
  try {
    local.setItem(key, value)
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function readKV<T>(key: string): Promise<T | undefined> {
  const fromIDB = await withTimeout(idbGet<T>(key))
  if (fromIDB !== undefined && fromIDB !== null) return fromIDB
  const raw = localGetRaw(key)
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/**
 * 写入。失败不抛错，但一定会通过 onStorageFailure 上报。
 * 返回是否至少写成功了一个后端。
 */
export async function deleteKV(key: string): Promise<void> {
  const db = await openDB()
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite")
        tx.objectStore(STORE).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
        tx.onabort = () => resolve()
      } catch {
        resolve()
      }
    })
  }
  const local = storeGet("localStorage")
  try {
    local?.removeItem(key)
  } catch {
    // 局部清理失败不影响主流程
  }
}

/**
 * 写入。**先自己想办法成功**：一次失败不会直接把错误推给用户，
 * 而是调用领域层注册的淘汰策略腾出空间后重试；只有淘汰也救不了才上报失败。
 */
export async function writeKV(key: string, value: unknown): Promise<boolean> {
  const raw = JSON.stringify(value)
  if (await seekWrite(key, raw)) return true

  // 最多淘汰两轮：一轮删一条太重（可能一次腾不出足量空间），但也别无限删下去。
  for (let round = 0; round < 2; round += 1) {
    if (!evictionHook) break
    const freed = await evictionHook(key)
    if (freed.length === 0) break
    const written = await seekWrite(key, raw)
    recordEviction(freed)
    if (written) return true
  }

  reportFailure(key, lastWriteError ?? new Error("All storage backends failed"))
  return false
}

let lastWriteError: unknown = null

/** 单次写入尝试：IndexedDB 优先，失败退 localStorage。不抛错，返回原始错误供分类。 */
async function seekWrite(key: string, raw: string): Promise<boolean> {
  const idbOK = await withTimeout(idbSet(key, JSON.parse(raw)))
  if (idbOK) {
    lastWriteError = null
    return true
  }
  const localResult = localSetRaw(key, raw)
  if (localResult.ok) {
    // IndexedDB 写不进去、这一次被 localStorage 兜住了。算成功，但记下降级事实：
    // localStorage 容量小，迟早会超限。
    if (currentBackend() === "idb") lastWriteError = new Error("IndexedDB write failed; fell back to localStorage")
    else lastWriteError = null
    return true
  }
  // 保住 quota 分类——UI 要据此区分"空间满了"和"存储不可用"
  lastWriteError = localResult.error
  return false
}

let migrationOnce: Promise<number> | null = null

/**
 * 扫描 localStorage 里所有 stocklens.* 的旧数据搬进 IndexedDB。
 * 每个页面加载只跑一次；旧数据**不删除**，方便回滚。
 */
export function migrateLocalStoragePrefix(prefixes: string[]): Promise<number> {
  if (migrationOnce) return migrationOnce
  migrationOnce = (async () => {
    if (!hasIDB() || !hasLocalStorage()) return 0
    const keys: string[] = []
    const store = storeGet("localStorage")
    if (!store) return 0
    try {
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i)
        if (k && prefixes.some((p) => k.startsWith(p))) keys.push(k)
      }
    } catch {
      return 0
    }
    return migrateFromLocalStorage(keys)
  })()
  return migrationOnce
}

/**
 * 一次性迁移：把 localStorage 里已有的旧数据搬进 IndexedDB。
 * 只读旧数据、**不删除**，方便回滚。重复执行无副作用（已有 key 会被同值覆盖）。
 */
export async function migrateFromLocalStorage(keys: string[]): Promise<number> {
  if (!hasIDB() || !hasLocalStorage()) return 0
  let moved = 0
  for (const key of keys) {
    const raw = localGetRaw(key)
    if (!raw) continue
    try {
      const value = JSON.parse(raw)
      await writeKV(key, value)
      moved += 1
    } catch {
      // 单个 key 解析失败不影响其余迁移
    }
  }
  return moved
}
