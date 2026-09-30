# StockLens — 交接文档（给下一个会话）

> 生成时间：2026-10-01 · 作者：上一会话（ZCode）· 用途：无缝接手，不要重新发现已知事实

## 0. 一句话现状

产品主体已完成并在线；**当前卡在 Task 16.2A 的关键浏览器验收**（六个 Gate 里只有 duplicate-init 关闭，B1/B2/B3/B4/B5 均未完成），**READY FOR 16.2B = NO**，**禁止开始 Task 17**。

## 1. 工程与部署

| 项 | 值 |
|---|---|
| 仓库 | `D:\zcode存储\stocklens`（Next.js 16 App Router + React 19 + TS + Tailwind 4 + Vitest） |
| 生产 URL | https://stocklens-blush.vercel.app/observatory-v5 （**本轮验收对象**；生产 `/observatory` 未改动） |
| 本地 dev | `npm run dev` → http://localhost:3000/observatory-v5 |
| 部署 | `export VERCEL_TOKEN=$(cat .tools/vercel-token) && npx vercel --prod --yes --token=$VERCEL_TOKEN` |
| git push | 需要代理：`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD` |
| 最近提交 | `0f3c1e5` fix(v5): single in-flight research/init…（duplicate-init 修复）；此前 `dd7f9c1`（demo scene 6 先关 Reading）、`b8dcb4a`（demo 调度 ref 修复） |
| 校验命令 | `npx tsc --noEmit` · `npx eslint src/components/v5 src/lib/v5` · `npx vitest run`（**385 tests / 28 files 全过**）· `npx next build` |

## 2. 产品结构（研究主链）

`Company Canvas → Focus Aperture → Reading → Evidence Inspection`，AI Research Thread 是并行的工具层，Command Palette 是临时控制层。

关键文件：
- `src/components/v5/ResearchCanvas.tsx`（主编排，约 3000 行，所有交互都在这）
- `src/components/v5/CompanyTransition.tsx`（**Task 16.1A** 全屏研究过渡：`fixed inset-0 z-[110]`）
- `src/components/v5/DemoOverlay.tsx` + `src/lib/v5/demo.ts`（**Guided Demo V2**：6 场景 / 50s）
- `src/lib/v5/shelf.ts`（Research Shelf：收藏/最近/每公司画布快照）、`src/lib/v5/switch-guard.ts`（过期响应守卫）、`src/lib/v5/perf.ts`（`?perfDebug=1` 交互计时）
- `src/components/v3/ReadingV3.tsx`（Reading，被 v3/v4/v5 共用；新增 props 必须保持可选）
- 后端（**本阶段冻结，勿改语义**）：`src/app/api/{stocks/search, research/init, research/dimension, followup, observatory/*}/route.ts`；真值/指标/证据/framer/composer 在 `src/lib/{data,metrics,evidence,research,world,ai}/`

调试开关：`?aiDebug=1`（scope/线程调试面板）、`?perfDebug=1`（交互延迟面板）、`?fixture=…`、`?live=1`。

## 3. 任务历史与既定工作方式

用户（Spec AI / 产品经理）逐轮下发 Task prompt，**ZCode 只实现、不自由设计**；每轮产出可运行中间状态 + git 提交 + Completion Report，然后**停下**，绝不自动推进下一轮。已完成：Task 15/15.x（语义缩放、研究画布）、**Task 16**（导航闭环 / Research Shelf / Guided Demo V1 / Thread 打磨 / 打包脚本 0.63MB）、**Task 16.1**（即时响应 / 公司切换双路径 / 乐观加维度 / Demo V2 / 后端延迟审计）、**Task 16.1A**（全屏研究过渡）。当前：**Task 16.2A-R3 未完成**。

## 4. 六个 Gate 的当前真实状态（勿重复宣称已通过）

