# StockLens — 交接文档（给下一个会话）

> 生成时间：2026-10-01 · 上一会话（ZCode）· 用途：无缝接手，不要重新发现已知事实
> 上一版停在 16.2B；本版在 **Task 17（最终交付打包）+ Task 17.1（提交前合规补丁）** 之后。

## 0. 一句话现状

**Task 16.2A / 16.2B / 17 / 17.1 / 17.2 全部完成，交付物已生成。** 交互清单 **PASS 47 · FAIL 0 · NOT TESTED 0 · PARTIAL 0**（1 行 N/A 附理由）；六 Gate 仍 PASS；需求矩阵 **PASS 19 · PARTIAL 1 · NOT DELIVERED 1（可选项）**；ZIP 2.21MB、密钥扫描 PASS；生产 smoke 六项 PASS。

> **⚠️ 当前唯一待办（用户明确要求，勿丢弃）**：在 Vercel 之外**再部署一个国内可直连的镜像**。完整方案在 [`DOMESTIC_DEPLOY_PLAN.md`](DOMESTIC_DEPLOY_PLAN.md)。**2026-10-03 起准备全部就绪**（CLI 已装、standalone 已配并构建验证通过、多阶段 Dockerfile 已提交），用户只剩三步：① 注册腾讯云+实名认证 ② 开通 CloudBase 并创建环境 ③ 在 `D:\zcode存储\stocklens` 跑 `tcb login`——之后会话用 `tcb env:list` 自查环境 ID 即可接管部署。完成后回填 README「国内备用地址」行并 push。背景：本机网络对 `*.vercel.app` DNS 污染 + TLS 重置（用户实测打不开），产品本身健康（部署 Ready、AI 链路实测成功）；GitHub README 顶部已有醒目访问提示（commit `a1f8ae2`）。

## 1. 工程与部署

| 项 | 值 |
|---|---|
| 仓库 | `D:\zcode存储\stocklens`（Next.js 16 App Router + React 19 + TS + Tailwind 4 + Vitest） |
| 生产 URL | https://stocklens-blush.vercel.app/observatory-v5**?live=1**（`?live=1` 必须带，否则首屏走 fixture） |
| 本地 dev | `npm run dev` → http://localhost:3000/observatory-v5 |
| 部署 | `export VERCEL_TOKEN=$(cat .tools/vercel-token) && npx vercel --prod --yes --token=$VERCEL_TOKEN` |
| git push | 需要代理：`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD` |
| 校验四件套 | `npx tsc --noEmit` · `npx eslint src/components/v5 src/lib/v5` · `npx vitest run`（**385 tests / 28 files 全过**）· `npx next build` |
| 16.2A 提交 | `0ad691e` `3809567` `63e2d84` `1835581` `4d2a5fd` `aa649eb` |
| 16.2B 提交 | `6e79c2b`（建议维度位置）`dd9d5c6`（pointer capture）`2dce14e`（弹层方向）`db618d4`（Esc 链） |

## 2. 产品结构（研究主链）

`Company Canvas → Focus Aperture → Reading → Evidence Inspection`，AI Research Thread 是并行工具层，Command Palette 是临时控制层。

- `src/components/v5/ResearchCanvas.tsx`（主编排，~3000 行，所有交互都在这）
- `src/components/v5/CompanyTransition.tsx`（全屏过渡，`fixed inset-0 z-[110]`）
- `src/components/v5/DemoOverlay.tsx` + `src/lib/v5/demo.ts`（Guided Demo V2：6 场景 / 50s）
- `src/lib/v5/shelf.ts`（Research Shelf）、`switch-guard.ts`、`perf.ts`、`test-failure.ts`（仅非生产的失败注入）
- `src/components/v3/ReadingV3.tsx`（**v3/v4/v5 共用**；新增 props 必须可选，例如本轮的 `escOwnedByParent`）
- 后端（冻结）：`src/app/api/{stocks/search, research/init, research/dimension, followup, observatory/*}/route.ts`

调试开关：`?aiDebug=1`、`?perfDebug=1`、`?fixture=<name>`、`?live=1`、`?testFailure=research-init|dimension|followup`（非生产）。

## 3. 六个 Gate（结论沿用，未重测）

| Gate | 状态 | 关键数字 |
|---|---|---|
| duplicate `research/init` | PASS | 未缓存切换 / 刷新各恰好 1 次 init，全程无重复 |
| B1 Guided Demo V2 | PASS | 1/6→6/6 按 5/6/7/12/8/12s 推进；Scene 6 顺序正确；零业务请求；Exit 六项还原 |
| B2 Full-Screen Transition | PASS | 首帧 3–4ms；取消按钮 50/50 可命中；`cancelRestoreMs=3ms`；30s 无迟到覆盖 |
| B3 Cached Restore | PASS | 五项目现场全等；`init ×0`；15.8ms |
| B4 Failure States | PASS | 三类失败 + Retry/Back；注入代码不在生产包 |
| B5 Console / Network | PASS | 0 uncaught / 0 error / 0 React / 0 hydration |

## 4. 16.2B 做了什么

**清空了剩余的 11 项 NOT TESTED 与 6 项 PARTIAL**（详见 `INTERACTION_MANIFEST.md`，48 行全部有真实指针/键盘证据）。扫出并修掉 **4 个真缺陷**，全部是"看得见、点不到 / 点错方向"这一族：

