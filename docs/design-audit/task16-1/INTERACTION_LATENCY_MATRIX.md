# Interaction Latency Matrix（Task 16.1 §2）

分类依据：**LOCAL = 不发起任何业务 API 调用**；**REMOTE = 必须等待后端**。
凡标记为 LOCAL 的动作，其实现路径中不得出现 `fetch`。

| Action | Type | 触发的网络 | 实测视觉响应 | 预算 | 结论 |
|---|---|---|---|---|---|
| Dimension hover | LOCAL | 无 | — | < 50ms | 纯 CSS/React 状态（`setHoverId`），无 fetch ✔ |
| Dimension click → Focus Aperture | LOCAL | 无 | **35ms**（net:no） | < 100ms | ✔ 实测（perfDebug 面板） |
| Aperture close (Esc / 点击空白) | LOCAL | 无 | — | < 100ms | 纯状态 + `history.back()`，无 fetch ✔ |
| Explore → Reading | LOCAL | 无 | **74ms**（net:no） | < 150ms | ✔ 实测 |
| Reading → Canvas (breadcrumb / Esc) | LOCAL | 无 | — | — | 纯状态（相机恢复本地快照）✔ |
| Evidence select | LOCAL | 无 | **74ms 同层内**（未单独采样） | < 100ms | 纯状态 ✔（采样归属：Reading 层点击记为 chrome） |
| Pin | LOCAL | 无 | — | — | 纯状态（`setNotes`）✔ |
| Park / Restore | LOCAL | 无 | — | — | 纯状态 ✔ |
| Pan / Zoom / Gather / Spread / Focus selected | LOCAL | 无 | — | — | 纯状态（camera/positions）✔ |
| Open Company Switcher | LOCAL | 无 | **52ms**（net:no） | < 100ms | ✔ 实测 |
| Open Command Palette (⌘K hint) | LOCAL | 无 | **40ms**（net:no） | < 100ms | ✔ 实测 |
| Open AI Thread (focus composer) | LOCAL | 无 | **11ms**（net:no） | < 100ms | ✔ 实测 |
| Company switch — **cached session** | LOCAL | **0 次 init**（会话缓存命中的代码路径，见 `applySession`） | 未采到样本（见下） | < 400ms | 代码路径无 fetch ✔；实测缺失 |
| Company switch — **uncached** | REMOTE | `POST /api/research/init` ×1 | 过渡层（目标公司名 + 正在构建研究空间… + 5 个中性占位）在点击后 **~400ms 内**被探针读到（探针本身有 ~300ms 间隔，非精确测量） | < 150ms | 结构 ✔；精确数字未采到 |
| Refresh research | REMOTE | `POST /api/research/init` ×1 | — | — | 有意为之 |
| Add Dimension | REMOTE | `POST /api/research/dimension` ×1 | 临时锚点（`<label>` + `resolving…`）在 fetch **之前**同步写入状态，下一帧可见 | < 100ms | 结构 ✔；未采到独立样本 |
| AI follow-up | REMOTE | `POST /api/followup` ×1 | 用户问题 + `Reviewing …` 运行中条目在 fetch **之前**同步写入线程 | < 100ms | 结构 ✔；未采到独立样本 |
| Stock search | REMOTE | `GET /api/stocks/search` ×1 | — | — | 有意为之 |

## 采样方法
`?perfDebug=1` 打开交互计时面板。面板记录 `pointerdown → 首个 rAF 之后的视觉提交`（`interactionPerf.markStart/markVisual`），并检查该窗口内是否出现新的业务请求（`performance.getEntriesByType("resource")` 差值），因此 `net:no` 是**实测**结论而不是声明。

## 未采到的样本（诚实记录）
- **缓存路径切换**与**未缓存切换的首帧精确毫秒**：这两项在采集过程中被一个界面缺陷打断——切换后遗留的 `readingId` 会让头部 Chrome（Company Identity / ★ / 切换器）被空的 Reading 面包屑顶掉，我为此加了两处修复（`readingDimension` 判定 + payload 变化时对账陈旧 `readingId`）。修复已提交，但**在修复后的构建里没有重新采样**。
- **Add Dimension / AI follow-up 的独立 perf 行**：两者的"立即中间态"在代码路径上成立（状态同步写入后 rAF 记点），但没有单独读到面板行。
