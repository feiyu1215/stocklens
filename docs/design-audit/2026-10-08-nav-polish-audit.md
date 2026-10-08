# 导航回归修复 + 润色审计（2026-10-08）

范围：本地 `localhost:3000`（`next dev`）。方法：Playwright + Chromium 真实指针实测，不做推理替代验证。
判定口径沿用 `docs/final/测试说明.md`：**交互类结论只认真实指针与真实键盘**。

---

## 一、已修复：研究空间 → 研究库 跳回首页

### 被违反的原则

`docs/design-audit/ai-workspace-v1/DECISION.md`（§2026-10-07）明文记载：

> 研究库回跳使用 `resume=1`，恢复已保存的研究载荷与画布现场……浏览器验证公司搜索、新增后自动布局、**研究库往返恢复**与移动端页面。

即**研究库往返必须闭合**：从研究库进一家公司 → 必须能回到研究库。
从研究库进入的链接确实带了 `resume=1`（`workspaceHref(code, "", false, true)`），说明"回来"这条路设计过、验证过；但两个出口被硬编码成 `/`，把往返截断了。

### 根因

两处标签写"研究库"、`href` 却是 `/`（首页）：

| 文件 | 行 | 文案 | 修复前 | 修复后 |
| --- | --- | --- | --- | --- |
| `src/components/v5/InitialResearchLoading.tsx` | 42–47 | `← 返回研究库` | `href="/"` | `href="/research"` |
| `src/components/v5/MobileResearchList.tsx` | 24 | `← 研究库` | `href="/"` | `href="/research"` |

### 实测证据（修复前 → 修复后）

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 桌面 1440×900，加载中点「← 返回研究库」 | 落到 `/`，`data-surface="start"` ❌ | 落到 `/research`，`data-surface="library"` ✅ |
| 移动 390×844，画布列表「← 研究库」 | `href="/"` ❌ | 关闭 Sidekick 后真实指针点击 → `/research`，`surface=library` ✅ |
| 桌面画布已加载「▦ 研究库」 | 本来就是 `/research`（正确，未改动） | 不变 ✅ |

补充实测：`/research` 服务端渲染即 `data-surface="library"`，水合后也稳定停在 library，**路由本身没问题**；问题纯粹在两个硬编码出口。

移动端注意：390 宽下 `MobileResearchList`（`z-[80]`）会被全屏 Sidekick（`z-[90]`）盖住，`elementFromPoint` 解析不到链接。这是设计如此（`DECISION.md` §4：移动端 Sidekick 全屏，关闭后恢复画布），**不是缺陷**；关闭 Sidekick 后链接可达且可跳转，已实测通过。

### 回归检查

- `tsc --noEmit`：0 错
- `eslint src`：0 警告
- `vitest run`：**417 passed / 32 files**

---

## 二、润色审计（客观指标，非主观观感）

六条路由 × 桌面/移动全扫：`/`、`/research`、`/lab/ai-workspace-v1?stockCode=000333.SZ`。

### P0 — 建议尽快处理

**1. 研究空间失败态是死胡同**

`src/components/v5/ResearchCanvas.tsx:2283-2291`，`failed === true` 时只渲染一行英文：

```
RESEARCH SPACE UNAVAILABLE
```

无返回首页、无返回研究库、无重试，**用户被困住**，只能手动改地址栏。同时这是全产品唯一的英文硬编码串，与中文文案体系不一致（对照 `CompanyTransition` 的失败态既有 `onRetry` 也有 `onCancel`）。

**2. 首次研究无法中止，且无超时上限**

- 首次进入走 `fetch("/api/research/init")`（`:407`），**没有 AbortController**；而切换公司有 `switchAbortRef`（`:294`、`:1530`、`:1598`）。同一产品内能力不对称。
- `InitialResearchLoading` 只有"返回研究库"一个出口，没有取消/中止。
- `initialElapsedSec`（`:433-440`）只有每秒递增，无上限；`:2297` 处仅在第 30 秒加一句安抚文案。接口不返回时永远转圈。

### P1 — 值得处理

**3. 点击热区小于 24×24（WCAG 2.5.8）**

实测尺寸（`w × h`）：

