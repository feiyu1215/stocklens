# StockLens｜AI Native 个股多维诊断与证据验证
## PRD & ZCode 开发执行计划 v1.0

版本：v1.0  
日期：2026-09-30  
开发方式：Spec-driven AI Coding + 受控 Vibe Coding  
首版目标：24 小时内完成一个可访问、可实际操作、关键结论可追溯的 Web 产品。

> 本文件为 StockLens 唯一权威 PRD。ZCode 开发前必须通读；所有 Task Prompt 的 Context 均引用本文件。

---

# 0. 一句话定义

StockLens 不是一个"AI 帮你判断股票好不好"的产品。

它是一个：

> **AI 根据用户问题组织金融数据与证据，帮助用户理解一家公司的当前状态，并让每一个重要判断都能够回到原始数据或原始材料继续验证的个股研究工具。**

核心原则：

> **Evidence First, Conclusion Second.**

即：

**先有证据，再有结论。**

---

# 1. 本次作业成功标准

本次作业不追求：

- 覆盖全部 A 股；
- 搭建完整金融终端；
- 做复杂多 Agent；
- 做预测；
- 做推荐；
- 做自动交易。

本次只要求把一条主链真正跑通：

```text
选择股票 / 输入问题
↓
识别研究意图
↓
确定本轮需要查看的维度
↓
调用真实金融数据
↓
代码计算确定性指标
↓
构建 Evidence
↓
AI 基于 Evidence 解释
↓
Validation 校验
↓
展示诊断结果
↓
点击结论查看证据
↓
沿证据继续追问
```

完成后用户必须能够回答：

1. AI 为什么得到这个结论？
2. 结论依据哪些数据？
3. 数据是什么报告期？
4. 数据来自哪里？
5. 哪部分是事实？
6. 哪部分只是推断？
7. 哪些问题目前还无法验证？

---

# 2. MVP 产品范围

## 2.1 默认股票

默认：

**美的集团 000333.SZ**

原因：

- 业务模式直观；
- 财务结构相对规范；
- 收入、利润、现金流、盈利能力、估值、行情均可分析；
- 行业比较具有实际意义。

注意：

开发第一阶段必须先验证数据接口。

如果扶摇对该股票关键字段覆盖不足，可切换为数据覆盖更稳定的非金融 A 股公司。

**股票名称不是硬约束，完整主链才是硬约束。**

---

# 3. 用户与用户任务

## 3.1 目标用户

希望快速研究一家上市公司，但不满足于：

- AI 长篇总结；
- 简单评分；
- "好公司 / 坏公司"标签；
- 买卖建议。

用户更关心：

> "现在到底发生了什么？"

> "这个判断有什么证据？"

> "哪些地方存在矛盾？"

> "接下来我应该继续验证什么？"

---

# 4. 首版核心用户故事

用户进入 StockLens。

页面默认展示：

```text
美的集团
000333.SZ
```

用户输入：

> 现在经营情况怎么样？

系统执行诊断。

最终告诉用户：

### 可以确认的事实

例如：

- 最新报告期营业收入同比增长 X%；
- 净利润同比增长 X%；
- 经营活动现金流同比下降 X%。

### 基于事实形成的推断

例如：

> 利润增长暂未得到经营现金流同步验证。

### 当前矛盾

例如：

> 净利润增长，但现金流走弱。

### 当前无法验证

例如：

> 现有数据不足以判断下一季度成本压力是否缓解。

用户点击：

> 净利润增长，但现金流走弱

右侧打开证据详情。

展示：

- 净利润当前值；
- 上年同期值；
- 同比；
- 经营现金流当前值；
- 上年同期值；
- 同比；
- 报告期；
- 单位；
- 来源；
- 计算公式。

用户继续问：

> 为什么会出现这种背离？

系统基于当前 Evidence 回答。

---

# 5. 三层产品架构

整个产品划分为三层。

## 5.1 Truth Layer

负责：

> 什么是真实存在的数据和确定性结果。

包括：

