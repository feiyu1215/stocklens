# Test Report

本文件说明 StockLens 的测试策略、自动化结果、主链路验证、失败与极端情形、交互审计、网络与 console 审计、性能实测与合规边界。

产品版本：生产部署 `db618d4`（https://stocklens-blush.vercel.app/observatory-v5）。
本文件中的所有数字均为**实测**，不是目标值；性能数字是观测值，**不构成 SLA**。

---

## 1. Test Strategy

| 层次 | 方式 | 覆盖 |
|---|---|---|
| 单元 / 集成 | Vitest（离线，无需密钥） | 指标引擎、证据引擎与冲突规则、AI 校验与证据绑定、研究空间初始化、语义层级、载荷守卫、打包预算 |
| 工程校验 | `tsc --noEmit` / `eslint` / `next build` | 类型、规范、生产可构建 |
| 浏览器交互审计 | 真实指针与真实键盘，针对**生产部署** | 48 行交互清单（见第 5 节） |
| 网络审计 | 页内 Resource Timing + 请求钩子 | 本地动作零业务请求、远程动作恰好一次、重复请求回归 |
| 失败注入 | `?testFailure=research-init\|dimension\|followup`（仅非生产生效） | 三类失败态与 Retry / Back |
| 合规 | 规则 + 校验层 + 人工抽查 | 无涨跌预测、无买卖建议、事实/推断/未知分离 |

**判定原则**：交互类结论只认真实指针（`isTrusted: true` 的浏览器输入事件）与真实键盘输入；"元素在 DOM 里""handler 存在""单测通过"都不作为交互可用的证据。

## 2. Automated Tests

```
npx tsc --noEmit                        → 0 errors
npx eslint src/components/v5 src/lib/v5 → 0 errors（1 条已知的未使用变量 warning）
npx vitest run                          → 29 test files / 402 tests, all passed
npx next build                          → success
```

测试覆盖：`tests/metrics/*`（财务口径、行情区间、市场上下文）、`tests/evidence/*`（证据引擎、冲突规则、事实构造）、`tests/ai/*`（编排、校验、证据选择、follow-up）、`tests/research-init.test.ts`、`tests/presentation/*`、`tests/experience.test.ts`、`tests/terrain-fidelity.test.ts`、`tests/shelf.test.ts` 等。

## 3. Main Journey（实测，生产环境）

| 步骤 | 结果 |
|---|---|
| 打开研究画布 | 美的集团 000333.SZ，6 个研究维度 |
| 点击一个维度 → Focus Aperture | 光圈本地立即出现（`pointerdown → 视觉提交` 实测 35 ms），零业务请求 |
| `Explore research` → Reading | Reading 打开，claim spine（FACT / INFERENCE 混排，带 ①②③ 证据锚点），右侧 Evidence Rail 显示当前证据的指标、数值、期次、来源与计算口径 |
| 点击证据锚点 ①②③ | 该证据被钉住（`PINNED` / `UNPIN`），画布上对应证据节点高亮（`r=5.5`、`fill=#2F66FF`），零业务请求 |
| Claim ASK | 聚焦全局唯一的 AI Lens（全文档只有 1 个 textarea），scope 变为该 claim；发送后恰好 1 次 `/api/followup` |
| Claim CHALLENGE | 展开三层面板：SUPPORT / COUNTER-SIGNALS / UNKNOWN，内容来自当前维度的真实证据 |
| 添加研究角度 | 命令行面板 → `Add research angle` → 输入「库存与周转压力」→ 提交后恰好 1 次 `/api/research/dimension`，维度数 6 → 7 |
| 收藏公司 / 切换公司 | `★ 已保存` 写入研究架；切换至招商银行触发全屏研究过渡，完成后得到**不同的研究结构**（银行：盈利质量与资本回报 / 资产质量与风险抵补 / 估值安全边际与行业相对…） |
| 缓存返回 | 从研究架点回美的集团：**零新增 init**，无全屏过渡，实测恢复 15.8 ms，六项现场（缩放、手动移动的维度、钉住的便签、AI 线程、活跃维度）逐项一致 |