1. **建议维度落在折叠线以下**（世界 `y=806`/900，1280×720 下只有 11% 在屏内）→ 移到 `y=700`。
2. **建议维度的 pointer capture 把 click 改派走**（对 `parentElement` 调 `setPointerCapture`）→ 改为**超过 5px 阈值才捕获**，点击与拖拽都恢复。
3. **建议说明层向下展开把 Add 按钮推出视口**（`y=737`/720）→ 改为**向上展开**（`bottom-full`）。
4. **Reading 自带的 Escape 处理器抢先关掉 Reading**（线程却还开着）→ 新增可选 prop `escOwnedByParent`，v5 传 true，Esc 链恢复为 Demo → Palette → Thread → Evidence → Reading → Aperture → Canvas。

用户在本轮中途明确指示：**不为 390×844 这种极端比例改产品**。因此相机与提示卡位置未动，390 按"超范围、附测量"记入 `NOT APPLICABLE`。

## 5. 浏览器验收怎么做（本轮新增的关键经验）

**键盘**：`document.hasFocus()` 为 false 时，键盘事件**完全不会到达页面**（三种路径都试过）。正确配方：`visibility.set(true)` → **先用一次真实点击让页面获得焦点** → 再用 `cua.keypress`。

- `cua.keypress({ keys })` 的 `keys` 是**数组**且代表一个组合：`["Control","k"]`、`["Alt","ArrowLeft"]`、`["Escape"]`、`["Space"]`（**空格必须写 `"Space"`，写 `" "` 会被拒**）。
- `cua.keypress` / `locator.press` 在**未聚焦**的页面上都静默无效（返回成功但零事件）——先装一个 capture 阶段 keydown 记录器判断。
- 指针：`locator.click()` 在这个 IAB 构建里不可用（连 `force` 都超时），用 `cua.click({x,y})`，坐标取自现场 `getBoundingClientRect()`；事件 `isTrusted: true`，合规。
- **一条标签页的输入通道会退化**（点击从 ~50ms 涨到 ~5s，然后彻底不投递但返回成功）。对策：**每轮一条新标签页 + 整轮塞进一个 JS cell**（`timeout_ms: 118000`）。
- **首屏轮询，不要固定等待**：init 实测 14.3–27.6s。
- 判定"点得到"的唯一手段是 `document.elementsFromPoint()` 扫描控件矩形；`isVisible()` 与"元素在 DOM 里"都不算证据。本轮 4 个缺陷里 3 个是靠它 / 事件目标日志定位的。
- **`matchMedia` 在这个浏览器里每次返回不同对象**。要模拟 `prefers-reduced-motion`：必须在 `goto` 返回后**立刻**（不等 load）覆写 `window.matchMedia` 并缓存同一个 fake 对象，抢在 hydration 之前；派发事件给新拿到的 MQL 是无效的。
- 事务性提示：一次 `evaluate` 失败会中止整个 cell，**Node 变量不要写进页内函数**。

## 6. 下一轮（Task 17）的范围

Task 17 **只整理交付、不再开发产品**：

1. 重跑 `npm run package:submission` —— 当前 `dist-submission/StockLens_Submission.zip`（0.63MB）**早于 16.2A/16.2B 的 9 个提交**，必须重做，并保持"不进 `docs/design-audit/`"的既有约定。
2. README：测试数已从 309/356 变为 **385**；补 `?testFailure=` 说明。
3. `docs/final/`：`REQUIREMENT_MATRIX.md`（17 行 15 PASS / 2 PARTIAL）与 5 个骨架文件待定稿；Root 路由切换仍在等指令。
4. 最终截图 / 演示视频（若做）/ Production Smoke / Secret Scan。
5. 未修缺陷见 `KNOWN_BUGS.md` #4、#8、#9、#14–#18、#23–#25。其中 #14（提示卡写「60 秒」实际 50s）与 #15（「已取消等待」永远不可见）是纯文案/反馈，属 Task 17 可顺手处理的范畴。

## 7. 硬约束（违反即返工）

- 不得新增产品能力（Compare / Time Travel / Voice / 新数据源 / 新指标 / 新渲染器 / 新 AI 架构）；不得重设计 UI。
- 后端语义冻结；`src/lib/research|world|evidence` 不做改造。
- 不得输出确定性涨跌预测、收益承诺、买卖建议；事实/推断/未知必须区分；证据不足必须标 UNKNOWN。
- 不得提交 API Key / 隐私数据；`docs/design-audit/` 与第三方参考截图不进提交包。
- Task 17 未获准前不要动产品代码；**收到 Task 17 后也只整理交付、不开发**。

## 8. 产物索引

- `docs/design-audit/task16-2/`：`INTERACTION_MANIFEST.md`（48 行，PASS 47 / FAIL 0 / NOT TESTED 0 / PARTIAL 0）、`RELEASE_GATE.md`（16.2B 状态 + 4 个修复的证据 + 390 范围说明）、`KNOWN_BUGS.md`（#1–#25 + 两条"有意设计"）
- `docs/design-audit/HANDOFF.md`（本文件）
- `docs/design-audit/task16-1/`：PERFORMANCE_AUDIT、PERFORMANCE_RESULTS、INTERACTION_LATENCY_MATRIX、LOADER_REFERENCE_AUDIT
- `docs/design-audit/task16/`：导航闭环 + Shelf + Demo V1 的 8 张图 + STATUS + guided-demo.webm
- `docs/final/`：REQUIREMENT_MATRIX、PACKAGE_MANIFEST、5 个骨架文件
- `dist-submission/StockLens_Submission.zip`（**需在 Task 17 重跑**）· 打包命令 `npm run package:submission`
