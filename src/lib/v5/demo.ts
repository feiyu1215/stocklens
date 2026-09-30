// Task 16 PART C：Guided Demo —— 状态驱动的交互式导览（不是视频）。
// 只描述"每一步做什么 + 说什么"，由 DemoController 调用既有 UI action 执行；
// 本文件不含业务逻辑，也不产生任何数据（§22/§27/§28）。

export type DemoActionKind =
  | "pan"
  | "hover-dimension"
  | "open-aperture"
  | "open-reading"
  | "select-evidence"
  | "focus-ai"
  | "open-add-dimension"
  | "open-shelf"

export interface DemoStep {
  id: string
  /** 每步最多 1 个标题 + 1 句话（§30） */
  title: string
  caption: string
  /** 停留时长（毫秒） */
  ms: number
  action: DemoActionKind
  /** 虚拟指针位置：视口归一化坐标 */
  pointer: { x: number; y: number }
  /** 可选的轻微轨迹终点（reduced motion 下不播放） */
  trail?: { x: number; y: number }
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "canvas",
    title: "Research Canvas",
    caption: "拖动画布探索研究空间 —— 这里是这家公司的全部研究维度。",
    ms: 7000,
    action: "pan",
    pointer: { x: 0.62, y: 0.5 },
    trail: { x: 0.4, y: 0.44 },
  },
  {
    id: "dimension",
    title: "Dynamic Dimensions",
    caption: "每个研究维度由 AI 依据公司类型与你的问题动态生成。",
    ms: 7000,
    action: "hover-dimension",
    pointer: { x: 0.55, y: 0.3 },
  },
  {
    id: "aperture",
    title: "Focus Aperture",
    caption: "点击维度，只展开当前研究焦点 —— 事实、冲突与 Evidence 数量。",
    ms: 8000,
    action: "open-aperture",
    pointer: { x: 0.55, y: 0.34 },
  },
  {
    id: "reading",
    title: "Reading",
    caption: "沿结论继续深入，而不是只看一句 AI 总结。",
    ms: 9000,
    action: "open-reading",
    pointer: { x: 0.78, y: 0.62 },
  },
  {
    id: "evidence",
    title: "Evidence",
    caption: "每条关键结论都可以回到期次、指标、来源和计算口径。",
    ms: 9000,
    action: "select-evidence",
    pointer: { x: 0.86, y: 0.42 },
  },
  {
    id: "ai-lens",
    title: "AI Research Lens",
    caption: "任何时候都可以直接问 StockLens，问题会自动携带当前公司与研究上下文。",
    ms: 8000,
    action: "focus-ai",
    pointer: { x: 0.5, y: 0.94 },
  },
  {
    id: "add-dimension",
    title: "Add Research Angle",
    caption: "你也可以自己添加研究角度；证据不足时系统会明确标记为 UNKNOWN。",
    ms: 8000,
    action: "open-add-dimension",
    pointer: { x: 0.72, y: 0.7 },
  },
  {
    id: "shelf",
    title: "Research Shelf",
    caption: "保存研究过的公司，并快速切换研究现场。",
    ms: 7000,
    action: "open-shelf",
    pointer: { x: 0.86, y: 0.08 },
  },
]

export const DEMO_TOTAL_MS = DEMO_STEPS.reduce((sum, s) => sum + s.ms, 0)

export function clampStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.min(Math.max(0, Math.trunc(index)), DEMO_STEPS.length - 1)
}

export function stepAt(index: number): DemoStep {
  return DEMO_STEPS[clampStepIndex(index)]
}

/** ← / → 步进（循环夹紧，不越界） */
export function stepBy(index: number, dir: 1 | -1): number {
  return clampStepIndex(clampStepIndex(index) + dir)
}

export function isLastStep(index: number): boolean {
  return clampStepIndex(index) === DEMO_STEPS.length - 1
}