## 4. Missing / Failure Cases（实测）

| 情形 | 触发方式 | 实测行为 |
|---|---|---|
| 研究初始化失败 | `?testFailure=research-init` | 全屏过渡进入 `phase=failed`，保留目标公司身份，文案「研究空间暂时无法完成」；`Retry` 与「返回上一家公司」两个控件均**可被真实指针命中**；Back 完整恢复上一家公司，Retry 重新发起真实 init 并成功 |
| 新增维度失败 | `?testFailure=dimension` | 画布上就地保留该研究角度并显示 `Unable to resolve` + `Retry`（不静默删除用户意图）；Retry 后真实返回该维度 |
| 追问失败 | `?testFailure=followup` | 线程内显示「AI interpretation is temporarily unavailable. Current evidence remains available.」+ `Retry answer`；Retry 后返回有依据的回答 |
| 证据不足（UNKNOWN） | 银行类公司 / 未接入的能力 | 界面直接标注 `EVIDENCE INCOMPLETE` 与缺失项；`UNKNOWN` 是正式结果，带 `unavailableReason`，不会被写成"正常" |
| 取消公司切换 | 过渡层「← 返回上一家公司」 | 真实指针可命中（50/50 采样点），恢复耗时 3 ms，六项现场逐项一致；被中止的 init 请求 53 ms 内结束 |
| 迟到响应保护 | 取消后等待 30 秒 | 迟到的公司响应**没有**覆盖当前现场；序号守卫丢弃过期响应 |
| 刷新研究 | 研究架内 `Refresh research` | 全屏过渡使用刷新语义（「正在刷新…」/ `REFRESHING RESEARCH SPACE`），**每次刷新恰好 1 次 init**；取消后原现场逐项还原 |
| AI 层整体失败 | 上游模型不可用（真实偶发） | claims 为空但证据仍在，维度标注 `AI interpretation is temporarily unavailable`——**失败是可见的，不会被伪装成正常结论** |
| 数据过期 | `tests/evidence/freshness.test.ts` | 时间敏感证据（行情/估值/事件核查）超过 7 天阈值 → `freshness.status = "stale"`，statement 末尾强制追加「（该数据截至 X，距当前 N 天，当前状态无法由该数据确认）」；AI 上下文同样携带 `freshness/dataAsOf/freshnessReason`，并在 prompt 中禁止据此陈述"当前状态"。见第 10 节 |

## 5. Interaction Audit

48 行交互清单（唯一真相来源：`docs/design-audit/task16-2/INTERACTION_MANIFEST.md`）：

**PASS 47 · FAIL 0 · NOT TESTED 0 · NOT APPLICABLE 1**

覆盖：研究画布全部控件、Focus Aperture、Reading 与 Evidence、公司切换与研究架、AI 线程、Guided Demo 与命令行面板、失败态，以及键盘快捷键（`Ctrl+K`、`/`、`Esc` 层级链、`Alt+←/→`、Demo 的 `Space`/`←`/`→`）。

**唯一的 NOT APPLICABLE**：390×844 手机宽度。
该视口满足非空间性的底线要求——不空白（页面有 400+ 字符可见内容）、无横向溢出、AI Lens 可达；但**空间型交互**不在支持范围内：相机缩放的下限（0.65）无法把 1440 宽的设计世界装进 390 px，因此 6 个维度渲染在视口之外，且首次访问提示卡在该宽度下会与公司身份控件重叠。v5 没有移动端专用布局——这是明确的范围边界，不是"移动端简化"。
桌面矩阵（1440×900 与 1280×800）**全部通过**：无横向溢出，身份控件 / AI Lens / 维度 / 光圈 / Reading / 证据栏 / 公司切换器全部在视口内且可被真实指针命中。

## 6. Network Audit（实测）

