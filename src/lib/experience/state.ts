// Experience Model —— 语义层级与状态机（Task 15 §5–§10/§33/§57–§59）。
//
// 这是 UI 信息密度的唯一主轴：world → company → dimension → claim → evidence。
// 纪律：
// - 本模块为纯 TypeScript，不 import 任何 Renderer / 视觉隐喻（§33，测试强制）；
// - semantic level 只能由显式事件改变（click / Enter / Explore / back），
//   绝不由 wheel/scale 直接驱动（§6/§84）；scale 只影响信息密度（§85）。

export type SemanticLevel = "world" | "company" | "dimension" | "claim" | "evidence"

export type TransitionSource = "click" | "zoom" | "command" | "keyboard" | "back"

export interface ExperienceState {
  level: SemanticLevel
  activeCompany?: string
  activeDimension?: string
  activeClaim?: string
  activeEvidence?: string
  transitionSource: TransitionSource
}

export const INITIAL_EXPERIENCE: ExperienceState = {
  level: "world",
  transitionSource: "click",
}

/** 事件（与 semantic transition table 一一对应，§9） */
export type ExperienceEvent =
  | { type: "select_company"; stockCode: string; source?: TransitionSource }
  | { type: "open_dimension"; dimensionId: string; source?: TransitionSource }
  | { type: "open_research"; dimensionId: string; source?: TransitionSource }
  | { type: "select_claim"; claimId: string; source?: TransitionSource }
  | { type: "select_evidence"; evidenceId: string; source?: TransitionSource }
  | { type: "clear_evidence"; source?: TransitionSource }
  | { type: "clear_claim"; source?: TransitionSource }
  | { type: "back" }
  | { type: "zoom_out" }
  | { type: "reset" }

const TRANSITION_TABLE: Record<SemanticLevel, string[]> = {
  world: ["select_company"],
  company: ["open_dimension", "open_research", "select_company", "zoom_out", "back", "reset"],
  dimension: ["open_research", "select_evidence", "back", "reset", "clear_claim", "clear_evidence"],
  claim: ["select_claim", "select_evidence", "clear_claim", "clear_evidence", "back", "reset", "open_dimension"],
  evidence: ["clear_evidence", "back", "reset", "select_claim"],
}

export function canApply(state: ExperienceState, event: ExperienceEvent): boolean {
  return TRANSITION_TABLE[state.level].includes(event.type)
}

/**
 * 中央 transition（纯函数）：所有层级的进入/返回都经过这里。
 * 非法转换返回原状态（不抛错，静默忽略 —— 防止滚轮误触导致的意外导航，§84）。
 */
export function transition(state: ExperienceState, event: ExperienceEvent): ExperienceState {
  if (event.type === "reset") return { ...INITIAL_EXPERIENCE }
  if (!canApply(state, event)) return state

  const source = "source" in event && event.source ? event.source : state.transitionSource

  switch (event.type) {
    case "select_company":
      return { level: "company", activeCompany: event.stockCode, transitionSource: source }
    case "open_dimension":
      return { ...state, level: "dimension", activeDimension: event.dimensionId, transitionSource: source }
    case "open_research":
      return {
        ...state,
        level: "claim",
        activeDimension: event.dimensionId,
        activeClaim: undefined,
        transitionSource: source,
      }
    case "select_claim":
      return { ...state, level: "claim", activeClaim: event.claimId, transitionSource: source }
    case "select_evidence":
      return { ...state, level: "evidence", activeEvidence: event.evidenceId, transitionSource: source }
    case "clear_evidence":
      return { ...state, level: "claim", activeEvidence: undefined, transitionSource: source }
    case "clear_claim":
      return { ...state, level: "dimension", activeClaim: undefined, transitionSource: source }
    case "back": {
      // 反向 semantic navigation（§24/§107）：evidence → claim → dimension → company → world
      switch (state.level) {
        case "evidence":
          return { ...state, level: "claim", activeEvidence: undefined, transitionSource: "back" }
        case "claim":
          return { ...state, level: "dimension", activeClaim: undefined, activeEvidence: undefined, transitionSource: "back" }
        case "dimension":
          return { ...state, level: "company", activeDimension: undefined, transitionSource: "back" }
        case "company":
          return { ...INITIAL_EXPERIENCE, transitionSource: "back" }
        default:
          return state
      }
    }
    case "zoom_out":
      return { ...INITIAL_EXPERIENCE, transitionSource: "zoom" }
    default:
      return state
  }
}

