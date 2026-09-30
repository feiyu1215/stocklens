# STATUS — Global AI Research Lens（Task 15.4A）

## route
`/observatory-v5`（生产 `/observatory` 未改动）

## 架构（§8/§26/§41）
- **一个 composer**：`ResearchCanvas` 顶层 `handleAskAI({ question, scope })` 是唯一 AI 入口；Aperture •••→Ask、Reading 内 ASK、回答内证据锚点全部只「设置 scope + 聚焦同一个 Lens」
- **一个 thread 模型**：`Map<stockCode, AiEntry[]>`（§20 按公司隔离；切回公司可恢复本 session thread）
- **一个后端**：`POST /api/followup`（复用；无 `/api/v5/chat`、无 mock、无前端金融作答）
- **与 Command Palette 彻底分离**：`⌘K` 只开命令面板（Ask company / Fit view / Add research angle / Change company…），底部 Lens 是常驻真输入框（textarea）

## AI Lens
- Collapsed：底部居中 580×50，`✦ <scope> <placeholder> ↵ ⌘K Commands`
- Scope 自动来自 activeCompany / activeDimension / activeClaim / activeEvidence（§7，无需用户重复说明）
- Placeholder 随 scope：`问 StockLens 关于美的集团的问题…` / `追问「增长韧性」…` / `追问这条结论…` / `询问这条证据…`
- 键位：`/` 聚焦 Lens、`⌘K` 命令面板、`Enter` 发送、`Shift+Enter` 换行、`Esc` 层级（command → thread → blur）
- Thread：640px 宽 / max-height 366，向上展开；editorial 布局（问题 → 直接回答 → 可以确认 → 暂时不能确认）；scope 变化插入 `CONTEXT CHANGED → …` divider 而不清空历史；回答内证据锚点 ①②③ 可点（→ Canvas 同证据高亮 / Evidence Inspector 钉住）
- Loading 文案为 `Reviewing current evidence…`（不假装读取财报/计算指标）；失败仅在 thread 内提示 `AI interpretation is temporarily unavailable. Current evidence remains available.`
- `?aiDebug=1`：scope / stockCode / dimensionId / claimId / evidenceId / followup 状态（无 secret）

## Functional acceptance（§55）

| # | 项 | 结果 |
|---|---|---|
| 1 | 底部输入框真的可以输入（真 textarea，非 div） | **Yes** |
| 2 | Company Canvas 不选任何东西也能问 AI（真实 200 + grounded 回答） | **Yes** |
| 3 | Dimension Ask 使用当前 Dimension context（placeholder → 追问「增长韧性」…，scope: dimension + dimensionId） | **Yes** |
| 4 | Claim Ask 使用 Claim evidence（Reading ASK → scope: claim + claimId + 自动聚焦） | **Yes** |
| 5 | Evidence Ask 使用当前 Evidence | **Yes（行为已验证：锚点点击后 Rail 钉住该证据、scope 逻辑为 evidence；debug 断言与挂载竞态，未取到日志文本）** |
| 6 | 回答内 Evidence anchor 可反向定位 Canvas / Inspector | **Yes** |
| 7 | AI Lens 与 Command Palette 彻底分离 | **Yes**（⌘K 开面板时输入框仍在） |
| 8 | 公司切换后 AI context 不串股 | **Yes（实现为按 stockCode 分桶；美的会话内验证；跨公司切换沿用 15.4 已验证的切换链路）** |

## Multi-turn 诚实说明（§18/§48）
`/api/followup` 为**单轮 grounded** 接口（company + question + evidenceIds）。V5 的 UI thread 保留多轮历史，但**每轮独立携带当前 scope 与证据上下文**，不声称模型能看到未发送的历史上下文。若后续要真实多轮语义记忆，需要后端支持 prior turns。

## Screenshots
`docs/design-audit/global-ai-lens/`：01-ai-lens-collapsed · 02-ai-lens-focused · 03-company-question · 04-company-answer · 05-dimension-scope · 06-claim-scope · 09-command-palette-separate · network-audit.json

## Known gaps
1. 07-evidence-scope / 08-thread-multiturn / 10-company-switch-thread 截图未单独采集（对应行为已在 04/06 与 15.4 记录中覆盖）
2. `global-ai-lens.webm` 未录制（时间预算耗尽）
3. Thread 展开时会覆盖 Focus Aperture 的下半部（浏览器可 Collapse；未做避让位移）
4. Thread 建议问题第一版为规则生成（conflict/unknown 触发），未接 `nextQuestions`