| Gate | 状态 | 已有证据 | 缺口 |
|---|---|---|---|
| duplicate `research/init` | **FIXED** | 真指针点击一次招商银行 → init **= 1**（修复前 2）；在途去重按 stockCode，Refresh 的 `force` 绕过去重 | — |
| B1 Guided Demo V2 | **FAIL** | 场景 1–5 + 结束帧实测通过（`1/6→6/6` 单焦点推进；全程 followup/dimension/init = 0）；调度 bug（永远停 Scene 1）已修 | **Scene 6「研究架可见」未复验**（已加 `close-reading` 动作但没重跑）；Demo Exit 的完整现场恢复（zoom 120% / 挪维度 / 光圈）未测 |
| B2 Full-Screen Transition | **FAIL** | 真指针：过渡层 ≤150ms 出现、`position:fixed / z-index:110`、整屏、旧 Canvas 不可操作（`elementFromPoint` 命中过渡层）、目标身份 + `已等待 00 秒` + 5 个中性占位 + `← 返回美的集团`；约 12.5s 后真实维度出现 | **取消路径**（≤300ms 恢复 + 快照恢复）、**30s 迟到 CMB 响应不得覆盖**未测 |
| B3 Cached Restore | **FAIL** | 缓存切回美的 **139ms**、init 计数零新增 | zoom 120% / 手动挪维度 / pinned note / AI thread / active dimension 的**完整现场恢复**未测 |
| B4 Failure States | **FAIL — test environment blocker** | — | `testFailure=research-init|dimension|followup` 注入**尚未实现**；生产 URL 不许让用户触发失败态，需 dev/staging 注入后测三类失败与 Retry/Back |
| B5 Console / Network | **FAIL — test environment blocker** | 局部：`window.__err = 0`、init=1、search=1 | 完整旅程的 console（0 uncaught / 0 React / 0 hydration）、local 零业务请求、三类远程各 ≤1 的完整断言 |

## 5. 未修的缺陷清单（按优先级）

1. **MINOR（本轮新发现）**：从**搜索结果**切换公司时，全屏过渡层的目标身份显示成代码而不是名称（头部读作 `600036.SH | 600036.SH`，应为「招商银行」）。修法：`[data-company-result]` 点击时把 `meta.name`（结果行里的 stockName）传给 `switchCompany`。
2. **MINOR**：`TrendGlyph` 未使用（lint warning）；README 的测试数陈旧（309/356 vs 现在 385）。
3. **MAJOR（后端，冻结范围内未修）**：`runFramer/runComposer/runFollowup` 在"修复重试"时只上报最后一次尝试的 `latencyMs`，第一次失败尝试不可见（重试跑残差 5.4–14.5s vs 无重试 0.37–0.75s）。
4. **MINOR（后端，未改）**：`gatherMarketContext`（`src/lib/data/industry.ts:200-204`）把 CSI300 与行业上下文串行 await，二者本可 `Promise.all`（§22 要求先测后优化）。
5. 陈旧 `readingId` 类问题只对 Reading 做了对账（`payload` 变化时校验维度仍存在）；aperture/evidence 同类情形未系统对账。

## 6. 后端实测延迟（`docs/design-audit/task16-1/PERFORMANCE_AUDIT.md`，n=4 真实运行）

search 中位 **81ms**（首次 353ms）· init 美的 000333.SZ **16.8s** · init 招行 600036.SH **15.6s** · dimension（库存与周转压力）**1.8s** · followup **8.0s**。
**init 的 94–97% 花在两个 LLM 调用**（framer 中位 3.8s + composer 中位 7.0s），Fuyao 真值层热态仅 0.17–0.6s。→ 公司切换慢的根因是模型串行调用；按用户要求**本轮不做流式、不做并行化改造**。

LOCAL 交互实测（`?perfDebug=1`，`pointerdown → 首个 rAF 视觉提交`）：Dimension click **35ms** · Explore→Reading **74ms** · AI Thread open **11ms** · Command Palette **40ms** · Company Switcher **52ms**，全部 `net: no`（0 业务请求）。

## 7. 浏览器验收怎么做（关键经验，别再踩坑）

**必须用真指针**（用户明确要求：最终 Gate 禁用 `dispatchEvent`；合成事件只能用于 debug）。

```js
// 每次新 kernel 都要重跑 bootstrap
const root = process.env.ZCODE_PLUGIN_ROOT;
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const { setupBrowserRuntime } = await import(pathToFileURL(join(root, "scripts", "browser-client.mjs")).href);
await setupBrowserRuntime({ globals: globalThis });
const browser = await agent.browsers.get("iab");
const tab = await browser.tabs.get("iab-tab:1c4fb4e3-40e5-4f62-ad46-739c652cc408"); // 失效就先 tabs.list() 再 get
```

