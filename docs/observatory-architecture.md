# StockLens Observatory
## Interaction & Technical Architecture v1.0

---

# 0. 产品重新定义

StockLens 不再被定义为：

> 输入股票问题 → AI 返回一个诊断页面。

新的定义：

> **StockLens 是一个由 AI 根据公司、用户问题与真实证据动态构造的公司研究空间。用户可以进入这个空间，聚焦、展开、组合、质疑并继续扩展研究对象。**

一句英文定义：

> **An explorable evidence space for understanding a company.**

核心不再是：

```text
Chat
Dashboard
Cards
```

而是：

```text
Lens
Space
Objects
```

---

# 1. 三个核心概念

## 1.1 Space

每一家公司拥有一个：

```text
Company Research Space
```

这个空间不是固定页面模板。

它由当前公司的：

```text
公司属性
行业
当前问题
可用数据能力
Evidence
AI Research Framing
```

共同生成。

不同公司进入 StockLens 后：

**研究空间可以不同。**

---

## 1.2 Objects

空间中所有重要东西都成为：

```text
Research Object
```

包括：

```text
Company
Research Dimension
Claim
Evidence
Event
Unknown
Comparison Target
Time Point
Research Suggestion
```

用户操作的是这些对象。

而不是操作菜单。

---

## 1.3 Lens

Lens 是用户表达：

> “我现在想研究什么”

的统一机制。

Lens 可以通过：

```text
点击
Hover
拖动
组合
键盘
文字
未来语音
```

改变焦点。

因此：

> Text Prompt 是 Lens 的一种输入方式。

而不是整个产品。

---

# 2. 产品空间分为三层

## Layer 1｜Evidence Field

最底层。

表示当前研究对象真实拥有的证据拓扑。

FACT：

```text
稳定节点
```

INFERENCE：

```text
FACT 之间的连接
```

UNKNOWN：

```text
未闭合 / 模糊区域
```

CONFLICT：

```text
交叉 / 干涉关系
```

这层承担两件事：

```text
产品视觉背景
+
真实信息结构
```

禁止纯装饰粒子。

---

# 3. Layer 2｜Research Objects

Evidence Field 之上：

AI 将复杂 Evidence 组织成人能够研究的对象。

例如：

```text
增长韧性
盈利质量
现金转化
行业相对表现
估值上下文
近期事件
```

这些：

**不是固定 enum。**

是 AI 根据当前公司和问题生成的：

```text
Research Dimension
```

---

# 4. Layer 3｜Focused Research Surface

用户聚焦某一个 Object 后：

系统从空间模式进入：

```text
Reading Mode
```

显示：

```text
Claim
Evidence
Metric
Period
Comparison
Formula
Source
Unknown
Follow-up
```

也就是：

> 探索是空间式的。

> 阅读是编辑式 / 研究报告式的。

---

# 5. 维度机制重新设计

这是本次后端需要变化最大的地方之一。

当前：

```text
growth
profitability
cashflow
valuation
market
industry
risk
```

这些固定 enum 不应继续直接作为：

> 用户所看到的研究维度。

它们应该降级成：

## Internal Capability

即：

```text
系统有哪些证据能力
```

---

# 6. Capability Layer

内部仍然可以保留有限、稳定的能力枚举。

例如：

```text
financial_growth
profitability
cashflow
balance_sheet
operating_efficiency
valuation
market_price
market_benchmark
industry_market
industry_valuation
event
corporate_action
risk
```

它们是：

> 数据与 Evidence 能力。

用户通常不直接看到。

---

# 7. Research Dimension

真正暴露给用户的 Dimension：

由 AI 自由生成。

Schema：

```typescript
interface ResearchDimension {
  dimensionId: string;

  label: string;

  researchQuestion: string;

  description?: string;

  origin:
    | "ai_initial"
    | "ai_suggested"
    | "user";

  capabilityRefs: CapabilityKey[];

  status:
    | "ready"
    | "partial"
    | "unknown";

  rationale: string;

  priority: number;

  evidenceIds: string[];

  claimIds: string[];
}
```

