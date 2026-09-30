# FUNCTION_PARITY — /observatory（业务母体） vs /observatory-v5（表现层）

方法：两个路由都在浏览器里实际点击（非代码阅读）。V5 的 API 全部复用旧后端（无 `/api/v5/*`、无 mock、无前端伪造）。

| Capability | /observatory（旧） | /observatory-v5（本轮前） | /observatory-v5（本轮后） | 实现方式 |
|---|---|---|---|---|
| Stock search / switch | working | 部分（搜索可用，切换未验证） | **working** | `GET /api/stocks/search?q=` + `POST /api/research/init`（同一 handler `handleChangeCompany`） |
| Research init | working | working（fixture 默认） | **working** | `POST /api/research/init`（复用） |
| Add dimension（手动） | working | 部分（⌘K 入口可用） | **working** | `POST /api/research/dimension`（唯一 handler `handleAddDimension`，三个入口共用） |
| Suggested dimension add | working | working（15.3A 验证） | **working** | 同上 handler（点击 Add / 拖入 drop） |
| Dimension → research | working | broken（无 Aperture→Reading） | **working** | Aperture → `Explore research →` → Reading split（`readingDimensionId` 单一状态源） |
| Evidence inspection | working | 部分（Reading 内锚点可用） | **working** | Claim 锚点 → Rail 显示 + Canvas 同证据节点高亮 |
| Follow-up AI（Ask） | working | broken（仅 composer，无真实调用验证） | **working** | `POST /api/followup`（Aperture •••→Ask / Reading 内 ASK / Evidence Ask） |
| UNKNOWN dimension | working | 部分 | **working** | 新增「库存压力」→ 真实返回 `库存与周转压力`，status=unknown + Evidence incomplete + missing 可读 |
| Pin | working | working（Aperture ••• → Pin summary） | **working** | 同一 `pinNote`（≤3） |
| Park / restore | working | working | **working** | 同一 `park`（••• → Park；底部 marker 恢复） |
| Claim challenge | working | working（Reading 内 CHALLENGE） | **working** | 复用 ReadingV3 三层（SUPPORT / COUNTER-SIGNALS / UNKNOWN） |

## 实现结构（§41–§42）

`ResearchCanvas`（V5 顶层）是唯一 orchestration owner，持有 research payload / company search / add dimension /
followup / active dimension / reading / evidence / canvas interaction 七类状态；子组件（Aperture、Reading、Command Lens）
不各自 fetch，全部由顶层 handler 注入：`handleChangeCompany` / `handleAddDimension` / `handleSuggestAdd` /
`handleExploreDimension` / `handleCloseReading` / `handleAskFollowup` / `handleSelectEvidence`。

## 后端契约（§63–§65）

未改任何后端契约；V5 仅做展示层映射（payload → Research Anchors / Trace / Aperture / Reading）。四个 API 在 E2E 中均实测 200（见 `network-audit.json`）。