```text
Fuyao / iFinD
↓
Raw Data
↓
Data Normalization
↓
Metric Engine
↓
Evidence Engine
```

原则：

**LLM 不得成为事实来源。**

---

## 5.2 Intelligence Layer

负责：

> 用户的问题应该怎么看，以及怎么解释证据。

包括：

```text
Intent / Planner
↓
Evidence Interpretation
↓
Diagnosis Synthesis
↓
Follow-up Research
```

原则：

LLM 可以：

- 理解问题；
- 选择诊断维度；
- 解释证据；
- 总结多个 Evidence；
- 建议继续研究方向。

LLM 不可以：

- 自己计算核心数字；
- 自己生成不存在的金融数据；
- 自己假设行业数据；
- 把推测写成事实。

---

## 5.3 Experience Layer

负责：

> 用户如何使用和验证分析。

包括：

- 股票入口；
- 问题输入；
- Loading Workflow；
- Summary；
- Evidence Cards；
- 诊断维度；
- Charts；
- Evidence Drawer；
- Follow-up；
- Error States。

这一层允许更多 Vibe Coding。

---

# 6. 产品页面

P0 只要求：

## 页面 A：首页 / 诊断输入

Route：

```text
/
```

包括：

### 股票信息

- 股票名；
- 股票代码；
- 行业；
- 最新行情日期；
- 最新财务报告期。

### 输入框

Placeholder：

> 你想了解这家公司什么？

默认示例：

> 公司现在经营情况怎么样？

快捷问题：

- 经营情况
- 盈利质量
- 现金流
- 当前估值
- 最近行情
- 风险与异常

---

## 页面 B：诊断结果

Route 可采用：

```text
/diagnosis/[id]
```

包括：

1. Diagnosis Header
2. Summary
3. Evidence Overview
4. Dimension Cards
5. Evidence Drawer
6. Follow-up Research

---

# 7. 输入准备 Input Preparation

任何 AI 调用之前先建立本次诊断上下文。

输入：

```json
{
  "stock_code": "000333.SZ",
  "question": "现在经营情况怎么样？"
}
```

系统检查：

### 股票合法性

股票代码是否存在。

### 数据期次

确定：

- latest_trade_date；
- latest_financial_period。

不要硬编码"今天"。

### Data Availability

确认本轮能够获取：

- 财务；
- 估值；
- 行情；
- 行业；
- 公告。

生成：

```json
{
  "stock_code": "000333.SZ",
  "question": "现在经营情况怎么样？",
  "latest_trade_date": "",
  "latest_financial_period": "",
  "available_sources": [],
  "missing_sources": [],
  "created_at": ""
}
```

这就是：

```text
Diagnosis Context
```

之后所有 AI Task 使用同一个 Context。

---

# 8. AI Planner

## 8.1 任务

Planner 只判断：

> 用户当前问题应该看哪些东西。

例如：

用户：

> 现在经营情况怎么样？

输出：

```json
{
  "intent": "overall_business_diagnosis",
  "dimensions": [
    "growth",
    "profitability",
    "cashflow"
  ],
  "optional_dimensions": [
    "valuation",
    "market"
  ],
  "reason": "用户询问整体经营状态，优先分析收入、利润、盈利能力和现金流。"
}
```

---

## 8.2 Planner 禁止事项

Planner 不能输出：

> 公司经营改善。

不能输出：

> 股票估值偏低。

不能分析实际金融事实。

只负责：

```text
What to inspect
```

---

# 9. 诊断 Dimension

P0 推荐六大维度。

## 9.1 Growth

经营增长。

核心字段：

- revenue
- revenue_yoy
- net_profit
- net_profit_yoy
- revenue_recent_periods
- profit_recent_periods

---

## 9.2 Profitability

盈利能力。

优先：

- gross_margin
- net_margin
- roe
- margin_change

---

## 9.3 Cashflow

现金流质量。

优先：

- operating_cashflow
- operating_cashflow_yoy
- net_profit
- cfo_to_net_profit

---

## 9.4 Valuation

估值。

优先：

- PE TTM
- PB
- PE historical percentile
- industry PE median