---

# 8. AI 可以自由命名维度

例如：

美的集团。

可能生成：

```text
增长韧性
盈利质量
现金转化
行业相对表现
```

用户换一个问题：

```text
海外业务值得关注吗？
```

可能变成：

```text
海外增长
利润贡献
全球需求风险
当前证据缺口
```

不要求：

```text
增长
盈利
现金流
```

这些固定名字必须出现。

---

# 9. 但 AI 不能创造事实能力

这是最重要的边界。

AI 可以生成：

```text
渠道效率
```

但如果系统没有：

```text
渠道收入
门店
渠道成本
```

等可靠数据，

这张 Dimension 仍然可以生成。

状态：

```text
unknown
```

并显示：

> 当前证据不足以验证渠道效率。

所以：

```text
AI freedom
≠
AI fabrication
```

---

# 10. Dimension 实际生成公式

逻辑：

```text
Company Context
×
User Question
×
Capability Manifest
×
Current Evidence
↓
AI Research Framing
↓
Research Dimensions
```

---

# 11. Company Context

新增：

```typescript
interface CompanyContext {
  stockCode: string;
  stockName: string;

  industryName?: string;
  industryIndexCode?: string;

  industrySource?: string;
  industryVerifiedAt?: string;

  availableCapabilities: CapabilityKey[];
  unavailableCapabilities: CapabilityKey[];
}
```

---

# 12. 不需要固定 Company Archetype Blueprint

不要再实现：

```text
bank → fixed template A
manufacturing → fixed template B
pharma → fixed template C
```

这种方式太死。

行业 / 公司属性是：

```text
AI Research Framing 的 Context
```

不是：

```text
硬编码模板选择器
```

---

# 13. 多股票支持

当前完整 Demo：

```text
美的集团
```

继续保留。

但产品入口升级为：

```text
Search A-share
```

支持：

```text
Ticker
Company Name
```

---

# 14. Industry Resolver

当前：

```text
000333.SZ → 白色家电
```

是经过真实接口验证的静态映射。

要升级成通用能力。

推荐：

建立：

```text
Verified Industry Registry
```

由脚本通过：

```text
THS 一级行业目录
→ constituents
→ stock → industry
```

生成：

```text
stockCode
industryIndexCode
industryName
verifiedAt
source
```

JSON Registry。

运行时：

```text
O(1)
```

查表。

---

# 15. 为什么不运行时扫描 90 个行业

避免：

```text
每次换股票
→ 90 次行业 constituent API
```

太慢。

行业 Mapping 应该是：

```text
可更新的数据资产
```

而不是每次用户交互重新计算。

---

# 16. 新 Research Framer

当前 Planner：

主要负责：

```text
intent
+
fixed dimensions
```

新版拆成：

```text
Intent Understanding
+
Research Framing
```

Research Framer 输入：

```text
Company Context
User Question
Capability Manifest
```

注意：

仍然：

```text
不看金融数字
```

避免先看到结果再反向组织问题。

---

# 17. Research Framer 输出

```typescript
interface ResearchFrame {
  intent: string;

  dimensions: ResearchDimensionDraft[];

  suggestedDimensions: ResearchDimensionDraft[];

  framingReason: string;
}
```

---

# 18. AI Initial Dimension

默认：

```text
4–6 个
```

不要十几个。

用户第一次进入应该：

> 有明确起点。

而不是得到完整金融终端。

---

# 19. AI Suggested Dimension

除了正式 Dimension：

AI 可以生成：

```text
1–3 个 suggestedDimensions
```

它们不会自动加入空间。

显示为：

```text
半透明 Research Object
```

例如：

> StockLens Suggests

> 短期市场表现与中期趋势出现背离

> + Add to research

---

# 20. User-added Dimension

空间永远保留：

```text
+ Add dimension
```

用户可以直接输入：

```text
库存压力
海外业务
分红能力
研发投入
```

---

# 21. User Dimension Pipeline

