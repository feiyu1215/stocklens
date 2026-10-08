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
  | "close-ai"
  | "clear-ai-input"
  | "close-add-angle"
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

// Task 17.1 §P2：总时长约 30 秒；2026-10 演示对齐当前 UI：
// 原 Scene 6（补角度+开面板混在 6 秒里）拆为 EXTEND / SWITCH 两幕，
// SWITCH 对应右上角「更换公司」搜索面板（含空搜索提示与 ☆ 已保存列表）。
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
    id: "extend",
    actions: [
      // 先回到 Canvas 并清掉演示输入；再收起 Scene 5 打开的研究助手侧板——
      // 否则侧板会盖住 ADD 弹窗和右上角的公司搜索面板
      { atMs: 150, kind: "close-reading" },
      { atMs: 400, kind: "close-ai" },
      { atMs: 700, kind: "clear-ai-input" },
      { atMs: 1100, kind: "open-add-dimension" },
    ],
    captions: [{ atMs: 900, title: "EXTEND", text: "补充你想看的研究角度，AI 会生成对应的新维度。" }],
    ms: 4000,
    // ADD RESEARCH ANGLE 输入框居中弹出（left-1/2 top-1/2，360px 宽）
    pointer: { x: 0.5, y: 0.52 },
  },
  {
    id: "switch",
    actions: [
      // 收起 Scene 6 的 ADD 弹窗，让画面只聚焦公司搜索面板
      { atMs: 200, kind: "close-add-angle" },
      { atMs: 500, kind: "open-shelf" },
    ],
    captions: [{ atMs: 800, title: "SWITCH COMPANY", text: "输入代码或名称随时换一家接着研究，☆ 标过的就在列表顶部。" }],
    ms: 5000,
    // 公司搜索面板挂在头部右侧（right-0 top-10，340px 宽）
    pointer: { x: 0.84, y: 0.3 },
  },
]

export const DEMO_TOTAL_MS = DEMO_SCENES.reduce((sum, s) => sum + s.ms, 0)

/** Scene 5 的演示打字文本（不提交） */
export const DEMO_TYPED_QUESTION = "为什么利润增速弱于收入？"
/** Scene 6 的示范研究角度（不提交） */
export const DEMO_ANGLE_PLACEHOLDER = "库存压力"
/** 结束帧文案（line3：研究库入口——用户「随时回来」的真正入口） */
export const DEMO_FINAL_FRAME = {
  line1: "Evidence first.",
  line2: "Conclusions second.",
  line3: "研究库存档你的每一次研究，随时回来接着看。",
  cta: "开始研究 →",
}

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