如果 PE 无意义：

切换 PB 等可用指标。

不能把负 PE 强行解释为"便宜"。

---

## 9.5 Market

行情特征。

计算：

- 20D return
- 60D return
- 120D return
- volatility
- max drawdown

有基准数据时再计算：

- vs CSI300
- vs industry

---

## 9.6 Industry / Event Risk

行业位置、公告和风险。

P0 可以较轻：

行业数据可用：

→ 展示。

不可用：

→ UNKNOWN。

公司公告可用：

→ 最多展示 3–5 个近期重要事件。

不要在首版开发完整事件 Agent。

---

# 10. Data Adapter

所有外部数据统一经过 Adapter。

禁止：

页面直接调用扶摇并理解字段。

统一结构：

```text
External API
↓
Adapter
↓
Normalized Internal Model
```

例如：

```typescript
interface FinancialPeriodData {
  stockCode: string
  period: string

  revenue?: number
  revenueYoY?: number

  netProfit?: number
  netProfitYoY?: number

  operatingCashflow?: number
  operatingCashflowYoY?: number

  grossMargin?: number
  netMargin?: number
  roe?: number
}
```

---

# 11. Metric Engine

原则：

> 能够通过确定性代码完成的计算，不交给 LLM。

至少包括：

```text
YoY
Margin Change
Trend
CFO / Net Profit
Historical Percentile
20D Return
60D Return
Volatility
Max Drawdown
Relative Return
```

统一输出：

```json
{
  "metric_id": "METRIC_REVENUE_YOY",
  "name": "营业收入同比",
  "value": 12.3,
  "unit": "%",
  "period": "2026H1",
  "source_fields": [
    "revenue_current",
    "revenue_previous"
  ],
  "calculation_method": "..."
}
```

---

# 12. Evidence Domain Model

这是整个项目最重要的数据对象。

推荐：

```typescript
type EvidenceType =
  | "fact"
  | "inference"
  | "unknown"

type EvidenceSignal =
  | "positive"
  | "negative"
  | "conflict"
  | "neutral"
  | "unknown"

type Confidence =
  | "high"
  | "medium"
  | "low"
```

完整结构：

```json
{
  "evidence_id": "EV_001",

  "dimension": "cashflow",

  "title": "利润增长与经营现金流走势背离",

  "statement": "最新报告期净利润同比增长18.2%，经营现金流同比下降11.6%。",

  "type": "inference",

  "signal": "conflict",

  "confidence": "high",

  "metrics": [
    "METRIC_NET_PROFIT_YOY",
    "METRIC_OCF_YOY"
  ],

  "based_on": [
    "EV_FACT_001",
    "EV_FACT_002"
  ],

  "source": {
    "provider": "Fuyao",
    "period": "2026H1",
    "updated_at": ""
  },

  "interpretation": "利润增长暂未得到经营现金流同步验证。",

  "verify_status": "verified"
}
```

---

# 13. Evidence 三类信息

## 13.1 FACT

真实金融数据直接支持。

例如：

> 最新报告期营业收入同比增长 12.3%。

必须：

- 来源可查；
- 报告期明确；
- 单位明确。

---

## 13.2 INFERENCE

由多个 FACT 推导。

例如：

> 利润增长快于收入增长。

必须保存：

```text
based_on
```

---

## 13.3 UNKNOWN

缺少可靠信息。

例如：

> 当前无法判断成本下降是否可以持续。

UNKNOWN 是合法且重要的产品结果。

---

# 14. Evidence Signal

Signal 仅描述：

> 该条证据针对当前问题所体现的方向。

而不是评价股票。

支持：

```text
positive
negative
conflict
neutral
unknown
```

避免：

```text
good_stock
bad_stock
buy
sell
```

---

# 15. Evidence Rule Engine

P0 使用确定性规则。

例如：

### Rule 1

```text
revenue_yoy > 0
AND
previous_revenue_yoy <= 0
```

生成：

> 营收同比由负转正。

---

### Rule 2

```text
net_profit_yoy > 10
AND
operating_cashflow_yoy < 0
```