```text
User Text
↓
Dimension Framer
↓
Capability Mapping
↓
Evidence Selection
↓
Dimension Synthesis
↓
Research Object
```

---

# 22. 如果无法验证

例如：

```text
海外业务
```

系统没有分地区数据。

仍然创建：

```text
海外业务
```

对象。

但状态：

```text
UNKNOWN
```

内容：

> 当前数据能力不足以验证这一研究方向。

并说明：

```text
需要什么数据
```

这本身就是：

> 一条研究结果。

---

# 23. Research Space Data Model

新增核心模型：

```typescript
interface ResearchSpace {
  spaceId: string;

  company: CompanyContext;

  entryQuestion?: string;

  dimensions: ResearchDimension[];

  claims: ResearchClaim[];

  evidence: Evidence[];

  suggestions: ResearchDimensionSuggestion[];

  createdAt: string;
}
```

---

# 24. Claim

当前 GroundedStatement 升级为：

```typescript
interface ResearchClaim {
  claimId: string;

  dimensionId: string;

  text: string;

  type:
    | "fact"
    | "inference"
    | "unknown";

  signal:
    | "positive"
    | "negative"
    | "conflict"
    | "neutral"
    | "unknown";

  evidenceIds: string[];
}
```

---

# 25. 为什么需要 Claim Layer

当前产品：

```text
AI Summary
↓
Evidence
```

新版：

```text
Research Dimension
↓
Claim
↓
Evidence
```

这样用户操作的对象更加明确。

---

# 26. Initial Research Synthesis

不应该：

每个 Dimension 单独调用一次 LLM。

否则：

```text
6 dimensions
=
6 LLM requests
```

太慢。

推荐：

一次：

```text
Research Space Composer
```

输出：

```text
overview
+
dimension summaries
+
claims
```

全部必须绑定 Evidence。

---

# 27. User-added Dimension 才单独调用

用户主动：

```text
+ Add Dimension
```

时：

只为新 Dimension：

```text
select evidence
+
dimension synthesis
```

不重新运行整个空间。

---

# 28. Evidence Packing

Task 09 已有：

```text
Evidence Context Packing
```

完全保留。

但升级为：

```text
Per-Dimension Evidence Pack
```

Research Dimension：

```text
capabilityRefs
↓
Evidence matching
↓
Packing
↓
Dimension Claims
```

---

# 29. 前端新主状态

页面不再：

```text
/
→ /diagnosis
```

然后传统 result page。

推荐：

```text
/research
```

作为新 Observatory。

---

# 30. 开发时不要立刻替换当前站点

保留：

```text
/diagnosis
```

作为：

```text
Legacy Stable Experience
```

新建：

```text
/observatory
```

或：

```text
/research
```

先开发。

验证完成后：

再切换：

```text
/
```

---

# 31. 前端状态机

核心状态：

```text
DISCOVERY
↓
ASSEMBLING
↓
SPACE_OVERVIEW
↓
DIMENSION_FOCUS
↓
CLAIM_FOCUS
↓
EVIDENCE_FOCUS
```

额外 overlay：

```text
COMMAND_LENS
ADD_DIMENSION
SUGGESTION_PREVIEW
CHALLENGE
```

---

# 32. Scene 01｜Discovery

整个视口。

视觉：

```text
dark
cinematic
spatial
```

中央：

```text
STOCKLENS

Understand a company
```

一个：

```text
Company Lens
```

---

# 33. Company Lens

不是传统 Input Border。

形态：

```text
光学 Lens / focus ring
```

用户开始输入：

```text
美的
```

候选公司在周围逐渐形成。

---

# 34. Candidate Interaction

例如：

```text
美的集团
000333.SZ

美的置业
...
```

目标公司靠近 Lens 中心：

视觉更清晰。

其他：

模糊 / 后退。

这可以只用：

```text
CSS transform
blur
opacity
```

实现。

不需要 WebGL。

---

# 35. Company Selected

点击：

```text
美的集团
```

发生：

```text
camera zoom-in
```

公司标识固定到空间中央：

