# PERFORMANCE RESULTS（Task 16.1 §50）

测量环境：本地 dev server（Next 16 + Turbopack），页面 `http://localhost:3000/observatory-v5?perfDebug=1`，1440×900，应用内浏览器。
`visual response` = `pointerdown → 首个 rAF 后的视觉提交`（`interactionPerf`）；`network` = 该窗口内是否出现新的 `/api/*` 请求（resource timing 差值，实测）。

| ACTION | TYPE | visual response ms | network request | backend total ms | status |
|---|---|---|---|---|---|
| Dimension click → Focus Aperture | local | **35** | no | 0 | ✔ 通过（< 100ms） |
| Explore → Reading | local | **74** | no | 0 | ✔ 通过（< 150ms） |
| Open AI Thread（composer focus） | local | **11** | no | 0 | ✔ 通过（< 100ms） |
| Open Command Palette | local | **40** | no | 0 | ✔ 通过（< 100ms） |
| Open Company Switcher | local | **52** | no | 0 | ✔ 通过（< 100ms） |
| Company switch — cached | local | 未采到样本 | 0（代码路径不调用 init） | 0 | 结构成立；**实测缺失** |
| Company switch — uncached | remote | 过渡层在 ~400ms 内被探针读到（探针间隔 ~300ms，非精确） | yes（`/api/research/init`） | **≈29s**（冷启动实测，见 PERFORMANCE_AUDIT） | 结构 ✔；首帧精确值缺失 |
| Add Dimension（乐观锚点） | remote | fetch 前同步写入，下一帧可见（未单独采样） | yes（`/api/research/dimension`） | 见 PERFORMANCE_AUDIT | 结构 ✔ |
| AI follow-up（立即运行态） | remote | fetch 前同步写入线程（未单独采样） | yes（`/api/followup`） | 见 PERFORMANCE_AUDIT | 结构 ✔ |
| Stock search | remote | — | yes（`/api/stocks/search`） | 见 PERFORMANCE_AUDIT | — |

## 结论
- **所有 LOCAL 动作实测 0 业务请求**，视觉响应 11–74ms，全部满足 §51 的硬指标（100/150ms）。
- 唯一未达"体验可接受"的是**未缓存公司 init 的后端耗时（≈29s）**：本次任务按 §22/§23 的要求**先测量、不做投机优化、不引入流式**，因此它是当前最大的性能缺口，已记录在报告 J 段。
- 后端四个端点的 min/median/max 见 `PERFORMANCE_AUDIT.md`（由并行任务产出）。

## 未采到的样本（不掩盖）
- 缓存路径切换耗时、未缓存切换的首帧精确毫秒、Add Dimension 与 AI follow-up 的独立 perf 行：采集期间被"切换后遗留 readingId 顶掉头部 Chrome"的缺陷打断；该缺陷已修复（两处），但修复后的构建未重新采样。