| 动作 | 业务请求 |
|---|---|
| 本地空间操作（悬停、点维度、开光圈、进 Reading、点证据、开关 AI Lens、面板命令、marquee 多选、Gather / Spread / Focus selected / Clear selection、Park / Restore、缩放） | **0** |
| 未缓存公司切换 | `POST /api/research/init` **恰好 1 次** |
| 刷新研究 | `POST /api/research/init` **恰好 1 次** |
| 新增研究角度 / 提交建议维度 | `POST /api/research/dimension` **恰好 1 次** |
| AI 提问（claim scope 与 company scope） | `POST /api/followup` **恰好 1 次** |
| 缓存公司恢复 | `POST /api/research/init` **0 次** |
| 标的检索 | `GET /api/stocks/search` 1 次 |
| **重复 `research/init`** | 曾观察到一次选择触发两次 init；已修复（按 stockCode 的在途去重），并在其后的全部运行中复验为 1 次 |

## 7. Console

在所有生产验收运行中：

- **0 uncaught exception**
- **0 React runtime error**
- **0 hydration error**
- 0 `console.warn`（应用自身）

外部噪声（不计入应用输出）：`[RUM] ArmsEventBridge is not available, events dropped` —— 该字符串在应用源码与线上 HTML 中均不存在，来自浏览器扩展注入的监控 SDK。

## 8. Performance（观测值，非 SLA）

| 动作 | 实测 |
|---|---|
| 标的检索 `GET /api/stocks/search` | 中位 ~81 ms（首次约 353 ms） |
| 研究初始化 美的集团 000333.SZ | 中位 ~16.8 s |
| 研究初始化 招商银行 600036.SH | 中位 ~15.6 s |
| 新增维度 `POST /api/research/dimension` | 中位 ~1.8 s |
| 追问 `POST /api/followup` | 中位 ~8.0 s |
| 缓存公司恢复（无网络） | 实测 15.8 ms（最终审计） |

**初始化为什么慢**：94–97% 的时间花在两次真实模型调用（Research Framer + Composer），数据层（扶摇取数 + 指标 + 证据）仅 0.17–0.6 s。产品选择用**全屏研究过渡 + 真实已等待秒数**如实表达这段等待，而不是假进度或假百分比。

本地交互延迟（按下 → 首个视觉提交）：维度点击 35 ms、Explore→Reading 74 ms、AI Lens 打开 11 ms、命令面板 40 ms、公司切换器 52 ms。

## 9. Compliance

已测试并固化为规则/测试的边界：

- 不输出确定性涨跌预测、不承诺收益、不给直接买卖建议（合规预检 + Prompt 禁令 + 输出校验三层）；
- 事实（FACT）、推断（INFERENCE）、暂时无法验证（UNKNOWN）在数据结构层面分离，UI 分区呈现；
- 每条结论可回到原始字段：`sourceFields{source,domain,field,period}` + `calculationMethod` + 单位 + 有效样本数 + 比较期；
- 数据缺失/冲突/调用失败时**不静默生成"正常"结论**：缺失 → `unavailable` + reason（绝不以 0 冒充），冲突 → `conflict` 信号 + 背离规则，AI 失败 → 局部降级且可见；
- 相关单测：`tests/ai/diagnosis-validation.test.ts`（伪造 Evidence ID 必须失败且不被静默删除）、`tests/evidence/rules.test.ts`（背离规则触发与不触发）、`tests/metrics/financial.test.ts`（字段为 null → unavailable，不是 0）。

## 10. Data Freshness Guard（Task 17.1 §P0）

**要求**：过期数据不得静默支撑一个"当前状态"结论。实现为确定性机制，不引入新的数据平台。

**判定口径**（`src/lib/metrics/freshness.ts`，纯函数）：

| 类别 | 判定方式 |
|---|---|
| 时间敏感：行情 / 区间收益 / 估值快照 / 行业指数行情 / 事件核查 | 取数据日期（`sourceFields[].date`）与自然日阈值（7 天）比较 → `fresh` / `stale` / 无法取到可解析日期 → `unknown`（**绝不静默 fresh**） |
| 财务报表（报告期数据） | **不按自然日判定**：2026-Q2 不会因为"不是今天"而过期；`timeSensitive=false`，`dataAsOf` = 报告期，理由写明"以报告期为准" |

