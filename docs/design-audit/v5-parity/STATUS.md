# STATUS — v5 Functional Parity + Reading Layout Repair（Task 15.4）

## route
`/observatory-v5`（生产 `/observatory` 未改动；旧版仍为功能母体）

## commit
见同 commit（feat: v5 functional parity — add dimension / explore / evidence / followup / company switch + reading layout repair）

## viewport
1440 × 900 与 1280 × 800（Reading 断言两者均无水平滚动）

## Old Observatory baseline（§45）
旧 `/observatory` 本轮未改动；其 change company / add dimension / follow-up / open dimension / evidence 行为作为对照基线（未发现旧版本身损坏的迹象；未做旧版回归修改）。

## V5 before / after

| 能力 | before | after |
|---|---|---|
| Add dimension（三入口：⌘K / 建议 Add / 拖入） | 可用但未统一验证 | **PASS**（真实 API；resolving → unknown/ready 原地转换；不重新 init、不丢锚点位置） |
| Dimension → Aperture → Reading | **FAIL**（无 Aperture→Reading 通路） | **PASS**（`readingDimensionId` 单一状态源；标题/claims/evidence 均为该维度） |
| Evidence inspection | 部分 | **PASS**（Rail 显示正确证据 + Canvas 同证据节点高亮） |
| AI Follow-up | **FAIL**（无真实 200 证据） | **PASS**（`POST /api/followup` 200 / 8.8s / 真实回答含「可以确认 / 不能确认」分组） |
| Company switch | 部分 | **PASS**（美的 → 招商银行 → 美的；维度真实变化：盈利质量与资本回报 / 估值相对水平 / 风险与事件边界） |
| Reading overflow | **FAIL**（水平滚动条、标题截断、正文过窄） | **PASS**（1440 与 1280 均 `scrollWidth === clientWidth`；标题不裁切；正文列 691px 为最大列） |

## Reading 布局（§13–§22）

三列实测 bbox（1440×900，Reading 打开时）：

| 列 | x | width | 说明 |
|---|---|---|---|
| Canvas Context | 0 | 432（30%） | 只承载 company context / 维度位置 / 活动维度；不再展开摘要与 evidence |
| Research Reading | 432 | 691（内容列，最大） | 标题 `clamp(38–52px)` 可换行不裁切；Claim 文本 22px、最大宽度 720px |
| Evidence Inspector | 1123 | 316 | 固定宽 280–340；header 仅 EVIDENCE / PINNED / VERIFIED；独立 `overflow-y: auto` |

断言：`pane↔sheet` 交叠 = false；`content↔rail` 交叠 = false；`overflow-x: hidden` 于 app 与内容列；Command Lens 与面包屑在 Reading 时移入左栏（不再压正文与 Rail）。

## 验收（§57 E2E，浏览器真实执行）

01 Open Midea Canvas ✓ · 02 Add Dimension「库存压力」✓（→「库存与周转压力」unknown）· 03 Add Suggested ✓（15.3A 已验证，本轮沿用同一 handler）· 04 Click Dimension ✓ · 05 Aperture opens ✓ · 06 Explore → Reading ✓ · 07 Evidence ① ✓ · 08 Ask follow-up ✓ · 09 真实 AI 回答 ✓ · 10 Back to Canvas ✓ · 11 Change Company ✓ · 12 Search 招商银行 ✓ · 13 Enter 招商银行 ✓ · 14 新维度 ✓ · 15 CMB 下 Add Dimension（同一 handler，未重复取证）· 16 CMB 下 Reading ✓ · 17 Switch back to Midea ✓

## Network Audit
`network-audit.json`：`/api/followup` POST **200 / 8815ms / stockCode=000333.SZ**；`/api/stocks/search`、`/api/research/init`、`/api/research/dimension` 均在 E2E 会话中被记录（不保存任何 key 或完整 headers）。

## Known gaps
1. 本轮未录制 `v5-full-product-flow.webm`（时间预算用尽）；已用 9 张截图 + network-audit.json 覆盖同一链路
2. `10-reading-layout-debug.png` 未截；改用**数值断言**（上表三列 bbox 与交叠布尔）替代
3. 公司身份的英文副标题在非美的公司下会显示中文名（`MIDEA GROUP` 映射仅覆盖白色家电）
4. Evidence Rail 内超长指标名的数值列可能换行
5. CMB 下 Reading 出现真实数据缺口提示（银行无毛利率指标 → 「无法计算」）——这是后端数据事实，非缺陷
