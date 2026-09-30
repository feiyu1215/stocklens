// Interaction Controller 的纯逻辑（Task 13 §9/§17–§22/§25–§30）：
// 拖拽仲裁、marquee 命中、Focus Set、Peek 定位、建议拖入落点、Pinned Summary。
// 本模块与任何 renderer / 视觉隐喻完全无关（renderer 独立性由测试扫描保证）。

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedObject {
  dimensionId: string
  x: number
  y: number
  width: number
  height: number
}

/** 对象包围盒（世界坐标） */
export function objectBounds(o: PositionedObject): Rect {
  return { x: o.x - o.width / 2, y: o.y - o.height / 2, width: o.width, height: o.height }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0
  )
}

/** Marquee 命中测试（§21）：返回与选框相交的 Dimension */
export function marqueeHitTest(marquee: Rect, objects: PositionedObject[]): string[] {
  return objects.filter((o) => rectsIntersect(marquee, objectBounds(o))).map((o) => o.dimensionId)
}

/** Marquee → 世界矩形（由屏幕拖拽矩形换算） */
export function marqueeWorldRect(
  from: { x: number; y: number },
  to: { x: number; y: number },
  screenToWorld: (p: { x: number; y: number }) => { x: number; y: number },
): Rect {
  const a = screenToWorld(from)
  const b = screenToWorld(to)
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

/** Focus Set（§18–§20）：选中集合与视觉映射（其余对象 0.10 / 0.94 / 禁用交互） */
export interface FocusSetState {
  selected: string[]
  focused: string[]
}

export function toggleSelection(selected: string[], dimensionId: string): string[] {
  return selected.includes(dimensionId)
    ? selected.filter((id) => id !== dimensionId)
    : [...selected, dimensionId]
}

export function focusSelected(selected: string[]): FocusSetState {
  return { selected: [...selected], focused: [...selected] }
}

export function showAll(): FocusSetState {
  return { selected: [], focused: [] }
}

export function objectPresentation(dimensionId: string, focus: FocusSetState): {
  opacity: number
  scale: number
  interactive: boolean
} {
  if (focus.focused.length === 0) return { opacity: 1, scale: 1, interactive: true }
  if (focus.focused.includes(dimensionId)) return { opacity: 1, scale: 1, interactive: true }
  return { opacity: 0.1, scale: 0.94, interactive: false }
}

/** Focus Zone 内容淡出（§35–§36）：有对象进入聚焦区时，其余对象轻微淡出 */
export function focusZonePresentations(
  objects: { dimensionId: string; inside: boolean }[],
  anyInside: boolean,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const o of objects) {
    if (!anyInside) out[o.dimensionId] = 1
    else out[o.dimensionId] = o.inside ? 1 : 0.55
  }
  return out
}

/** Peek 定位（§25）：尽量贴近对象且不超出视口 */
export const PEEK = { WIDTH: 306, GAP: 18, EDGE: 16 } as const

export function computePeekPosition(
  objectScreen: { x: number; y: number },
  objectSize: { width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number; placement: "right" | "left" } {
  const rightX = objectScreen.x + objectSize.width / 2 + PEEK.GAP
  const fitsRight = rightX + PEEK.WIDTH + PEEK.EDGE <= viewport.width
  const x = fitsRight
    ? rightX
    : Math.max(PEEK.EDGE, objectScreen.x - objectSize.width / 2 - PEEK.GAP - PEEK.WIDTH)
  const y = Math.min(
    Math.max(PEEK.EDGE, objectScreen.y - 40),
    Math.max(PEEK.EDGE, viewport.height - 260),
  )
  return { x, y, placement: fitsRight ? "right" : "left" }
}

/** Suggestion Drag-in（§37–§39）：Add Zone = Company Core 的柔性半径；仅 drop 时调用 API */
export const ADD_ZONE_RADIUS = 230

export function isInsideAddZone(world: { x: number; y: number }): boolean {
  return Math.hypot(world.x, world.y) <= ADD_ZONE_RADIUS
}

/** Pinned Summary（§29–§32）：最多 3 个；Collapse 全部回到对应维度 */
export interface PinnedSummary {
  id: string
  dimensionId: string
  label: string
  summary: string
  claims: { text: string; type: string; signal: string }[]
  status: string
  position: { x: number; y: number }
}

export const MAX_PINNED_SUMMARIES = 3

export function pinSummary(
  pinned: PinnedSummary[],
  next: Omit<PinnedSummary, "id" | "position">,
  defaultPosition: { x: number; y: number },
): PinnedSummary[] {
  if (pinned.some((p) => p.dimensionId === next.dimensionId)) return pinned
  const entry: PinnedSummary = {
    ...next,
    id: `SUMMARY_${next.dimensionId}`,
    position: defaultPosition,
  }
  if (pinned.length < MAX_PINNED_SUMMARIES) return [...pinned, entry]
  // 已达上限：替换最早的一个（确定性：保留最新 3 个）
  return [...pinned.slice(1), entry]
}

export function collapseSummaries(): PinnedSummary[] {
  return []
}

/** 拖拽仲裁（§9）：事件优先级明确，避免空白拖动与对象拖动互相抢占 */
export type DragTarget = "camera" | "object" | "marquee" | "suggestion" | "summary"

export function resolveDragTarget(input: {
  onObject: boolean
  onSuggestion: boolean
  onSummary: boolean
  shiftKey: boolean
}): DragTarget {
  if (input.onSummary) return "summary"
  if (input.onSuggestion) return "suggestion"
  if (input.onObject) return "object"
  if (input.shiftKey) return "marquee"
  return "camera"
}