生成：

```text
signal = conflict
```

标题：

> 利润增长与经营现金流走势背离。

---

### Rule 3

```text
gross_margin_change <= -2pct
```

生成：

> 毛利率出现明显下降。

阈值需要写在 Rules 文件里。

不要藏在 Prompt 里。

---

# 16. AI Evidence Interpretation

Rule 已经找到：

> 什么值得注意。

AI 负责：

> 这代表什么。

输入示例：

```json
{
  "question": "...",
  "evidence": [...]
}
```

AI 输出：

```json
{
  "interpretation": "...",
  "limitations": "...",
  "next_questions": []
}
```

AI 不得修改原始 metric 数值。

---

# 17. AI Diagnosis Synthesizer

最终输入仅使用：

- User Question
- Diagnosis Context
- Evidence[]

不建议直接把原始完整 API Response 给模型。

输出：

```json
{
  "summary": "...",

  "key_findings": [
    {
      "conclusion": "...",
      "type": "inference",
      "signal": "conflict",
      "evidence_ids": [
        "EV_001",
        "EV_002"
      ]
    }
  ],

  "unknowns": [
    {
      "statement": "...",
      "reason": "..."
    }
  ]
}
```

硬约束：

**每一个重要 conclusion 必须存在 evidence_ids。**

---

# 18. Validation Layer

LLM Response 在进入 UI 前必须经过 Validation。

## 18.1 Schema Validation

检查 JSON 结构。

---

## 18.2 Evidence Binding

所有：

```text
key_findings[]
```

必须：

```text
evidence_ids.length > 0
```

不存在：

→ 拒绝显示。

---

## 18.3 Metric Validation

检查：

- number；
- unit；
- period；
- invalid / NaN。

---

## 18.4 Data Freshness

保证：

结论所使用的数据期次与 Diagnosis Context 一致。

---

## 18.5 Compliance

禁止出现：

- 建议买入；
- 建议卖出；
- 必涨；
- 必跌；
- 目标价；
- 收益承诺。

如果用户主动询问：

> 可以买吗？

系统应转化为：

> 本产品不提供买卖建议。可以继续从经营、估值、行情和风险等维度查看当前事实。

---

# 19. Model Adapter

P0 不需要真正做复杂多模型系统。

但封装：

```typescript
runLLM({
  task,
  input,
  model,
  timeout,
  retries
})
```

任务类型至少区分：

```text
planner
evidence_interpretation
diagnosis_synthesis
followup
```

所有模型配置通过环境变量。

禁止写死 Secret。

---

# 20. Prompt 管理

目录：

```text
/lib/ai/prompts/
```

包含：

```text
planner.ts
evidence-interpreter.ts
synthesizer.ts
followup.ts
```

每一个 Prompt 设置：

```text
promptVersion
```

例如：

```text
planner_v1
synthesis_v1
```

---

# 21. Task Trace

每次诊断保留简单 Trace。

至少记录：

```json
{
  "diagnosis_id": "",

  "input": {},

  "planner": {
    "prompt_version": "",
    "model": "",
    "status": ""
  },

  "tools": [],

  "metrics_count": 0,

  "evidence_count": 0,

  "synthesis": {
    "prompt_version": "",
    "model": "",
    "status": ""
  },

  "latency_ms": 0,

  "errors": []
}
```

P0 可以存在：

```text
server memory
local JSON
SQLite
```

任选一种。

不要为了 Trace 增加大型数据库。

---

# 22. Loading UX

系统执行时，不显示：

> AI 正在思考……

而展示 Workflow：

```text
理解研究问题 ✓
获取财务数据 ✓
计算核心指标 ✓
检查异常与矛盾 ✓
构建证据链 ✓
生成诊断结论 …
```

最好是真实状态，而非纯动画。

---

# 23. Diagnosis Summary

第一屏包含：

## 当前状态

最多 2–4 句话。

例如：

> 当前经营数据仍显示收入和利润增长，但现金流未同步改善。盈利能力整体稳定，估值处于自身历史中低区间。当前最值得继续验证的问题是利润增长与经营现金流背离是否属于短期营运资金波动。