| 元素 | 尺寸 | 出现位置 |
| --- | --- | --- |
| `↑ 返回新研究` | 61 × 14 | `/research` |
| `查看公司研究矩阵 ↓` | 96 × 13 | `/` |
| `← 研究库` | 46 × 17 | 移动端画布列表 |
| `打开示例画布 →` | 75 × 19 | 页头 |
| 语言切换 `中` / `EN` | 26 × 22 / 28 × 22 | 页头 |
| 侧栏 `01` / `02` | 25 × 20 | 页头侧栏 |

**与项目自身标准冲突**：`ResearchCanvas` 里同一批控件都显式写了 `minHeight: 36`（如 `:2748`、`:2780`、`:2845`）。首页/研究库这批文字链接没有沿用该标准。最小改动是给它们加透明内边距撑到 ≥36 高，视觉不变、热区合规。

**4. 缺少 favicon**

`public/` 为空、`layout.tsx` 未声明图标 → `/favicon.ico` 404，这是首页控制台那条报错的来源。浏览器标签页显示默认图标，对一个重设计的偏视觉产品是可见的掉档次处。

### P2 — 建议记录，不必现在动

**5. 语言切换只覆盖 1 / 11 个组件**

`stocklens.locale` 只在 `src/components/v5/ResearchHome.tsx` 被读取。其余 v5 组件全为硬编码中文（`ResearchCanvas.tsx` 214 处、`ResearchSidekickPanel.tsx` 25 处、`CompanyTransition.tsx` 19 处……）。切到 EN 后进入研究空间仍是全中文。要么补齐，要么把 EN 开关从研究空间入口移除（半套 i18n 比没有更容易被当成 bug）。

**6. 配色常量 5 处重复定义**

`CanvasAnchorLayer.tsx:8`、`CompanyTransition.tsx:3`、`DemoOverlay.tsx:5`、`ResearchCanvas.tsx:75`、`ResearchSidekickPanel.tsx:38` 各自定义了一整套 `ink: "#11151B"` 等值。这是典型的多 AI 各自造轮子的痕迹，改品牌色要动 5 个文件。

**7. 三处 `/research` 硬编码**

`ResearchCanvas.tsx:2777`、`InitialResearchLoading.tsx:43`、`MobileResearchList.tsx:24`。本次 bug 正是这种重复造成的。建议抽一个 `RESEARCH_LIBRARY_HREF` 常量，从根上防止复发。

### 已核查、无问题的项

- **术语**：全仓库（src + docs）**无"案例库"残留**，统一为"研究库"，无需改动。
- **横向溢出**：六条路由 × 两种视口全部 `scrollWidth === clientWidth`，0 溢出。
- **无障碍命名**：无图标按钮缺 `aria-label`。
- **控制台**：除 favicon 404 外无 error / warning，无 `pageerror`。
- **研究库出口一致性**：修复后所有含"研究库"的可点元素目的地一致。

---

## 三、验证脚本

一次性探针保留在 `.tmp/`（已被 `.gitignore` 忽略）：

- `.tmp/nav-probe.cjs` — 导航链路复现
- `.tmp/nav-probe2/3/4/5.cjs` — 桌面/移动端分场景复测
- `.tmp/polish-audit.cjs` — 六路由客观指标扫描
- `.tmp/probe404.cjs` — 失败请求抓取

运行：`NODE_PATH=<workspace>/node_modules node .tmp/<script>`

---

## 四、落地记录（同日第二轮）

用户确认全部条目执行，并追加报告了一个布局回归。逐项状态：

### 4.1 自动排列回归（用户追加）——已修复

**现象**：画布自动排列变成"一行一竖、严丝合缝"的九宫格，失去原定的参差有序。

**根因**（`git diff HEAD` 实证）：`src/lib/v5/canvas.ts` 的未提交改动把 8 个手工 editorial slots（x 0.17–0.78 / y 0.17–0.77 的自由散布）+ `decollide` 避让，替换成 `ORDERED_COLUMNS = [500, 820, 1140]` + 固定 `ROW_GAP = 225`，"编辑节奏"只剩 ±20–34px 抖动，且删掉了避让函数。配套新增的 `tests/v5-canvas-layout.test.ts`（未跟踪）把这套刚性布局固化了下来。

**修复**（`src/lib/v5/canvas.ts`）：
- 列基线改为**每行都不同**（`ROW_COLUMN_BASES`，5 行一轮），上下两行的列不再垂直对齐；
- 错落幅度按"最终落点"反推标定：同一列在相邻行之间相差约 60–90px，行内纵向错落 72–96px；
- 恢复确定性避让（只在同行内向右让位，绝不跨行），长标题不会破坏编号顺序与行间分离。

