// Task 16.1 §3：开发期交互计时（pointer/click → 首个有意义视觉更新）。
// 只在开发环境与 ?perfDebug=1 下显示；产品界面不出现。

export type InteractionType = "local" | "remote"

export interface InteractionRecord {
  name: string
  type: InteractionType
  /** markStart → markVisual 的毫秒数（未标记者为 null） */
  visualMs: number | null
  /** 该窗口内是否出现新的业务网络请求 */
  network: boolean
  /** 新请求的 URL（截断） */
  networkUrls: string[]
  at: string
}

const records: InteractionRecord[] = []
let current: (InteractionRecord & { startTs: number; resourcesAtStart: number }) | null = null
let snapshot: InteractionRecord[] = []
const listeners = new Set<() => void>()

function resourceCount(): number {
  try {
    return performance.getEntriesByType("resource").length
  } catch {
    return 0
  }
}

function newResources(since: number): string[] {
  try {
    return performance
      .getEntriesByType("resource")
      .slice(since)
      .map((e) => (e as PerformanceResourceTiming).name.split("/").slice(-2).join("/"))
      .filter((u) => u.includes("api/") || u.includes("research") || u.includes("followup") || u.includes("stocks"))
  } catch {
    return []
  }
}

function publish() {
  snapshot = records.slice(-6)
  listeners.forEach((fn) => fn())
}

export const interactionPerf = {
  /** 用户意图发生的瞬间（pointerdown / handler 入口） */
  markStart(name: string, type: InteractionType = "local") {
    current = { name, type, visualMs: null, network: false, networkUrls: [], at: new Date().toISOString().slice(11, 19), startTs: performance.now(), resourcesAtStart: resourceCount() }
    try {
      performance.mark(`${name}:start`)
    } catch {
      // 忽略
    }
  },

  /** 首个有意义视觉更新已提交（通常在 rAF 之后调用） */
  markVisual(name?: string) {
    if (!current) return
    const ms = Math.round(performance.now() - current.startTs)
    const urls = newResources(current.resourcesAtStart)
    const rec: InteractionRecord = {
      name: name ?? current.name,
      type: current.type,
      visualMs: ms,
      network: urls.length > 0,
      networkUrls: urls.slice(0, 2),
      at: current.at,
    }
    records.push(rec)
    try {
      performance.measure(`${rec.name}:visual`, `${rec.name}:start`)
    } catch {
      // 忽略
    }
    current = null
    publish()
  },

  /** 远程动作：明确标记该交互会触发业务请求 */
  markNetwork(name: string) {
    if (current && current.name === name) current.type = "remote"
  },

  all(): InteractionRecord[] {
    return snapshot
  },

  clear() {
    records.length = 0
    publish()
  },

  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  getSnapshot(): InteractionRecord[] {
    return snapshot
  },
}

export function perfDebugEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("perfDebug") === "1"
}

/** 交互开始的自动标记：捕获阶段监听 pointerdown，rAF×2 后记录首个视觉更新 */
export function instrumentPointer(root: HTMLElement): () => void {
  const onDown = (e: PointerEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.(
      "[data-perf-name],[data-anchor-id],[data-evidence-node],[data-company-identity],[data-change-company],[data-ai-send],[data-zoom-in],[data-zoom-out],[data-demo-controls],button",
    ) as HTMLElement | null
    const name = el?.getAttribute("data-perf-name") ?? el?.getAttribute("data-anchor-id") ?? "chrome"
    interactionPerf.markStart(name.replace(/^DIM_[^_]+_\d+_/, "dim:"))
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => interactionPerf.markVisual()))
  }
  root.addEventListener("pointerdown", onDown, true)
  return () => root.removeEventListener("pointerdown", onDown, true)
}