```text
MIDEA GROUP
000333.SZ
白色家电
```

---

# 36. Assembly

不要假的：

```text
Step 1 ✓
Step 2 ✓
```

如果后端仍不是 streaming：

只展示：

```text
Building your evidence space…
```

背景 Evidence Field：

缓慢形成。

API 返回后：

真实 Dimension Objects：

依次进入空间。

---

# 37. Dimension Constellation

Company 在中央。

周边：

AI Research Dimensions。

不是固定位置模板。

使用：

```text
deterministic radial layout
```

根据：

```text
priority
status
evidence count
```

确定距离 / 大小。

---

# 38. Semantic Zoom

这是整个 UI 的关键设计。

同一个 Dimension：

不同 Zoom Level 下：

呈现不同内容。

---

# 39. Zoom Level 0

远处：

```text
盈利质量
```

只显示名字。

---

# 40. Zoom Level 1

Hover：

```text
盈利质量

3 verified
1 conflict
```

---

# 41. Zoom Level 2

Click / Focus：

Object 扩展成：

```text
盈利质量

毛利率下降
净利率下降
收入仍增长

[3 claims]
```

---

# 42. Zoom Level 3

进入 Claim：

显示完整：

```text
Claim
Evidence
Metric
Source
```

整个阅读区域切换成：

```text
light editorial surface
```

---

# 43. 双态视觉

## Discovery / Overview

```text
Dark Observatory
```

背景：

```text
#07090E
```

对象：

低亮度。

Evidence：

光点 / 连线。

---

# 44. Reading Mode

Research Object 展开以后：

中心区域变：

```text
warm ivory research sheet
```

例如：

```text
#F3F0E8
```

Ink：

```text
#111319
```

---

# 45. Evidence Type Color

颜色表达：

> 信息性质。

而不是：

> 股票好坏。

FACT：

```text
cyan / electric blue
```

INFERENCE：

```text
violet
```

UNKNOWN：

```text
amber
```

CONFLICT：

```text
coral / split stroke
```

---

# 46. Signal 不主要使用颜色

positive / negative：

尽量使用：

```text
icon
direction marker
label
```

避免：

```text
绿色 = 好股票
红色 = 坏股票
```

---

# 47. Claim Spine

聚焦 Dimension 后：

不显示 Card Wall。

显示：

```text
Claim Spine
```

例如：

```text
01 收入保持增长，但毛利率同比下降   ① ②

02 利润增速低于收入增速              ③ ④

03 经营现金流仍覆盖净利润             ⑤

┄┄ 尚不能确认 ┄┄
历史估值位置
```

---

# 48. Evidence Anchor

Evidence 不隐藏在：

```text
查看详情
```

后。

直接：

```text
①
②
③
```

出现在 Claim 旁。

---

# 49. Evidence Rail

桌面右侧：

常驻：

```text
Evidence Rail
```

不是 Drawer。

默认：

当前 Claim 的核心 Evidence。

---

# 50. Hover Evidence

Hover：

```text
①
```

Evidence Rail 立即变成：

```text
营业收入累计同比

+3.55%

2026-Q2
vs 2025-Q2

Fuyao
operating_income
```

无需点击。

---

# 51. Pin Evidence

Click：

```text
①
```

Pin 当前 Evidence。

此时 hover 其他 Anchor：

可以临时 preview。

退出：

恢复 pinned Evidence。

---

# 52. 深层技术信息

只有：

```text
formula
sourceFields
confidenceReason
interpretationNote
```

这种内容才进入：

```text
Evidence Inspector
```

可以是：

右侧 Rail 内展开。

原 Drawer 不必完全删除。

但降级。

---

# 53. Direct Manipulation

所有拖动：

必须表达：

```text
研究意图
```

不是让用户：

```text
排版页面
```

---

# 54. Dimension + Dimension

用户把：

```text
增长韧性
```

靠近：

```text
盈利质量
```

出现：

```text
Explore relationship
```

释放：

创建：

```text
增长是否以利润率为代价？
```

新的：

