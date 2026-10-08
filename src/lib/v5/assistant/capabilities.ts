// P1 AI 助手 —— 能力注册表（docs/plans/2026-10-08-P1-AI助手-能力注册与实现.md）
//
// 定位纪律（外部评审两轮收敛）：
// 1. 能力注册表是底座，模型只是兜底——即使 AI 接口完全不可用，确定性导航与研究流程正常；
// 2. 产品帮助只能来自本清单，不允许模型凭常识猜测产品有哪些能力；
// 3. 所有动作由确定性代码执行，模型输出只是"待验证的操作建议"；
// 4. 本模块必须 client-safe：不 import 任何 server-only 模块。

// ---- 六类内部意图 ----

export type AssistantIntent =
  | "navigate"
  | "product_help"
  | "concept_explain"
  | "company_research"
  | "compare"
  | "unsupported"

export type Availability = "ready" | "needs_input" | "unavailable"

// ---- 动作白名单（ActionExecutor 只执行这里注册的动作） ----

export type ActionId =
  | "navigate.home"
  | "navigate.library"
  | "navigate.compare"
  | "company.open"
  | "search.focus"

export interface ActionDef {
  id: ActionId
  /** 操作卡片上的按钮文案 */
  label: string
  /** 需要的参数（执行前由 ActionExecutor 校验） */
  params: ("stockCode" | "stockCodes")[]
}

export const ACTION_REGISTRY: Record<ActionId, ActionDef> = {
  "navigate.home": { id: "navigate.home", label: "回到首页", params: [] },
  "navigate.library": { id: "navigate.library", label: "打开研究库", params: [] },
  "navigate.compare": { id: "navigate.compare", label: "打开双公司对比", params: ["stockCodes"] },
  "company.open": { id: "company.open", label: "打开研究空间", params: ["stockCode"] },
  "search.focus": { id: "search.focus", label: "去选一家公司", params: [] },
}

/** 一条可执行的操作计划（由调度层产出，ActionExecutor 消费） */
export interface PlannedAction {
  action: ActionId
  /** 已通过校验的参数 */
  stockCode?: string
  stockName?: string
  stockCodes?: { stockCode: string; stockName: string }[]
}

/** 待用户澄清的实体候选（公司名歧义时展示） */
export interface ClarifyCompany {
  stockCode: string
  stockName: string
}

// ---- 调度结果（客户端渲染的统一形状） ----

export interface AssistantResolution {
  intent: AssistantIntent
  /** 给用户看的一句话回复（受限回答 / 说明 / 澄清请求） */
  reply: string
  /** 可直接执行的操作（可能为空） */
  actions?: PlannedAction[]
  /** 公司歧义时的候选（配合 needs_input） */
  clarifyCompanies?: ClarifyCompany[]
  /** 澄清时提示用户补充什么 */
  needInputHint?: string
  /** 概念解释请求（由面板再调 explain 接口） */
  explainTerm?: string
  availability: Availability
}

// ---- 产品功能清单（Product Help 的唯一可信来源） ----

export interface ProductFeature {
  id: string
  name: string
  /** 一句话说明 */
  desc: string
  /** 所在页面 */
  page: string
  /** 真实操作路径 */
  how: string
  /** 前置条件 / 限制 */
  limits: string
}

export const PRODUCT_FEATURES: ProductFeature[] = [
  {
    id: "company.search",
    name: "公司搜索",
    desc: "按公司名或股票代码检索 A 股（沪深北），选择后进入研究空间",
    page: "首页 / 研究空间右上角「更换公司」",
    how: "在搜索框输入公司名或 6 位代码，从结果中选择，回车进入研究",
    limits: "仅覆盖 A 股；港股、美股不在范围内",
  },
  {
    id: "research.question",
    name: "研究问题",
    desc: "进入研究空间前可填写一个你最想先回答的问题，研究将围绕它展开",
    page: "首页",
    how: "选中公司后在问题框输入，随研究一起生成",
    limits: "问题依附于所选公司；没有公司时不会展开问题区",
  },
  {
    id: "research.library",
    name: "研究库",
    desc: "查看所有已进入过研究空间的公司及其研究状态",
    page: "顶栏「研究库」或 /research",
    how: "点击任意公司行回到该公司的研究空间",
    limits: "研究内容仅保存在本机；缓存被清理后重新打开会自动重新生成",
  },
  {
    id: "research.compare",
    name: "双公司对比",
    desc: "在研究库选中恰好两家公司，按固定指标目录做同口径并排对比",
    page: "研究库 → 「对比」模式",
    how: "开启对比开关，点选两家公司，点击「开始对比」",
    limits: "需要两家的研究数据都在本机；报告期不同的指标只并列参考不算差值；不含 AI 综合结论",
  },
  {
    id: "sidekick.followup",
    name: "研究助手（追问）",
    desc: "在研究空间内围绕当前公司的真实证据继续追问",
    page: "研究空间右侧 AI 面板",
    how: "打开 AI 面板输入问题，回答基于当前公司证据并可溯源",
    limits: "只在研究空间内可用；每家公司独立；不提供投资建议",
  },
  {
    id: "notes.export",
    name: "导出研究笔记",
    desc: "把当前研究空间整理成可打印的笔记（含证据、口径与免责声明）",
    page: "研究空间顶栏「导出笔记」",
    how: "点击后生成打印版，使用浏览器打印/存为 PDF",
    limits: "需要先有研究空间；打印由浏览器完成",
  },
  {
    id: "evidence.refresh",
    name: "证据快刷",
    desc: "数据过期时一键重算证据层；受影响的结论会打上「更新前生成」标记",
    page: "研究空间顶栏（数据过期时出现）",
    how: "点击顶栏的快速刷新，之后可对单个维度「重新组织」",
    limits: "只刷新时效性证据；报告期类证据不动；需要网络",
  },
  {
    id: "assistant.explain",
    name: "金融概念解释",
    desc: "解释市盈率、ROE、TTM 等金融/财务概念，不涉及任何公司的真实数值",
    page: "AI 助手（首页 / 研究库）",
    how: "直接问「ROE 是什么意思」",
    limits: "不含个股数据与投资建议；公司相关问题会引导进入研究空间",
  },
]

/** 按关键词粗查功能清单（确定性；查不到返回 null，不允许模型编造） */
export function findProductFeature(query: string): ProductFeature | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const rules: { id: string; keys: string[] }[] = [
    { id: "research.compare", keys: ["对比", "比较"] },
    { id: "notes.export", keys: ["导出", "笔记", "打印"] },
    { id: "evidence.refresh", keys: ["刷新", "快刷", "过期"] },
    { id: "sidekick.followup", keys: ["追问", "证据", "溯源", "面板"] },
    { id: "company.search", keys: ["搜索", "找公司", "选公司"] },
    { id: "research.question", keys: ["研究问题", "问题框"] },
    { id: "research.library", keys: ["研究库", "库"] },
    { id: "assistant.explain", keys: ["概念", "解释"] },
  ]
  for (const rule of rules) {
    if (rule.keys.some((key) => q.includes(key))) {
      return PRODUCT_FEATURES.find((f) => f.id === rule.id) ?? null
    }
  }
  return null
}