**实测**（Chromium 量测渲染落点）：

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 第 1 列 x 跨度 | 52px | 112px |
| 第 2 列 x 跨度 | 18px | 49px |
| 第 3 列 x 跨度 | 20px | 42px |
| 行内纵向错落 | 48 / 80px | 62 / 80px |

截图复核：02 低于 01/03、05 低于 04/06，三列上下不再对齐，无重叠、无出界。
`tests/v5-canvas-layout.test.ts` 3 项断言（追加编号、阅读顺序、不重叠）全部保持通过。

### 4.2 P0-1 失败态死胡同——已修复

`ResearchCanvas.tsx` 的 `failed` 分支由一行英文改为中文面板：标题「研究空间暂时无法完成」（与 `CompanyTransition` 措辞一致）+ 说明 + **重试**按钮 + **返回研究库**出口。

### 4.3 P0-2 无法中止 / 无超时——已修复

- init effect 改为按 `initRun` 代号可重跑，请求带 `AbortController`，cleanup 会中止残留请求；
- 加载页新增「中止等待」（`data-init-cancel`）→ 进入「已中止这次研究准备」确认态（重新开始 / 返回研究库）；
- 中止与失败分流：`signal.aborted` 不再误报为失败；
- 等待文案 30s / 90s 两档升级。未做硬超时自动中止——那会丢掉一次合法的慢请求，改为把决定权交给用户。

**实测**：`?testFailure=research-init`（dev 注入 500）→ 失败态文案与两个出口均可见可达（`elementFromPoint` 命中按钮本身）→ 点重试 → **27 秒后加载页消失、6 个锚点渲染、ticker 正常**（真实恢复，非伪造）。中止 → 确认态 → 重新开始同样走通。

### 4.4 P1-3 点击热区——已修复

`ResearchHome`（语言切换、打开示例画布、查看公司研究矩阵、返回新研究、01/02 侧栏）与 `MobileResearchList`（← 研究库）、`MarketTrendStrip`（1M/3M/6M/YTD/ALL）统一加 `after:` 伪元素外扩命中区（相邻控件只纵向外扩，避免命中区互相重叠）。视觉与布局零变化。

**实测**：在元素 rect 外 9–10px 处 `elementFromPoint` 均解析到元素本身（首页「查看公司研究矩阵」上下两侧均命中）。注：rect 尺寸不变是预期行为，命中区在伪元素上。

### 4.5 P1-4 缺 favicon——已修复

新增 `src/app/icon.svg`（复刻 `StockLensMark` 光圈造型），Next.js 已注入 `<link rel="icon">`。六条路由控制台 **0 error / 0 warning**（此前首页有 favicon 404）。

### 4.6 P2-7 路由常量——已修复

新增 `src/lib/v5/routes.ts`（`RESEARCH_LIBRARY_HREF` / `HOME_HREF`），6 处硬编码全部改为引用常量。同类回归从结构上断根。

### 4.7 P2-6 配色常量——已修复

新增 `src/components/v5/palette.ts`（`PALETTE`），5 个组件的本地常量全部改为引用。**发现并修正一处规范漂移**：`ResearchSidekickPanel` 的 amber 曾是 `#A66F18`，而设计规范 `docs/design-audit/ui-reset/UI_RESET_STATUS.md` 规定 `#B4802A`，已按规范统一。Sidekick 面板底色 `#FBFCFE`（比画布亮一档）确认为有意区分，保留为独立令牌 `surfaceRaised`。

### 4.8 P2-5 语言切换——已决策并执行（第三轮，方案 B）

用户选定方案 B：**先关掉英文**。`ResearchHome.tsx`：
- 删除语言切换器 JSX 与 `stocklens.locale` 的读写；
- `locale` 固定为 `"zh"` 并留注释：`COPY.en` 与 `statusLabel` 的 locale 参数**有意保留**，作为未来补齐 i18n 的底稿；
- 清理由此产生的重复 `const copy` 与未用变量。

实测：六条路由页头均无语言开关渲染，`tsc` / `eslint` 干净。

### 4.9 回归检查（第二轮）

`tsc --noEmit` 0 错 · `eslint src` 0 错 0 警 · `vitest run` **417 passed / 32 files**。

