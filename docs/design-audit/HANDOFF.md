# StockLens — 交接文档（给下一个会话）

> 生成时间：2026-10-01 · 上一会话（ZCode）· 用途：无缝接手，不要重新发现已知事实
> 上一版在 `16.2A-R3`（六个 Gate 全部未过）；本版在 **16.2A 验收已完成** 之后。

## 0. 一句话现状

**六个 Gate 全部拿到真实浏览器证据并通过**（duplicate-init / B1 / B2 / B3 / B4 / B5），其中 B2、B4 依赖本轮新修的三个真缺陷。**仍不满足 Task 17 的前置条件**：交互清单里还有 11 项 `NOT TESTED`（详见 §5），且提交包早于本轮修复，需要重跑。**Task 17 未获准，不要开始。**

## 1. 工程与部署

| 项 | 值 |
|---|---|
| 仓库 | `D:\zcode存储\stocklens`（Next.js 16 App Router + React 19 + TS + Tailwind 4 + Vitest） |
| 生产 URL | https://stocklens-blush.vercel.app/observatory-v5**?live=1**（`?live=1` 是必须的，见 §2） |
| 本地 dev | `npm run dev` → http://localhost:3000/observatory-v5 |
| 部署 | `export VERCEL_TOKEN=$(cat .tools/vercel-token) && npx vercel --prod --yes --token=$VERCEL_TOKEN` |
| git push | 需要代理：`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD` |
| 校验四件套 | `npx tsc --noEmit` · `npx eslint src/components/v5 src/lib/v5` · `npx vitest run`（**385 tests / 28 files 全过**）· `npx next build` |
| 本轮提交 | `0ad691e`（搜索名称）→ `3809567`（过渡层遮挡）→ `63e2d84`（Demo CTA）→ `1835581`（提示卡遮挡）→ `4d2a5fd`（非生产失败注入） |

## 2. 产品结构（研究主链）

`Company Canvas → Focus Aperture → Reading → Evidence Inspection`，AI Research Thread 是并行工具层，Command Palette 是临时控制层。

- `src/components/v5/ResearchCanvas.tsx`（主编排，约 3000 行，所有交互都在这）
- `src/components/v5/CompanyTransition.tsx`（全屏研究过渡，`fixed inset-0 z-[110]`）
- `src/components/v5/DemoOverlay.tsx` + `src/lib/v5/demo.ts`（Guided Demo V2：6 场景 / 50s）
- `src/lib/v5/shelf.ts`（Research Shelf）、`src/lib/v5/switch-guard.ts`、`src/lib/v5/perf.ts`
- `src/lib/v5/test-failure.ts`（**本轮新增**：仅非生产的失败注入，见 §4）
- `src/components/v3/ReadingV3.tsx`（被 v3/v4/v5 共用；新增 props 必须保持可选）
- 后端（冻结）：`src/app/api/{stocks/search, research/init, research/dimension, followup, observatory/*}/route.ts`

**⚠ `?live=1` 是必须的**：v5 页面默认从 `/api/observatory/fixture?name=midea-artdirection` 加载 payload，只有带 `?live=1` 才会真的调 `/api/research/init`。公司切换永远走真实 API（`switchCompany` 里没有 fixture 分支），所以 fixture 模式下「首屏是假数据、切公司是真数据」。

调试开关：`?aiDebug=1`、`?perfDebug=1`、`?fixture=<name>`、`?live=1`、`?testFailure=…`（非生产）。

## 3. 六个 Gate 的真实状态（本轮实测）

| Gate | 状态 | 关键数字 |
|---|---|---|
| duplicate `research/init` | **PASS** | 未缓存切换只发 1 次 init（boot 14 878ms + switch 19 691ms，无第三条） |
| B1 Guided Demo V2 | **PASS** | 1/6→6/6 全程；Scene 6 顺序 close-reading → Add research angle → Research Shelf；演示期间零业务请求；Exit 六项现场精确还原 |
| B2 Full-Screen Transition | **PASS** | 真指针→DOM **3–4ms**；`fixed`/`z-110`/整屏；目标名 **招商银行**；5 占位；取消按钮 **50/50 可命中**；`cancelRestoreMs=3ms`；30s 后无迟到覆盖（被中止的 init `dur=53ms`） |
| B3 Cached Restore | **PASS** | 五项目全等（zoom 125 / 已挪维度 / 便签 / AI 线程 / 活跃光圈维度）；`init ×0`；**15.8ms**；锚点 ID 前后相同 |
| B4 Failure States | **PASS** | 三类失败态 + Retry/Back 全部真指针验证；注入代码在**生产包里不存在** |
| B5 Console / Network | **PASS** | 本地动作 0 业务请求；console **0 uncaught / 0 error / 0 warn / 0 React / 0 hydration**；切换 init×1、缓存恢复 init×0、followup×1、search×1 |