下面显示：

```text
8 条已验证事实
3 条分析推断
1 条矛盾证据
2 条待验证问题
```

---

# 24. Evidence Overview

至少四组：

### 积极证据

### 风险 / 承压证据

### 矛盾证据

### 待验证问题

Evidence Card 展示：

```text
Title
FACT / INFERENCE / UNKNOWN
Metric
Period
Source
查看证据
```

---

# 25. Dimension Cards

展示：

```text
经营增长
盈利能力
现金流
估值
行情
行业 / 风险
```

状态允许：

```text
改善
稳定
承压
存在矛盾
信息不足
```

不要：

```text
优秀
差
A+
推荐
```

---

# 26. Evidence Drawer

点击 Evidence 后：

右侧 Drawer 打开。

必须展示：

### 结论

### 类型

FACT / INFERENCE / UNKNOWN

### 原始指标

### 当前报告期

### 对比报告期

### 计算过程

### 单位

### 数据来源

### 更新时间

### 该结论引用的其他 Evidence

---

# 27. Follow-up Research

用户可以：

> 为什么利润与现金流背离？

Request：

```json
{
  "diagnosis_id": "",
  "question": "",
  "context_evidence_ids": []
}
```

Follow-up 输出必须分层：

### 当前可以确认

FACT

### 基于这些事实可以推断

INFERENCE

### 当前还不能确认

UNKNOWN

### 可以继续检查

Next Research

---

# 28. Error States

必须实际开发。

## Data Missing

显示：

> 当前数据源未返回该指标，本轮不对此项生成判断。

---

## API Timeout

显示：

> 数据获取失败。

按钮：

> 重新获取

不能让 LLM 补结果。

---

## Partial Failure

例如：

财务成功。

行业失败。

则：

财务照常展示。

行业：

```text
信息不足
```

---

## Invalid Metric

例如：

PE <= 0。

不要计算 PE 历史分位并得出低估值结论。

---

# 29. P0 / P1 / Out of Scope

## P0

必须：

- 股票信息；
- 用户问题；
- Planner；
- 真实金融数据；
- Metric Engine；
- Evidence Model；
- Evidence Rules；
- AI Synthesis；
- Validation；
- Summary；
- Evidence Cards；
- Evidence Drawer；
- Follow-up；
- Error State；
- Compliance；
- README；
- 测试。

---

## P1

有时间再做：

- 行业比较；
- 公告新闻；
- 图表优化；
- 多股票搜索；
- Trace UI；
- Diagnosis History。

---

## 不做

- 全市场选股；
- 收益预测；
- 股票评分；
- 买卖建议；
- 目标价；
- 回测；
- Portfolio；
- 登录；
- 自选股；
- 自动交易；
- 多 Agent；
- 完整事件时间线。

---

# 30. 推荐技术栈

优先：

```text
Next.js
TypeScript
Tailwind CSS
```

UI：

可以使用项目已有组件库。

若新建项目：

选择轻量方案即可。

后端：

Next.js Route Handler 即可。

不要为了本作业额外拆独立 Python 服务，除非数据 SDK 必须使用 Python。

---

# 31. 推荐目录

```text
/app
  /page.tsx
  /diagnosis/[id]/page.tsx

  /api
    /diagnosis
    /evidence/[id]
    /followup

/components
  DiagnosisInput
  DiagnosisSummary
  DimensionCard
  EvidenceCard
  EvidenceDrawer
  WorkflowProgress
  FollowupResearch

/lib
  /data
    fuyao.ts
    ifind.ts
    normalize.ts

  /metrics
    financial.ts
    valuation.ts
    market.ts

  /evidence
    types.ts
    rules.ts
    builder.ts

  /ai
    model.ts
    planner.ts
    synthesizer.ts
    followup.ts

    /prompts

  /validation
    diagnosis.ts
    compliance.ts

  /trace
    trace.ts

/types
```

根据现有 Repo 实际情况调整，不强制搬目录。

---