**过期数据的行为**：
1. 证据携带 `freshness{status, dataAsOf, retrievedAt, ageDays, reason, timeSensitive}`；
2. `status = stale` 时，statement 末尾**强制**追加「（该数据截至 X，距当前 N 天，当前状态无法由该数据确认）」——在界面与 AI 上下文中都无法被忽略；
3. 传给模型的紧凑证据带上 `freshness / dataAsOf / freshnessReason`，并在 synthesis 与 follow-up 的 prompt 中写明：`stale` 与 `unknown` 不得用于陈述"当前 / 目前 / 最新"状态；
4. 证据栏（Reading 的 Evidence Rail）对时间敏感数据显示「数据截至 YYYY-MM-DD · FRESH/STALE」，过期时以 coral 明示。

**聚焦测试**（`tests/evidence/freshness.test.ts`，14 条）：新鲜行情、过期行情（含阈值边界 7 vs 8 天）、无法判定时效 → unknown、行情类指标 sourceFields 为空也按时间敏感处理、财务报告期不被判为过期、估值快照、日期解析不把 "2026-Q2" 当日历日期、过期事实的 statement 带显式声明、新鲜事实不带、事件核查证据带新鲜度、新鲜度进入 AI 上下文（时间敏感必带 / 财务不额外增加字段）。

**浏览器实测**：证据栏渲染 `数据截至 2026-09-30 · FRESH`（`[data-evidence-freshness="fresh"]`）；生产 API 返回的 29 条证据中 21 条携带 freshness（金融类 `timeSensitive=false`，行情类 `timeSensitive=true`）。
> 说明：生产数据在验收时是新鲜的，因此浏览器侧验证的是 fresh 路径；stale / unknown 两条路径由上述单测在证据层（即拼装 statement 的那一层）覆盖。

## 11. Guided Demo（Task 17.1 §P2）

**入口文案**：`▶ 快速演示`（不再承诺精确秒数）与提示卡 `▶ 观看快速演示`；研究空间未就绪时入口显示 `研究空间准备中…` 并禁用。

**控件**：`暂停` ⇄ `继续`、`下一步 →`（每次**只推进一个 Scene**，不会跳到结束帧或退出）、`退出`。

**实测计时**（生产环境，自动播放到结束帧）：

| Scene | 目标 | 实测 |
|---|---|---|
| 1 Explore | 3.5s | 3.4s |
| 2 Dynamic Dimension | 4.0s | 4.0s |
| 3 Focus Aperture | 4.5s | 4.6s |
| 4 Reading + Evidence（最长，Reading 稳定后才进 Evidence） | 7.0s | 7.0s |
| 5 AI Research Lens（打字演示，不提交） | 5.0s | 5.0s |
| 6 Add Dimension + Research Shelf | 6.0s | 6.2s |
| **总计（到结束帧）** | **约 30s** | **30.4s** |

**演示期间业务请求 = 0**（`init` 0 / `dimension` 0 / `followup` 0，实测差值）。结束帧不自动关闭，停留至用户点击 `开始研究 →`；退出后现场（维度数、缩放、当前公司）完整恢复。Scene 6 的研究架实测确实打开可见。

## 12. How to Reproduce

```bash
npm install
cp .env.example .env.local     # 填入 FUYAO_API_KEY / DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL
npx tsc --noEmit
npx vitest run                 # 385 tests / 28 files，无需密钥
npx next build
npm run dev                    # http://localhost:3000/observatory-v5

# 失败态注入（仅非生产；生产构建中该代码不存在）
#   /observatory-v5?fixture=midea-artdirection&testFailure=research-init
#   ?testFailure=dimension   /   ?testFailure=followup
```

浏览器交互审计的完整证据与逐行结论在 `docs/design-audit/task16-2/`（该目录**不随提交包分发**，仅保留在仓库中用于可追溯）。