```text
Cross-Dimension Research Object
```

---

# 55. 第一版不一定立即实现 Combine

它属于：

```text
Interaction P1
```

首先必须实现：

```text
Dimension Focus
Add Dimension
Evidence Rail
Contextual Follow-up
```

Combine 可以第二轮加入。

---

# 56. Claim Interaction

Hover Claim：

出现：

```text
Focus
Ask
Challenge
History
```

只显示：

当前可用动作。

---

# 57. Contextual Follow-up

点：

```text
Ask
```

不要打开 Chat Window。

直接在 Claim 下面：

```text
Inline Research Thread
```

例如：

```text
02 利润增速低于收入增速

   为什么？

   ┌────────────────────────────┐
   │ 当前证据能够确认……        │
   │ 当前证据不能确认原因……    │
   └────────────────────────────┘
```

---

# 58. Existing Follow-up Backend

现有：

```text
/api/followup
```

可以继续复用。

增加：

```text
claimId
dimensionId
evidenceIds
```

作为上下文即可。

---

# 59. Challenge

新的交互。

用户：

```text
Challenge this claim
```

界面展开：

```text
SUPPORT

COUNTER-SIGNALS

UNKNOWN
```

---

# 60. Challenge 不额外让 LLM 编证据

SUPPORT：

```text
claim.evidenceIds
```

COUNTER-SIGNALS：

同 Dimension 内：

```text
conflict
+
opposite directional verified evidence
```

UNKNOWN：

同 Dimension：

```text
unknown evidence
```

---

# 61. 注意命名

不要说：

```text
Contradictory Evidence
```

除非真的存在严格逻辑矛盾。

使用：

```text
Counter-signals
```

更准确。

---

# 62. Add Dimension

空间里存在：

```text
+
```

对象。

Hover：

```text
Add research angle
```

---

# 63. Add Dimension Interaction

Click：

Lens 在原位置展开：

```text
What else do you want to understand?
```

用户：

```text
库存风险
```

---

# 64. AI Suggestions

输入框下方：

不是固定 prompt。

显示当前公司生成的：

```text
AI suggests

库存压力
资本投入
海外业务
分红能力
```

以实际 Research Framer 为准。

---

# 65. Dimension Added

新 Object：

从空间边缘进入。

如果 ready：

```text
solid
```

如果 partial：

```text
partially lit
```

如果 unknown：

```text
outline / translucent
```

---

# 66. UNKNOWN Dimension

例如：

```text
海外业务
```

系统没有数据。

显示：

```text
Current evidence incomplete

Missing:
regional revenue
overseas profit contribution
```

这不是 error。

---

# 67. Command Lens

底部中央：

```text
⌘K
```

或：

```text
Ask · Focus · Add · Compare
```

非常轻。

---

# 68. Command Lens 根据当前上下文变化

没有选对象：

```text
Ask company
Add dimension
Compare
```

选中 Dimension：

```text
Ask about 盈利质量
Compare with industry
View history
Combine
```

选中 Claim：

```text
Ask why
Challenge
Inspect evidence
```

---

# 69. 文本不是被删除

仍然支持：

```text
自然语言
```

甚至未来：

```text
voice
```

但它们是：

```text
control channel
```

而不是：

```text
primary UI
```

---

# 70. Evidence Field

背景使用：

```text
Canvas 2D / SVG
```

第一版不要上：

```text
Three.js
WebGL
```

除非确实需要。

---

# 71. Evidence Field Nodes

只显示：

当前空间最重要 Evidence。

不要：

```text
50 条 Evidence = 50 个发光粒子
```

推荐：

```text
12–20 visual nodes
```

---

# 72. Data-driven Background

Node：

来自真实：

```text
Evidence ID
```

Edge：

来自：

```text
basedOn
```

UNKNOWN：

来自：

```text
UNKNOWN Evidence
```

Conflict：

来自：

```text
conflict inference
```

---

# 73. Background Interaction

Hover Dimension：

只高亮：

属于该 Dimension 的 Evidence Cluster。

