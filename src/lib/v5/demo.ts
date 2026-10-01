// Task 16.1 §24–§38：Guided Demo V2 —— 6 个场景的有向视觉走查。
// 同一时刻只允许一个焦点事件；字幕固定一处；不等待任何后端（只用已加载 payload）。
// 本文件只描述"什么时候做什么、说什么"，动作仍由既有 UI action 执行。

export type DemoActionKind =
  | "pan"
  | "hover-dimension"
  | "open-aperture"
  | "open-reading"
  | "select-evidence"
  | "focus-ai-typing"
  | "clear-ai-input"
  | "open-add-dimension"
  | "open-shelf"
  | "close-reading"

export interface DemoScene {
  id: string
  /** 场景内按时间点排布的动作（同一时刻只做一件事） */
  actions: { atMs: number; kind: DemoActionKind }[]
  /** 场景内按时间点排布的字幕（最多 1 标题 + 1 句话） */
  captions: { atMs: number; title: string; text: string }[]
  ms: number
  /** 虚拟指针位置（视口归一化） */
  pointer: { x: number; y: number }
  trail?: { x: number; y: number }
}

// Task 17.1 §P2：总时长约 30 秒（3.5 / 4 / 4.5 / 7 / 5 / 6）。
// 节奏靠"减少空等待 + 收紧 hold"实现，不是让多个动作同时发生：
// 每个 Scene 仍然只有一个主要重点，Scene 4 保留最长阅读时间（Reading 稳定后再进 Evidence）。
export const DEMO_SCENES: DemoScene[] = [
  {
    id: "explore",
    actions: [{ atMs: 200, kind: "pan" }],
    captions: [{ atMs: 700, title: "EXPLORE", text: "拖动画布，探索公司的研究空间。" }],
    ms: 3500,
    pointer: { x: 0.62, y: 0.5 },
    trail: { x: 0.44, y: 0.46 },
  },
  {
    id: "dimension",
    actions: [{ atMs: 200, kind: "hover-dimension" }],
    captions: [{ atMs: 600, title: "DYNAMIC DIMENSION", text: "AI 根据公司类型与当前问题生成研究维度。" }],
    ms: 4000,
    pointer: { x: 0.54, y: 0.3 },
  },
  {
    id: "focus",
    actions: [{ atMs: 250, kind: "open-aperture" }],
    // 等位移落定后再出字幕
    captions: [{ atMs: 1200, title: "FOCUS", text: "点击一个维度，把研究空间聚焦到当前问题。" }],
    ms: 4500,
    pointer: { x: 0.55, y: 0.34 },
  },
  {
    id: "reading-evidence",
    actions: [
      { atMs: 200, kind: "open-reading" },
      // 先让 Reading 状态稳定（约 3.4s），再进入 Evidence
      { atMs: 3600, kind: "select-evidence" },
    ],
    captions: [
      { atMs: 900, title: "READING", text: "沿结论继续深入。" },
      { atMs: 3900, title: "EVIDENCE", text: "每条关键结论都可以回到指标、期次和来源。" },
    ],
    ms: 7000,
    pointer: { x: 0.78, y: 0.62 },
  },
  {
    id: "ai-lens",
    actions: [{ atMs: 250, kind: "focus-ai-typing" }],
    captions: [{ atMs: 700, title: "AI RESEARCH LENS", text: "任何时候都可以直接问 AI，当前研究上下文会自动带入。" }],
    ms: 5000,
    pointer: { x: 0.5, y: 0.93 },
  },
  {
    id: "extend-shelf",
    actions: [
      // 先回到 Canvas，否则 Reading 的面包屑会占住头部，研究架打开也看不见
      { atMs: 150, kind: "close-reading" },
      { atMs: 600, kind: "open-add-dimension" },
      { atMs: 2800, kind: "open-shelf" },
      { atMs: 5200, kind: "clear-ai-input" },
    ],
    captions: [{ atMs: 700, title: "EXTEND & SHELF", text: "补充研究角度，并保存公司，随时继续研究。" }],
    ms: 6000,
    pointer: { x: 0.8, y: 0.7 },
  },
]

export const DEMO_TOTAL_MS = DEMO_SCENES.reduce((sum, s) => sum + s.ms, 0)

/** Scene 5 的演示打字文本（不提交） */
export const DEMO_TYPED_QUESTION = "为什么利润增速弱于收入？"
/** Scene 6 的示范研究角度（不提交） */
export const DEMO_ANGLE_PLACEHOLDER = "库存压力"
/** 结束帧文案 */
export const DEMO_FINAL_FRAME = { line1: "Evidence first.", line2: "Conclusions second.", cta: "开始研究 →" }

export function clampSceneIndex(index: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.min(Math.max(0, Math.trunc(index)), DEMO_SCENES.length - 1)
}

export function sceneAt(index: number): DemoScene {
  return DEMO_SCENES[clampSceneIndex(index)]
}

export function sceneBy(index: number, dir: 1 | -1): number {
  return clampSceneIndex(clampSceneIndex(index) + dir)
}

export function isLastScene(index: number): boolean {
  return clampSceneIndex(index) === DEMO_SCENES.length - 1
}