坑与对策：
- **`locator.click()` 不能传 `{ timeout }`**（harness 返回 `unrecognized_keys`）→ 只写 `.click()` / `.fill(v)`。
- 每次 run 前：`goto(URL)` → 清 `localStorage`/`sessionStorage` → `reload()` → 等 9s（首屏 payload 需 6–9s）→ 再装 `fetch`/`error` 钩子（**reload 会清掉钩子**）。
- 关键选择器：`[data-company-identity]`（打开切换器）· `[data-company-search] input` · `[data-company-result="<code>"]` · `[data-saved-company]` / `[data-recent-company]` · `[data-anchor-id]` · `[data-aperture]` · `[data-reading-sheet]` · `[data-evidence-breadcrumb]` · `[data-ai-lens] textarea` · `[data-ai-send]`/`[data-ai-stop]`/`[data-ai-retry]` · `[data-demo-start]`/`[data-demo-pause]`/`[data-demo-skip]`/`[data-demo-exit]` · `[data-company-transition]`/`[data-transition-cancel]`/`[data-transition-elapsed]` · `[data-zoom-pct]` · `[data-ticker]`。
- **截图/录制捕获面经常超时**（`screenshot surface preparation timed out`），且**录制与截图同时做必失败**；本轮结论以浏览器观测 + 网络/时序日志为准，用户已同意截图 OPTIONAL、不做视频。
- 页面偶发"回落到 Reading/隐藏头部 chrome"的状态：用 Esc 逐层退出，或 `goto` 重载；这是已知小毛病（见 §5）。
- 每步都要**声明式断言**（ticker、维度数、zoom、`window.__api` 计数、`window.__err`），不要只看"没报错"。

## 8. 下一轮的最小执行顺序（照做即可）

1. **修 §5.1 的搜索名称回退**（小改，随手一起提交）。
2. **B2**：按 §7 准备美的现场（zoom 120% + 挪一个维度 + 开一个光圈 + 至少 1 轮 AI 历史）→ 清 `stocklens.canvas.600036.SH` → 真指针切招商银行 → 确认全屏过渡 → 4s 后真指针点 `← 返回美的集团` → 记录 `cancelRestoreMs`（目标 ≤300ms）→ 逐项比对现场恢复 → **再等 30s** 断言美的未被迟到 CMB 响应覆盖。
3. **B1**：从 1/6 完整跑 Demo V2，重点肉眼确认 Scene 6 依次出现「Add research angle」和「Research Shelf/Company Switcher」；全程 `research/init = 0`、`research/dimension = 0`、`followup = 0`；Exit 后比对 demo 前现场。
4. **B3**：美的与招商都先完成一次 session → 在美的预置 zoom/挪维度/pin note/AI 历史 → CMB→美的 真指针往返 → 断言 `init = 0`、`restoreMs < 400ms`、五项目现场全恢复（**不允许再用 dynamic-id drift 解释**，这条路径不重新 init）。
5. **B4**：在 `NODE_ENV !== "production"` 下实现 `?testFailure=research-init|dimension|followup`（生产默认关闭）→ 三类失败态 + Retry/Back 各真指针验证。
6. **B5**：干净 context 跑完整旅程（Canvas→Dimension→Aperture→Reading→Evidence→AI→未缓存切换→缓存恢复）→ 断言 console 0 uncaught / 0 React / 0 hydration、local 动作 0 业务请求、三类远程各 ≤1、duplicate = 0。
7. 全部跑完后才更新 `docs/design-audit/task16-2/{RELEASE_GATE,INTERACTION_MANIFEST,KNOWN_BUGS}.md`（用户要求：**先测后写文档**）。

## 9. 硬约束（违反即返工）

- 不得新增产品能力（Compare / Time Travel / Voice / 新数据源 / 新指标 / 新渲染器 / 新 AI 架构）；不得重设计 UI。
- 后端语义冻结；`src/lib/research|world|evidence` 不做改造；不得为提速删除校验/证据/真值层。
- 不得输出确定性涨跌预测、收益承诺、买卖建议；事实/推断/未知必须区分；证据不足必须标 UNKNOWN；不得静默生成"正常"结论。
- 不得提交 API Key / 隐私数据 / 受限数据；演示与测试只用构造数据；`docs/design-audit/` 与第三方参考截图不进提交包。
- **Task 17 未获准**：不做 README 定稿、不做根路由切换、不生成最终 ZIP/MP4、不宣布产品完成。

## 10. 产物索引

`docs/design-audit/task16/`（导航闭环 + Shelf + Demo V1 的 8 张图 + STATUS + guided-demo.webm 66s）· `task16-1/`（PERFORMANCE_AUDIT.md、PERFORMANCE_RESULTS.md、INTERACTION_LATENCY_MATRIX.md、LOADER_REFERENCE_AUDIT.md）· `task16-2/`（INTERACTION_MANIFEST.md、RELEASE_GATE.md、KNOWN_BUGS.md）· `docs/final/`（REQUIREMENT_MATRIX.md 17 行 15 PASS/2 PARTIAL、PACKAGE_MANIFEST.md、5 个骨架文件待 Task 17 定稿）· `dist-submission/StockLens_Submission.zip`（0.63MB，密钥扫描 PASS；**最后一次打包早于最近几次修复，Task 17 需重跑**）· 打包命令 `npm run package:submission`。
