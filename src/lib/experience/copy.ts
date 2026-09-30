// UI Copy 单一来源（Task 15 §50–§51/§64–§68）：
// - 主动词统一为 Explore（探索）；
// - 产品主 UI 禁止 "could not be completed" / "failed" / "error" 这类页面级失败语言，
//   除非用户真的无法继续工作（由 shouldShowGlobalError 决定是否展示）。
// 测试会扫描本文件与 observatory 组件，确保违禁词不回流。

export const PRIMARY_VERB = "Explore"

export const COPY = {
  exploreCompany: "Explore company",
  enterResearch: "Enter research",
  exploreRegion: "Explore region",
  exploreDimension: "Explore dimension",
  inspectEvidence: "Inspect evidence",
  returnToClaim: "Return to claim",
  /** 降级文案（局部，不是错误） */
  evidenceAvailable: "Evidence ready",
  interpretationUnavailable: "AI interpretation unavailable",
  interpretationTemporarilyUnavailable: "AI interpretation is temporarily unavailable.",
  /** 全局错误（仅当真的无法建立 World 时使用） */
  worldUnavailable: "This company could not be opened. Please try again.",
  /** UNKNOWN 维度（研究边界，非错误） */
  evidenceIncomplete: "Current evidence is incomplete.",
  /** Loading = semantic resolution（§52–§54），不做假流水线 */
  resolvingRegions: "Resolving research regions…",
} as const

/** 主 UI 违禁词（英文小写匹配；中文等价表达同样禁止） */
export const FORBIDDEN_UI_PHRASES = [
  "could not be completed",
  "operation failed",
  "an error occurred",
  "错误",
  "失败",
] as const

export function containsForbiddenUiPhrase(text: string): boolean {
  const lower = text.toLowerCase()
  return FORBIDDEN_UI_PHRASES.some((p) => lower.includes(p.toLowerCase()))
}
