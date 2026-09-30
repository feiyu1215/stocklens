// v3 布局（Task 15.2 UI RESET §17/§31–§32）：Cosmos 式「非等大对象随手散布」。
// 纯函数、确定性；radial / 中心环 / 等大栅格全部禁止。

import { stableHashUnit } from "@/lib/presentation/constellation-layout"

export type ObjectTier = "focal" | "major" | "standard" | "small"

export interface ObjectSlot {
  x: number
  y: number
  w: number
  h: number
  rot: number
  tier: ObjectTier
}

/** 世界坐标系（camera 作用于此空间；1440×900 下初始 fit ≈ 0.62 缩放） */
export const WORLD = { width: 1900, height: 1250 } as const

/** Cosmos 语法：主对象偏左中、其余环绕但不均匀，尺寸/旋转不一（§31–32） */
const SLOTS: ObjectSlot[] = [
  { x: 820, y: 640, w: 430, h: 306, rot: -1.4, tier: "focal" },
  { x: 1330, y: 420, w: 340, h: 244, rot: 1.1, tier: "major" },
  { x: 1690, y: 760, w: 322, h: 232, rot: -0.7, tier: "major" },
  { x: 1250, y: 960, w: 268, h: 186, rot: 0.8, tier: "standard" },
  { x: 1750, y: 300, w: 250, h: 172, rot: 0.5, tier: "standard" },
  { x: 1720, y: 1090, w: 240, h: 164, rot: -1.7, tier: "standard" },
]

const UNKNOWN_SLOT: ObjectSlot = { x: 1050, y: 1120, w: 300, h: 196, rot: -1.1, tier: "small" }

export function tierStyle(tier: ObjectTier): { title: number; claim: number; pad: number } {
  switch (tier) {
    case "focal":
      return { title: 30, claim: 15.5, pad: 22 }
    case "major":
      return { title: 23, claim: 13.5, pad: 18 }
    case "standard":
      return { title: 18, claim: 12, pad: 15 }
    case "small":
      return { title: 15, claim: 11, pad: 13 }
  }
}

export interface SlotAssignment {
  dimensionId: string
  slot: ObjectSlot
}

/** 按 priority 分配散布槽位（确定性；未知维度走边缘槽） */
export function assignSlots(
  dims: { dimensionId: string; priority: number; status: string }[],
): SlotAssignment[] {
  const sorted = [...dims].sort((a, b) => a.priority - b.priority)
  const out: SlotAssignment[] = []
  let slotIndex = 0
  for (const dim of sorted) {
    if (dim.status === "unknown") {
      out.push({ dimensionId: dim.dimensionId, slot: UNKNOWN_SLOT })
      continue
    }
    const base = SLOTS[Math.min(slotIndex, SLOTS.length - 1)]
    const jx = (stableHashUnit(`${dim.dimensionId}:jx`) - 0.5) * 56
    const jy = (stableHashUnit(`${dim.dimensionId}:jy`) - 0.5) * 48
    out.push({
      dimensionId: dim.dimensionId,
      slot: { ...base, x: base.x + jx, y: base.y + jy, rot: base.rot + (stableHashUnit(`${dim.dimensionId}:jr`) - 0.5) * 0.8 },
    })
    slotIndex += 1
  }
  return out
}

/** Gather（§34）：把选中对象组织到主 visual 上方的一条紧凑横带（不是围圈） */
export function gatherTargets(selectedIds: string[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  const n = selectedIds.length
  selectedIds.forEach((id, i) => {
    const spread = 330
    out[id] = { x: 860 + (i - (n - 1) / 2) * spread, y: 250 - Math.abs(i - (n - 1) / 2) * 26 }
  })
  return out
}

/** Spread（§35）：回到非对称散布槽位（= reset manual positions） */

/** 世界坐标 → 视口百分比（suggestion 边缘定位用） */
export function suggestionSlots(): { x: number; y: number; label: string }[] {
  return [
    { x: 80, y: 88, label: "" },
    { x: 6, y: 12, label: "" },
    { x: 52, y: 94, label: "" },
  ]
}

// ---------- My World 场景（§44–§48，Oryzo 拼贴构图） ----------

export const SCENE = { width: 960, height: 640, gap: 120 } as const

export function sceneX(index: number): number {
  return index * (SCENE.width + SCENE.gap)
}