export interface BreadcrumbSegment {
  level: SemanticLevel
  label: string
  /** 点击该段需要触发的返回事件（反向 semantic transition） */
  backEvent: ExperienceEvent
}

/** Breadcrumb = semantic location indicator（§23），不是传统 navbar */
export function breadcrumbSegments(
  state: ExperienceState,
  labels: { company?: string; dimension?: string; claim?: string },
): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = []
  if (state.activeCompany && labels.company) {
    segments.push({ level: "company", label: labels.company, backEvent: { type: "select_company", stockCode: state.activeCompany, source: "back" } })
  }
  if (state.activeDimension && labels.dimension) {
    segments.push({ level: "dimension", label: labels.dimension, backEvent: { type: "open_dimension", dimensionId: state.activeDimension, source: "back" } })
  }
  if (state.activeClaim && labels.claim) {
    segments.push({ level: "claim", label: labels.claim, backEvent: { type: "select_claim", claimId: state.activeClaim, source: "back" } })
  }
  return segments
}

// ---------- Degradation（§1–§4/§49–§51/§110） ----------

export interface WorldAvailability {
  /** 公司解析成功（stockName 等 metadata 可用） */
  companyResolved: boolean
  /** Truth Layer 有可用证据 */
  truthAvailable: boolean
  /** composer 等 AI 解释环节状态 */
  aiStatus: "success" | "partial_failure" | "failed"
}

/**
 * 页面级错误只在「真的无法建立 World」时出现（§4）：
 * 公司解析失败 / Truth Layer 完全失败 / 无任何可用证据。
 * composer 部分失败绝不算页面失败（§2）。
 */
export function shouldShowGlobalError(a: WorldAvailability): boolean {
  return !a.companyResolved || !a.truthAvailable
}

export interface LocalizedDegradation {
  /** 该维度证据是否可用（Truth Layer 未受影响） */
  evidenceReady: boolean
  /** 该维度是否有 AI 解释 */
  interpretation: "ready" | "unavailable"
}

/** 降级状态本地化（§3/§49）：失败属于哪层就在哪层显示 */
export function degradationForDimension(
  hasClaims: boolean,
  aiStatus: WorldAvailability["aiStatus"],
): LocalizedDegradation {
  if (hasClaims) return { evidenceReady: true, interpretation: "ready" }
  if (aiStatus === "success") return { evidenceReady: true, interpretation: "unavailable" }
  return { evidenceReady: true, interpretation: "unavailable" }
}

// ---------- Motion state machines（§57–§59） ----------

export type ObjectVisualState =
  | "idle"
  | "hover"
  | "selected"
  | "peek"
  | "focused"
  | "degraded"
  | "parked"

export function dimensionVisualState(input: {
  parked: boolean
  degraded: boolean
  focused: boolean
  peekOpen: boolean
  selected: boolean
  hovered: boolean
}): ObjectVisualState {
  if (input.parked) return "parked"
  if (input.degraded) return "degraded"
  if (input.focused) return "focused"
  if (input.peekOpen) return "peek"
  if (input.selected) return "selected"
  if (input.hovered) return "hover"
  return "idle"
}

export type SuggestionVisualState = "ghost" | "hover" | "dragging" | "adding" | "ready" | "unknown" | "dismissed"

export function suggestionVisualState(input: {
  dismissed: boolean
  resolvedStatus?: "ready" | "unknown"
  adding: boolean
  dragging: boolean
  hovered: boolean
}): SuggestionVisualState {
  if (input.dismissed) return "dismissed"
  if (input.resolvedStatus === "ready") return "ready"
  if (input.resolvedStatus === "unknown") return "unknown"
  if (input.adding) return "adding"
  if (input.dragging) return "dragging"
  if (input.hovered) return "hover"
  return "ghost"
}

export type CompanyVisualState = "distant" | "neighbor" | "active" | "entering" | "research" | "leaving"

export function companyVisualState(input: {
  tier: "active" | "neighbor" | "distant"
  entering: boolean
  researching: boolean
  leaving: boolean
}): CompanyVisualState {
  if (input.entering) return "entering"
  if (input.researching) return "research"
  if (input.leaving) return "leaving"
  return input.tier
}

// ---------- 过渡时长（§61–§63） ----------

export const MOTION = {
  micro: "140ms",
  peek: "280ms",
  dimensionToResearch: "540ms",
  companyToCompanyWorld: "760ms",
  /** 任何核心动作不得让用户等待超过该阈值再开始操作（§63） */
  PRODUCTIVITY_THRESHOLD_MS: 900,
} as const
