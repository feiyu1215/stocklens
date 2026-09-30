// Information Density（Task 15 §85–§93）：camera scale 只改变信息密度，
// 不改变 semantic level（level 只由显式事件驱动，§6/§84）。
// 纯函数；Renderer 只消费 detail level，不自行定义另一套逻辑（§91）。

export type ObjectDetailLevel = "micro" | "compact" | "expanded"

export const DETAIL_THRESHOLDS = {
  /** 低于该 scale 视为 far → micro（仅 label） */
  MICRO_BELOW: 0.8,
  /** 高于该 scale 视为 close → 允许 expanded（仍需 selected） */
  EXPANDED_ABOVE: 1.15,
} as const

/**
 * 对象信息密度：
 * - micro：远距离，仅 label；
 * - compact：常规，label + subtle status；
 * - expanded：近距离且 selected/hovered → summary + top claims（§89）。
 */
export function getObjectDetailLevel(input: {
  cameraScale: number
  hovered?: boolean
  selected?: boolean
}): ObjectDetailLevel {
  const { cameraScale, hovered = false, selected = false } = input
  if (cameraScale < DETAIL_THRESHOLDS.MICRO_BELOW) return "micro"
  if (selected && cameraScale >= DETAIL_THRESHOLDS.EXPANDED_ABOVE) return "expanded"
  if (hovered && cameraScale >= DETAIL_THRESHOLDS.EXPANDED_ABOVE) return "expanded"
  return "compact"
}

export const EVIDENCE_FIELD_DENSITY = {
  /** Overview 最多明确显示的证据节点（§93：12–16） */
  FAR_MAX: 12,
  NEAR_MAX: 16,
} as const

/** Evidence Field 密度随 scale（§92）：远只显示重要节点，近显示更多 */
export function evidenceNodeBudget(cameraScale: number): number {
  if (cameraScale < DETAIL_THRESHOLDS.MICRO_BELOW) return EVIDENCE_FIELD_DENSITY.FAR_MAX
  return EVIDENCE_FIELD_DENSITY.NEAR_MAX
}

/** 近距离时显示 labels / links（§92） */
export function shouldShowEvidenceLabels(cameraScale: number): boolean {
  return cameraScale >= DETAIL_THRESHOLDS.EXPANDED_ABOVE
}

// ---------- Context-sensitive commands（§69） ----------

export interface CommandSpec {
  id: string
  label: string
}

export function contextCommands(level: "world" | "company" | "dimension" | "claim" | "evidence"): CommandSpec[] {
  switch (level) {
    case "world":
      return [
        { id: "search_company", label: "Search company" },
        { id: "explore_company", label: "Explore company" },
      ]
    case "company":
      // §67：未选中对象时给「探索 / 加入研究角度 / 换一家公司」；选中后 Explore dimension 才有落点
      return [
        { id: "explore_dimension", label: "Explore dimension" },
        { id: "add_research_angle", label: "Add research angle" },
        { id: "search_company", label: "Search company" },
      ]
    case "dimension":
      return [
        { id: "open_research", label: "Explore region" },
        { id: "add_research_angle", label: "Add research angle" },
        { id: "pin_note", label: "Pin note" },
      ]
    case "claim":
      return [
        { id: "inspect_evidence", label: "Inspect evidence" },
        { id: "challenge", label: "Challenge" },
        { id: "ask_why", label: "Ask why" },
      ]
    case "evidence":
      return [
        { id: "return_to_claim", label: "Return to claim" },
        { id: "inspect_metric", label: "Inspect metric" },
      ]
  }
}