# 32. API

## POST `/api/diagnosis`

Request：

```json
{
  "stock_code": "000333.SZ",
  "question": "公司现在经营情况怎么样？"
}
```

Response：

```json
{
  "diagnosis_id": "",

  "stock": {},

  "context": {},

  "summary": "",

  "dimensions": [],

  "evidence": [],

  "unknowns": [],

  "data_updated_at": ""
}
```

---

## GET `/api/evidence/:id`

返回完整 Evidence。

---

## POST `/api/followup`

Request：

```json
{
  "diagnosis_id": "",
  "question": "",
  "context_evidence_ids": []
}
```

---

# 33. Eval 体系

必须同时有：

```text
Software QA
+
AI Eval
```

## Software QA

### S01

正常输入。

预期：

完成诊断。

### S02

数据 API 超时。

预期：

显示失败状态。

### S03

部分字段为空。

预期：

对应 UNKNOWN。

### S04

Evidence Drawer。

预期：

能够打开，并显示来源和报告期。

### S05

Follow-up。

预期：

成功引用上下文 Evidence。

---

## AI Eval

### A01

输入：

> 公司现在经营怎么样？

检查：

Planner 是否选择：

- Growth
- Profitability
- Cashflow

---

### A02

输入：

> 当前估值怎么样？

检查：

Planner 不应无必要请求全部经营维度。

---

### A03

净利润↑、经营现金流↓。

检查：

Evidence 是否：

```text
conflict
```

---

### A04

问：

> 现在能买吗？

检查：

不输出投资建议。

---

### A05

行业接口失败。

检查：

AI 是否生成不存在的行业比较。

必须：

否。

---

### A06

关键 Evidence ID 不存在。

检查：

Validation 是否阻止结论进入 UI。

---

# 34. Git 开发规则

每个关键阶段完成后 Commit。

推荐：

```text
chore: initialize stocklens project

feat: add financial data adapter

feat: add metric engine

feat: add evidence model and rules

feat: add diagnosis workflow

feat: add ai planner and synthesizer

feat: add diagnosis interface

feat: add evidence drilldown and followup

test: add edge cases and ai eval

fix: final qa issues
```

---

# 35. Coding Agent 统一工作原则

以后所有 ZCode Task 都遵守：

### 做什么

明确本轮目标。

### 不做什么

限制 Scope。

### 完成标准

明确 Acceptance Criteria。

### 怎么验证

必须提供 Verification。

---

Coding Agent 默认遵守：

1. 不修改与当前任务无关的功能；
2. 不进行无要求的大规模重构；
3. 不更换技术栈；
4. 不改变已经确认的 API Contract；
5. 不硬编码 API Key；
6. 不伪造金融数据；
7. 不使用 LLM 计算核心指标；
8. 不静默吞掉数据异常；
9. 发现非本轮问题只记录；
10. 完成后报告修改文件与验证结果。

---

# 36. ZCode 开发阶段

## Phase 0｜Inspect Repository

目标：

知道当前项目是什么。

不改代码。

---

## Phase 1｜Bootstrap + Data Spike

目标：

让真实金融数据跑通。

做到：

```text
GET/POST Debug API
↓
真实返回股票基础数据 / 财务 / 估值 / 行情
```

这是第一个关键 Checkpoint。

---

## Phase 2｜Normalize + Metric Engine

做到：

```text
Raw Data
↓
Normalized Data
↓
Metrics
```

完全不依赖 AI。

---

## Phase 3｜Evidence Engine

做到：

```text
Metrics
↓
FACT
↓
INFERENCE
↓
CONFLICT
↓
UNKNOWN
```

先打印 JSON。

不要先做复杂页面。

---

## Phase 4｜Diagnosis Orchestrator + AI

加入：

- Planner；
- Synthesizer；
- Validation。

做到：

```text
Question
↓
Diagnosis JSON
```

---

## Phase 5｜Core UI

开发：

- 首页；
- Workflow Loading；
- Summary；
- Dimension；
- Evidence Card。

---

## Phase 6｜Evidence Drill-down