其他：

fade。

---

# 74. Loading Background

API 未返回前：

只显示：

```text
abstract unfocused field
```

不要出现假的 Evidence 节点。

结果返回后：

真实节点：

```text
morph in
```

---

# 75. Time Interaction

这个设计保留。

但第一版不实现：

```text
整个 Research Space 回到过去
```

因为当前后端还不能完整生成历史时点诊断。

---

# 76. Time v1

可以先实现：

```text
Timeline Inspector
```

用户聚焦：

```text
财务 / 市场 Claim
```

后：

底部出现：

```text
2025-Q4
2026-Q1
2026-Q2
```

拖动：

展示对应历史 Metric / Trend。

---

# 77. Full Time Travel

属于：

```text
P2
```

需要：

```text
historical point-in-time Evidence Engine
```

未来再做。

---

# 78. Compare

Compare 也是核心长期方向。

但建议：

```text
P2
```

不和这次 UI 重构一起强行完成。

---

# 79. Compare Interaction 设计先保留

用户：

拖第二只股票进入 Space。

Space：

分成：

```text
Company A
Company B
```

研究维度通过：

```text
capabilityRefs
```

而不是：

```text
dimension label exact match
```

进行对齐。

---

# 80. 前端技术变化

前端属于：

```text
Major Redesign
```

需要新增：

```text
ResearchSpaceCanvas
EvidenceField
CompanyLens
DimensionObject
ClaimSpine
EvidenceRail
CommandLens
InlineResearchThread
ChallengeView
AddDimensionLens
```

---

# 81. Motion

建议加入：

```text
Motion / Framer Motion
```

如果尚未安装。

主要使用：

```text
layout morph
shared layout
spring
stagger
opacity
blur
scale
```

不要大量粒子特效。

---

# 82. Motion Timing

Company zoom：

```text
500–700ms
```

Dimension reveal：

```text
60–100ms stagger
```

Focus morph：

```text
350–500ms
```

Evidence hover：

```text
100–160ms
```

---

# 83. Reduced Motion

必须支持：

```text
prefers-reduced-motion
```

关闭：

```text
large zoom
particles
parallax
```

---

# 84. Typography

建议：

主 UI：

```text
Geist / Inter
```

中文：

```text
PingFang SC
Microsoft YaHei UI
Noto Sans CJK SC
```

技术信息：

```text
Geist Mono / IBM Plex Mono
```

---

# 85. 前端状态

不把所有东西塞一个组件。

建议：

```text
ResearchSpaceProvider
```

管理：

```text
company
dimensions
selectedDimension
selectedClaim
hoverEvidence
pinnedEvidence
commandState
inlineThreads
```

---

# 86. 不需要后端持久化 Research Space

当前作业阶段：

不做账号。

Research Space 可以：

```text
client state
+
URL stockCode
+
entry question
```

刷新：

重新构建。

---

# 87. 后端改动分级

## 保持不动

```text
Fuyao Adapter
Normalization
Metric formulas
Evidence Engine
Evidence validation
Compliance
Low-base Guardrail
Event layer
```

---

# 88. 中度修改

```text
Planner
Evidence Selection
Synthesizer
Orchestrator
Follow-up Context
```

---

# 89. 新增

```text
Company Search
Company Context
Industry Registry
Research Framer
Research Dimension
Research Claim
Dimension Synthesis
Research Space Orchestrator
```

---

# 90. API 建议

不要把现有：

```text
POST /api/diagnosis
```

直接拆掉。

保留 legacy。

新增：

```text
GET /api/stocks/search?q=

POST /api/research/init

POST /api/research/dimension

POST /api/research/combine   // P1

POST /api/followup           // reuse
```

---

# 91. /api/research/init

Input：

```typescript
{
  stockCode: string;
  question?: string;
}
```

Output：

```text
CompanyContext
ResearchFrame
ResearchDimensions
Claims
Evidence
Suggestions
AI metadata
```

---

# 92. /api/research/dimension

Input：

