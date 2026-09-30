// 同比解释护栏（Task 10 Part A）：
// 极端百分比在数学上正确，但经济解释可能失真（低基数放大 / 正负切换）。
// 本模块只产出「解释元数据」（flags + 模板化 note），**绝不修改 Metric.value**。
// 所有阈值集中配置，禁止散落。

export type MetricInterpretationFlag = "low_base" | "sign_flip_base" | "extreme_change"

export const INTERPRETATION_THRESHOLDS = {
  /** 上年同期绝对值 < 历史单季绝对值中位数 × 该比例 → low_base */
  LOW_BASE_RATIO: 0.1,
  /** |YoY| ≥ 该百分比 → extreme_change（仅表示需要谨慎解释，不证明低基数） */
  EXTREME_CHANGE_PCT: 500,
  /** 计算历史中位数所需的最少单季样本数 */
  MIN_HISTORY_SAMPLES: 4,
} as const

export interface InterpretationInput {
  /** 本期值（分子基准） */
  current: number
  /** 上年同期值（分母基准） */
  previous: number
  /** 该指标历史单季绝对值样本（用于建立 scale-aware 基准） */
  historicalAbsValues: number[]
}

export interface InterpretationResult {
  flags: MetricInterpretationFlag[]
  note?: string
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const NOTE_BY_FLAG: Record<MetricInterpretationFlag, string> = {
  low_base:
    "该同比变动幅度较大，且上年同期基数相对历史季度较低，因此百分比变化可能被低基数放大，建议结合绝对金额观察。",
  sign_flip_base:
    "同比比较涉及正负值切换，百分比结果的经济解释有限，应结合绝对金额观察。",
  extreme_change:
    "该同比变动幅度极大，百分比结果需要谨慎解释，建议结合绝对金额与业务背景观察。",
}

/**
 * 计算解释 flags（纯函数、scale-aware）。
 * 注意：即使 flags 非空，原始 YoY 数值仍保留在 Metric.value / 趋势序列中。
 */
export function computeInterpretation(input: InterpretationInput): InterpretationResult {
  const flags: MetricInterpretationFlag[] = []
  const { current, previous, historicalAbsValues } = input

  // sign flip：正负切换（传统 YoY 在此情形解释力极弱）
  if ((previous < 0 && current > 0) || (previous > 0 && current < 0)) {
    flags.push("sign_flip_base")
  }

  // low_base：上年同期绝对值相对自身历史季度中位数过小
  if (historicalAbsValues.length >= INTERPRETATION_THRESHOLDS.MIN_HISTORY_SAMPLES) {
    const med = median(historicalAbsValues.map((v) => Math.abs(v)))
    if (med !== null && med > 0 && Math.abs(previous) < med * INTERPRETATION_THRESHOLDS.LOW_BASE_RATIO) {
      flags.push("low_base")
    }
  }

  // extreme change：|YoY| ≥ 阈值
  if (previous !== 0) {
    const yoy = Math.abs((current / previous - 1) * 100)
    if (yoy >= INTERPRETATION_THRESHOLDS.EXTREME_CHANGE_PCT) {
      flags.push("extreme_change")
    }
  }

  if (flags.length === 0) return { flags }

  // 组合 note：低基数/符号切换优先于单纯的极端变化；其余 flag 作为附加说明
  const primary: MetricInterpretationFlag = flags.includes("low_base")
    ? "low_base"
    : flags.includes("sign_flip_base")
      ? "sign_flip_base"
      : "extreme_change"
  const extras = flags.filter((f) => f !== primary)
  const baseSentence = NOTE_BY_FLAG[primary]
  if (extras.length === 0) return { flags, note: baseSentence }
  const extraClause = `（同时涉及${extras
    .map((f) => INTERPRETATION_FLAG_LABELS[f])
    .join("、")}）`
  return { flags, note: baseSentence.replace(/。$/, "") + extraClause + "。" }
}

export const INTERPRETATION_FLAG_LABELS: Record<MetricInterpretationFlag, string> = {
  low_base: "低基数",
  sign_flip_base: "正负切换",
  extreme_change: "极端变化",
}