实现：

Evidence Drawer。

---

## Phase 7｜Follow-up

沿 Evidence 继续研究。

---

## Phase 8｜Exception / Compliance

主动制造：

- API timeout；
- empty data；
- invalid metric；
- investment advice question。

---

## Phase 9｜Eval + QA

跑完整测试。

---

## Phase 10｜UI Polish + Deploy

最后才进行视觉优化和部署。

---

# 37. 24 小时优先级

时间不够时，砍功能的顺序：

最先砍：

```text
公告
复杂行业比较
多股票
历史记录
Trace UI
动画
```

绝对不能砍：

```text
真实数据
Metric Engine
Evidence
事实 / 推断 / Unknown
Evidence Drill-down
异常处理
Validation
```

---

# 38. 最终 Demo 主路径

60–180 秒视频建议直接走：

### 1

打开 StockLens。

### 2

输入：

> 美的集团现在经营情况怎么样？

### 3

展示 Workflow。

### 4

展示当前状态。

### 5

重点展示：

> 利润与现金流存在背离。

### 6

点击 Evidence。

展示：

- 原始数字；
- 报告期；
- 来源；
- 计算。

### 7

继续问：

> 为什么会出现这种背离？

### 8

AI 分开：

- 可以确认；
- 可以推断；
- 还不能确认。

### 9

快速演示：

> 现在能买吗？

展示合规响应。

整个 Demo 即完成。

---

# 39. 最终判断标准

如果最后时间只剩很少，不要问：

> 页面够不够漂亮？

首先检查：

### Truth

数字是真的吗？

### Traceability

结论能点回证据吗？

### Boundary

事实、推断和未知分开了吗？

### Failure

接口失败时会胡编吗？

### AI Value

AI 是否真的承担了：

> 理解问题 + 组织证据 + 解释关系？

只要这五点成立，这个产品的主价值就成立。

---
---

# 附录 A｜环境侦察结果（ZCode 于 2026-09-30 实测补充，非 PRD 正文章节）

> 本附录由 ZCode 记录，供开发时查证；如与扶摇官方文档冲突，以官方文档为准。

## A.1 本机工具链

- Node v24.15.0 / npm 11.12.1
- Python 3.14.6
- Git 2.55.0（Windows）

## A.2 扶摇 API 鉴权（已从官方权威定义确认）

- 登录 <https://fuyao.aicubes.cn/> → API Key 管理页 <https://fuyao.aicubes.cn/admin> 签发；
- 请求头携带 **`X-api-key: <your-api-key>`**（REST 与 MCP 鉴权方式相同）；
- Key 只显示一次，存入 `.env.local`，禁止写入代码/提示词/公开仓库；
- 错误码 `code=2001 / 2003` 表示 Key 失效或无权限，需回 admin 页重新签发/申请权限。

## A.3 已确认可用的 REST 端点（与 PRD 维度映射）

| 端点 | 用途 | 对应维度 |
|---|---|---|
| `GET /api/a-share/prices/snapshot`（支持 `thscodes` 批量 / `limit+offset` 全市场） | 行情快照 | 股票信息 |
| `GET /api/a-share/prices/historical?thscode=&interval=1d&start=&end=&adjust=forward`（毫秒时间戳） | 历史 K 线（前复权） | Market |
| `GET /api/a-share-index/prices/historical?thscode=000300.SH...` | 指数 K 线 | vs CSI300 |
| `GET /api/a-share/financials/income-statements` / `balance-sheets` / `cash-flow-statements`（`period=annual|quarterly`，`limit` 或毫秒区间） | 三大报表多期 | Growth / Profitability / Cashflow |
| `GET /api/a-share/financials/indicators?thscode=&report=2025-1` | 官方五类财务指标（成长/盈利/偿债/营运/现金流） | Metric Engine 双轨制取数源 |
| `GET /api/a-share/valuations/snapshot` | 估值快照（批量） | Valuation |
| `GET /api/a-share/calendar/trading-days` | 交易日历 | Data Freshness |
| `GET /api/meta/tickers/search?q=` | 标的检索/消歧 | 股票合法性 |
| `GET /api/a-share-index/catalog/ths-index-list?tag=industry` → `GET /api/a-share-index/constituents/ths-stock-list?thscode=...` | 行业指数与成分股 | Industry |
| `GET /api/a-share/special-data/hot-stock-rank-trend` / `anomaly-analysis-stock?thscodes=` | 热榜排名走势 / 个股异动原因 | Event Risk |
| `GET /api/news/events/search` | 资讯事件库 | ⚠️ 文档标注"仅在同花顺 AI 客户端内提供"，REST 可用性未验证，需 Data Spike 实测 |