详见 `docs/design-audit/task16-2/RELEASE_GATE.md`（含每一项的证据句）与 `INTERACTION_MANIFEST.md`（46 行的逐控件结果）。

## 4. 本轮修了什么（4 个真缺陷 + 1 个功能）

| 提交 | 问题 | 影响 |
|---|---|---|
| `0ad691e` | 从搜索结果切换时，过渡层显示股票代码而不是公司名 | MINOR |
| `3809567` | **`[data-transition-cancel]` 被同级的 `absolute inset-0` 内容层盖住，50 个采样点全部点不到** —— 代码注释承诺的“始终可用的返回”实际不可用，用户只能干等 15–30s | **MAJOR** |
| `63e2d84` | **`[data-demo-finish]`「开始研究 →」在 Demo 的 `pointer-events-none` 层里**，结束帧无法用自己的按钮退出 | **MAJOR** |
| `1835581` | **首次访问提示卡（`z-62`，右上角）盖住公司切换器 SAVED/RECENT 行 92% 的宽度**，首次用户点不了任何最近公司 | **MAJOR** |
| `4d2a5fd` | 新增 `src/lib/v5/test-failure.ts`：`?testFailure=research-init｜dimension｜followup`，只让**第一次**匹配请求失败（所以 Retry 验证的是“恢复”），`NODE_ENV` 编译期常量保证生产包内不存在 | B4 前置 |

**教训**：三个 MAJOR 都是同一类——「视觉上存在、真实指针点不到」。`elementFromPoint` / `elementsFromPoint` 扫描是发现它们的唯一手段，不要用「元素在 DOM 里 + `isVisible()` 为真」当作可点击证据。

## 5. 还没测的（11 项，Task 17 之前应清）

- ⌘K 命令面板（键盘）、Shift+1/2、Alt+←/→（驱动器发不出可靠修饰键组合）
- Marquee 多选 / Focus selected / Gather / Spread / Park
- `Refresh research`（`[data-refresh-research]`，强刷路径与「正在刷新…」文案）
- 建议维度的拖拽入画布（`[data-suggestion-trigger]`）
- 三种视口尺寸的正式矩阵（本轮只用 1280×720）
- 减弱动效（reduced motion）下的 Demo
- Reading 里的 Claim 列表 / ASK / CHALLENGE
- Reading 证据字段（metric/value/period/unit/source/calculation）归属校验
- 浏览器 Back/Forward 的语义后退（Esc 已 PASS）
- Demo 的 Pause / Resume / Skip（Exit 与结束帧 CTA 已 PASS）
- 演示被打断 → 自动暂停

## 6. 浏览器验收怎么做（本轮踩过的坑，别再踩）

**必须用真指针。** 但 `locator.click()` 在这个 IAB 构建里**完全不可用**（连 `force: true` 都超时）；可用路径是：

```js
const root = process.env.ZCODE_PLUGIN_ROOT;
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const { setupBrowserRuntime } = await import(pathToFileURL(join(root, "scripts", "browser-client.mjs")).href);
await setupBrowserRuntime({ globals: globalThis });
const browser = await agent.browsers.get("iab");
const tab = await browser.tabs.new();               // 每轮一条新标签页
const ev = (fn, arg) => tab.playwright.evaluate(fn, arg);
const rectOf = (sel) => ev((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; }, sel);
await tab.cua.click({ x: /* rect */, y: /* rect */ });   // 真指针，isTrusted=true
```

- `cua.click` 的事件 `isTrusted: true`，合规；**不要**用 `dispatchEvent`。
- **一条标签页的输入通道会退化**：先是每次点击从 ~50ms 涨到 ~5s，然后彻底不投递事件（返回成功但页面收不到任何 pointerdown）。对策：**每轮一条新标签页，整轮塞进一个 JS cell 里**（cell 上限 120s，`timeout_ms` 要设到 118000）。
- **不要依赖 `reload()`**：重载会和应用的 history 状态机打架（reload 后 `historyState` 带着旧 `{stockCode, dim, read:true}`），而且第二次 reload 后输入通道基本必坏。干净起点 = `tabs.new()` + `goto` + 清 storage + 一次 `reload`。
- **首屏要轮询，不要固定等待**：`/api/research/init` 实测 14.3s / 15.1s / 15.6s / 19.7s / 21.4s / 25.2s / 27.6s。所有"等 9s / 等 19.5s"的做法都会翻车。
- 计时用**页内标记**（`performance.now()` + capture 阶段 `pointerdown` 监听 + MutationObserver），不要用 Node 侧时间差——`cua.*` 本身有 40ms–5s 的派发开销，会把测量污染成 3s。
- 截图/录制：本轮完全没用（上一轮已与用户约定不做）。判定依据是 DOM 断言、命中测试、Resource Timing、页内计时。
- 断言 Resource Timing 时注意：**注入的失败请求不会产生 resource entry**（是合成的 `Response`，没有真实网络），所以失败态的"请求计数"要用别的方式验证（比如 Retry 后真实请求出现）。