```text
stockCode
dimensionText
currentDimensionLabels
optional entry question
```

Output：

```text
new ResearchDimension
Claims
Evidence
Unknowns
```

---

# 93. Dynamic Dimension Validator

必须检查：

```text
label length
research question length
duplicate semantic labels
capability refs valid
origin valid
evidence IDs valid
claims grounded
```

---

# 94. AI 自由但不能越权

允许 AI：

```text
起名字
决定研究角度
组合能力
建议下一步
```

不允许 AI：

```text
创造不存在的数据能力
创造 Evidence
创造 Metric
创造 Evidence ID
```

---

# 95. 新架构总链路

```text
Search Company
↓
Company Context
↓
Research Framer
↓
Dynamic Research Dimensions
↓
Capability Mapping
↓
Truth / Metric / Evidence
↓
Per-Dimension Evidence Packing
↓
Research Space Composer
↓
Validated Claims
↓
Observatory UI
```

---

# 96. User-added Dimension

```text
User adds “库存压力”
↓
Dimension Framer
↓
Capability Mapping
↓
Available Evidence?
├─ Yes → Pack → Synthesis → Claims
└─ No  → UNKNOWN Dimension
↓
Insert Object into Space
```

---

# 97. 原系统不是废掉

非常重要。

当前 StockLens：

已经是：

```text
Stable V1
```

新 Observatory：

属于：

```text
V2 Interaction Layer
```

开发过程中：

不要破坏 V1。

---

# 98. 开发顺序

### Phase 0

同步：

```text
README
tests count
known boundaries
```

把旧文档修掉。

---

### Phase 1

Backend Foundation：

```text
Company Search
Industry Registry
Company Context
Research Framer
Dynamic Dimension Schema
```

不改 UI。

---

### Phase 2

Research API：

```text
/api/research/init
/api/research/dimension
Research Space Composer
Claim Validator
```

---

### Phase 3

Observatory UI：

```text
Discovery
Company Lens
Space Overview
Dynamic Dimension Objects
Semantic Zoom
```

---

### Phase 4

Evidence Interaction：

```text
Claim Spine
Evidence Rail
Pin / Hover
Inline Follow-up
```

---

### Phase 5

AI-native Interaction：

```text
Add Dimension
AI Suggested Dimension
Challenge
```

---

### Phase 6

Polish：

```text
Evidence Field
Motion
Dark → Light transition
Responsive
Accessibility
```

---

# 99. 暂时不实现

为了避免一次做爆：

```text
Voice
Full historical time travel
Drag-to-compare
Dimension combination
Three.js
多人研究
账号
持久化
```

这些：

设计保留。

实现后置。

---

# 100. 第一版必须实现的创新交互

如果只允许保留四个：

必须是：

```text
1. Dynamic AI Research Dimensions
2. Semantic Zoom Research Space
3. Claim ↔ Evidence Rail
4. User-added Dimension
```

这四个已经足够让 StockLens：

明显区别于：

```text
Chatbot
Dashboard
传统股票 App
```

---

# 101. 第二优先

如果时间允许：

```text
5. AI Suggested Dimension
6. Inline Follow-up
7. Challenge Claim
8. Evidence Field
```

---

# 102. 第三优先

实验性质：

```text
Dimension Combine
Timeline
Compare Space
Voice
```

---

# 103. 最终设计原则

每次准备增加一个交互时问：

> 用户是不是在直接操作“研究对象”？

如果不是：

很可能又回到了：

```text
Button
Form
Page
Chat
```

传统范式。

---

# 104. 最终体验目标

用户第一次进入：

不是：

> “这是一个漂亮的 AI 股票问答产品。”

而是：

> **“我进入了一家公司的研究空间。”**

用户第一次操作：

不是：

> “我又问了 AI 一个问题。”

而是：

> **“我改变了自己研究这家公司的方式。”**

用户第一次查看 Evidence：

不是：

> “AI 给了引用。”

而是：

> **“这个结论本身就是从这些证据长出来的。”**

这就是 StockLens Observatory 的设计目标。