路径形态：`/api/<标的宇宙>/<数据类型>/<动作>`。完整参数见官方 `https://fuyao.aicubes.cn/llms-full.txt`（约 40 万字，2026-09-30 已抓取缓存备查）。

## A.4 对 PRD 的两点落地说明

1. **Metric Engine 双轨制**：官方 `financials/indicators` 直接取数，与三大报表自算结果交叉验证；不一致时按 PRD §14 记为 `conflict` 证据，属于特性而非缺陷。
2. **事件与风险维度降级链**（对应 §9.6）：iFinD MCP → 公开权威材料（如巨潮资讯公告，标明来源）→ 显式归入 UNKNOWN。该降级链为显式设计，非兜底补丁。

## A.5 项目路径

- 项目根目录：`D:\zcode存储\stocklens\`
- 本 PRD 位置：`D:\zcode存储\stocklens\PRD.md`
- `.env.local`（Fuyao / LLM Key）位于项目根目录，`.gitignore` 第一条排除。

## A.6 密钥冒烟验证记录（2026-09-30，ZCode 实测）

| 验证项 | 结果 | 证据 |
|---|---|---|
| 扶摇 `prices/snapshot?thscodes=000333.SZ` | ✅ 通过 | `code:0`，真实行情：last_price 80.53，跌 1.38%，时间戳 1790749715000（≈2026-09-30 盘后） |
| 扶摇 `financials/indicators?thscode=000333.SZ&report=2025-1` | ✅ 通过 | 返回 growth/profitability/solvency/operation/cash-flow 五组官方指标，含 `calculate_operating_income_yoy_growth_ratio`=20.49 等。**注意：需在 Phase 1 动态发现最新 report 期次（不可硬编码）** |
| DeepSeek `POST /chat/completions`（model=deepseek-chat） | ✅ 通过 | HTTP 200，正常返回，实际服务端模型标识 `deepseek-flash` |
| 扶摇 `/api/news/events/search` | ❌ REST 不可用 | `code:2004`"该数据为同花顺AI客户端专用"。**§9.6 降级链正式生效：iFinD MCP → 公开权威材料（标来源）→ UNKNOWN** |

密钥管理状态：

- 两个 Key 已写入 `D:\zcode存储\stocklens\.env.local`（`FUYAO_API_KEY` / `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`）；
- `.gitignore` 已就位并排除 `.env*`；git init 尚未执行（留给 Task 01），首次 commit 前需确认 `git status` 不含 `.env.local`；
- iFinD MCP：**已定位实际载体**——ZCode 官方插件 `hexin`（displayName「同花顺」，en: RoyalFlush iFinD），2026-09-30 14:26 以 user 作用域安装（`hexin@zcode-plugins-official` v0.1.0）。提供 5 个远程 HTTP MCP server：`hexin-stock` / `hexin-global-stock` / `hexin-index` / `hexin-fund` / `hexin-bond`，经 ZCode 网关 `${ZCODE_BASE_URL}/api/v1/mcp/server/finance_hexin_*` 路由，宿主注入 JWT 鉴权（无需数据商 Key），`requiresPaidPlan: true`。**工具命名空间为 `plugin:hexin:<server>`**。本会话早于插件安装启动，工具未挂载——需重启会话/新开会话后确认 `mcp__plugin_hexin_*` 工具出现；若认证失败查登录态与套餐权限。在其可用前，公告/新闻维度按降级链执行。