`next build` 未完成：与常驻的 `next dev` 并发争用 `.next` 目录，17 分钟无进展后终止（构建卡死属操作失误，不是代码问题；期间三条路由始终 200，dev server 未受影响，构建残留锁已清理）。

---

## 五、跨路由过渡动效（第三轮，用户追加）

**问题**：首页 ⇄ 研究库有过渡动画，但 研究库 → 研究空间、研究空间 → 首页/研究库 都是瞬时硬切，动效语言不一致。

**方案**：新增 `src/components/v5/RouteWipe.tsx`——跨路由幕布过渡（`#F5F7FA` 240ms 覆盖 → `router.push` → 320ms 揭开），从点击坐标扩一圈蓝色光环，与产品动效语言同源。

- `RouteWipeProvider` 挂载于 `src/app/layout.tsx`，只在 `pathname` 真正变化时落幕（2s 卡死守卫）；
- `WipeLink` 渲染真实 `<a href>`：保留语义、prefetch 与既有测试选择器；只拦截**普通左键**，修饰键（Ctrl/Cmd/Shift/Alt）与新标签页行为原样放行；
- `useRouteWipe()` 在 Provider 外自动退化为普通 `router.push`；
- 替换点：研究库行链接、示例画布链接、画布页头 logo + 研究库、失败态出口、加载页出口、移动列表、`openStart` / `openSelected`；
- `prefers-reduced-motion` 用户直达导航，无动画。

**实测**（Playwright 真实指针，观察 `data-route-wipe` 相位 out → in）：

| 场景 | 结果 |
| --- | --- |
| 研究库 → 研究空间 | out → in，落点 `/lab/ai-workspace-v1?stockCode=000333.SZ` ✅ |
| 研究空间 → 研究库 | out → in ✅ |
| 研究库 → 首页 | out → in ✅ |
| 语言开关 | 已移除 ✅ |

### 第三轮回归检查

`tsc --noEmit` 0 错 · `eslint src` 0 错 0 警 · `vitest run` **417 passed / 32 files**（四条路由、六路由控制台均无 error）。

**遗留**：`next build` 仍未验证——需在 `next dev`（本轮期间常驻，PID 见会话记录）停止后单独执行，流程同 `docs/PROJECT_GUIDE.md`。

---

## 六、后续：产品级审视

同日用户要求对整个产品做一次全面思考（优化 / 可增加 / UI 修改），产出见 [2026-10-08-product-review.md](2026-10-08-product-review.md)。

---

## 七、Sidekick SOURCES 重复标签合并（第四轮，2026-10-08 凌晨）

**现象**（用户截图标注）：追问回答的 SOURCES 列表把「归母净利润累计同比 / 单季同比」「经营活动现金流净额累计同比 / 单季同比」平铺成两行，视觉上像重复条目。

**定性**：这些 title 由 `fact-builder.ts` 确定性生成，累计与单季是**真实存在的两条不同证据**——不可合并证据本身，只能合并展示层。

**修复**（`src/components/v5/ResearchSidekickPanel.tsx`）：新增 `groupSourceLinks`——按基础指标名（剥离「累计/单季同比」后缀）分组，一行一个指标；口径差异变成行内独立可点的胶囊芯片（累计 ↗ / 单季 ↗），每条证据仍各自直达自己的证据卡。组内期间一致时期号右置一次，不一致时并入芯片文案。VERIFIED LINKS 计数不变（仍按证据条数，5 条就是 5 条）。

**实测**（Playwright 真实链路：输入问题 → 真实 DeepSeek 追问 → SOURCES 渲染）：

| 项 | 结果 |
| --- | --- |
| 行数 | 5 行 → **3 行**（01 营业收入同比·单季 / 02 归母净利润同比·累计+单季 / 03 经营活动现金流净额同比·累计+单季） |
| 重复标题 | 0 |
| 芯片点击 | 打开对应证据卡（中间栏阅读态）+ Sidekick 顶部出现证据上下文标签 |
| pageerror | 0 |

`tsc --noEmit` 0 错 · `eslint` 0 警 · `vitest run` **417 passed / 32 files**。

**决策记录**：同轮用户确认——产品级审视（`2026-10-08-product-review.md`）中的 P0/P1/P2 项**暂不做**；仅修此展示缺陷。