## 7. 下一轮的最小执行顺序

1. 决定是否补测 §5 的 11 项；其中「三种视口矩阵」和「⌘K / 修饰键」需要新的驱动能力（本轮驱动器发不出修饰键）。
2. 若要闭环 Task 16.2B：重跑 `npm run package:submission`（当前 `dist-submission/StockLens_Submission.zip` 是 0.63MB，**早于本轮 5 个提交**），并把它计入「提交包不含 `docs/design-audit/`」的既有约定。
3. README 的测试数（309/356 → 385）与 `?testFailure` 的说明属于 Task 17 范围。
4. **不要**在没有新一轮 Task prompt 的情况下动产品代码。

## 8. 硬约束（违反即返工）

- 不得新增产品能力（Compare / Time Travel / Voice / 新数据源 / 新指标 / 新渲染器 / 新 AI 架构）；不得重设计 UI。
- 后端语义冻结；`src/lib/research|world|evidence` 不做改造。
- 不得输出确定性涨跌预测、收益承诺、买卖建议；事实/推断/未知必须区分；证据不足必须标 UNKNOWN。
- 不得提交 API Key / 隐私数据 / 受限数据；`docs/design-audit/` 与第三方参考截图不进提交包。
- **Task 17 未获准**：不做 README 定稿、不做根路由切换、不生成最终 ZIP/MP4、不宣布产品完成。

## 9. 未修的缺陷（本轮新发现，已记录未动）

`docs/design-audit/task16-2/KNOWN_BUGS.md` #14–#18，要点：
- Demo 提示卡写「观看 **60** 秒演示」，实际 50s（文案）。
- `cancelSwitch` 设的「已取消等待」永远不可见——`pendingCompany` 同一次提交里就被置空，过渡层立即卸载。
- **整页 reload 不恢复画布快照**：`sessionStorage["stocklens.canvas.*"]` 里存着 `camera.scale` 和挪动位置，但 boot 路径只写 `payloadCacheRef`、从不调 `applySession`（AI 线程倒是会从 `stocklens.thread.*` 恢复）。会话内缓存往返是好的（B3 PASS）。
- 切换器面板处在 `z-50` 的 header 层叠上下文里，任何 `z ≥ 55` 的浮层都能盖住它（#12 就是被 `z-62` 的提示卡盖住；`?perfDebug=1` 的 `z-[70]` 和 `?aiDebug=1` 的 `z-[75]` 面板也在这个角）。
- **OBSERVED ONCE, NOT REPRODUCED**：一次未缓存切换后 `localStorage["stocklens.shelf.recent"]` 只剩新公司，美的从 RECENT 消失。随后 5 次运行（含挂 `localStorage.setItem` 追踪器的一次）都写出 `["600036.SH","000333.SZ"]` 正确。`recordVisit` 从渲染闭包读 `recentCompanies`，是唯一找到的可疑机制，但没复现。

## 10. 产物索引

- `docs/design-audit/task16-2/`：`RELEASE_GATE.md`（六 Gate 状态 + 证据句 + 未测清单）、`INTERACTION_MANIFEST.md`（46 行逐控件结果，PASS 29 / PARTIAL 6 / NOT TESTED 11）、`KNOWN_BUGS.md`（#1–#18 + 两条“这是有意设计”）
- `docs/design-audit/task16-1/`：PERFORMANCE_AUDIT、PERFORMANCE_RESULTS、INTERACTION_LATENCY_MATRIX、LOADER_REFERENCE_AUDIT
- `docs/design-audit/task16/`：导航闭环 + Shelf + Demo V1 的 8 张图 + STATUS + guided-demo.webm 66s
- `docs/final/`：`REQUIREMENT_MATRIX.md`（17 行 15 PASS / 2 PARTIAL）、PACKAGE_MANIFEST、5 个骨架文件待 Task 17 定稿
- `dist-submission/StockLens_Submission.zip`（0.63MB，密钥扫描 PASS；**早于本轮 5 个提交，Task 17 需重跑**）· 打包命令 `npm run package:submission`
