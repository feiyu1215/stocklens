# TASK 15.1 STATUS — Design Fidelity Correction

## Commit

- Baseline: `a3b8918`（00-before-*.png 摄于此提交）
- Implementation: 见 git log（本轮 feat commit）

## Production URL

https://stocklens-blush.vercel.app/observatory?stockCode=000333.SZ

## Local URL

http://localhost:3000/observatory?stockCode=000333.SZ

## Viewport / Renderer

- 1440 × 900（IAB，Desktop First §74）
- Renderer: terrain（本轮对象；pearl/dusk/cosmos 契约兼容，视觉未动）

## What changed

1. **Terrain = Information Architecture（§5–§20）**：Company = 整片 Territory（外包络轮廓 + 内圈等高线），
   公司名为地图标题（RESEARCH TERRITORY + 名称/代码/行业），删除大圆球 Core（Cosms 保持星球构图，两 renderer 构图真正不同 §7）；
   Dimension = Region（面积随 evidence 丰富度、边界/内部结构/采样点）；Evidence = Region 内 sampling landmark
   （FACT 实心点 / INFERENCE 连线结构 / UNKNOWN 虚线圈 / CONFLICT 交叉断裂），hover 时本区增强、其余退后（§11–§13）；
   coverage 驱动地形：READY 闭合+3 圈 / PARTIAL 半开虚线 / UNKNOWN fog+未闭合轮廓 / CONFLICT 小断裂线（§14–§18，§19 禁止好坏映射）。
   新增纯函数层 `src/lib/world/terrain-coverage.ts`（coverage 映射/territory/morph 几何/时序，测试锁定）与
   `terrain-geometry.ts` 增量（openContourPath/fracturePath/territoryContourPath）。
2. **Region 交互（§29–§31/§75–§76）**：单击 Region = 选中/展开概览（region 放大 1.8×，内容成为 region 内部纸面，
   Terrain context 可见），显式 "Explore region →" 才进入阅读；renderer capability `inlineRegionPeek` 声明该行为
   （workspace 零 renderer id 分支）；DOM button/标题仍是键盘代理。
3. **Semantic Morph（§28–§43）**：新增 `MorphSurface`（app 层 rAF 时钟）+ terrain `renderMorphOverlay`
   （视觉映射在 renderer）。Frame1 region 放大 → Frame2 地形后退/边界随形 → Frame3 label 从 region 标签位飞至标题位
   （§34 连续）→ Frame4 claims stagger reveal。只用 scale/translate/border-radius（§38），无图形库。
   反向：面包屑 = 主入口（§42），Reading 收缩回 Region、周围回归（Zoom Out 非 Back Page）；
   "← Back to space" 降级为弱链接 `← terrain`（§41），Escape 键盘等价保留。
   顺带修复真实缺陷：面包屑此前在 DIMENSION_FOCUS 被隐藏。
4. **Claim → Evidence 连续（§44–§49）**：锚点点击 → rail 权重上升（inset accent + 320ms 滑入）；
   active claim 收缩为 context spine（line-clamp，不消失 §46）；极轻虚线 anchor→rail tether（事件期测量，非装饰 §48）；
   Return to claim 反向 transition。
5. **Suggestion = Unexplored Region（§20–§26）**：矩形卡 → Territory 边缘雾区（UNEXPLORED + Explore +），
   hover contour reveal 显示 rationale + Explore + / Dismiss；添加中 = RESOLVING region seed（无 Spinner Card §24）；
   解析后 region 落地、源建议撤下（避免重复身份）。
6. **降级与 Debug（§54–§59）**：局部降级维持（本轮在茅台 fixture 上复验：6 region 各自小字、页面级仅一行弱文案、零 banner）；
   Debug 面板增加 morphPhase / morphProgress / sourceObject / targetObject / captureSlow（§58）；
   最终截图不含 Debug Panel（§59）。

## What was intentionally not changed

- **后端 0 改动**（Data/Metric/Evidence/Framer/Composer/Claims/Registry/Manifest/Compliance/Follow-up/API 语义全部未动）
- Task 13 交互物理（pan/zoom/marquee/park/drag 仲裁）、Task 14 My World、布局数学（radial + 碰撞消解）
- pearl/dusk/cosmos 的视觉与行为（仅新增可选契约字段，未声明即走原行为）
- 无 Three.js、无粒子/星空/霓虹（§67–§68）；未制造任何不存在的证据（§69）；未暗示股票好坏（§70）

## 采样辅助披露

morph 逐帧以 `?captureSlow=1`（morph/reverse 时长 ×5）捕获——真实交互、真实渲染、仅放慢；
测试 `motionScaleForQuery` 锁定该参数只影响时长。最终截图均不含 Debug Panel。

## Visual acceptance checklist（§74，人工核验）

- [x] Terrain 看起来是一整片 Territory（01）
- [x] Regions 不像六个 Blob Cards（03：展开内容在 region 内部）
- [x] Suggestions 不像 Recommendation Cards（15–17）
- [x] Company 不像 Cosmos 中央星球（01 vs Cosmos 构图）
- [x] Evidence 属于 Region（02：hover 时采样点归属可见）
- [x] UNKNOWN 真像未探索区域（12–13：fog + 未闭合轮廓）

## Known gaps

- morph 逐帧中 Frame2 可见浮层 label 与内容标题的交叉淡接重叠（约 130ms），属 §34 连续性的代价而非缺陷；
  若需完全无重叠需 shared-element 测量，本轮按 §38 选择轻量路径
- inline 展开的 region 放大（1.8×）在对象极密时可能与相邻 region 视觉贴近（当前 5–7 region 布局下未发生）
- region 内联展开时拖拽手柄收起（内容优先）；拖拽仍可通过其它 region 进行
- GIF 未录制（Spec 标注非强制）；逐帧 PNG 已全覆盖

## 工程 Gate（非设计 Gate）

`npx vitest run` → 27 files / 372 tests PASS（新增 tests/terrain-fidelity.test.ts 16 cases）
`npx tsc --noEmit` PASS · `npx eslint src tests` 0 error · `npx next build` PASS

## Artifact index

| 文件 | scenario | expected | actual |
|---|---|---|---|
| 00-before-terrain.png | baseline | 改造前构图留档 | Core 球 + 六 blob + 散点 + 矩形建议卡 |
| 00-before-reading.png | baseline | 改造前阅读面留档 | 页面切换式进入 |
| 01-after-terrain-overview.png | A | 一整片 Territory + 地图标题 | 一致；无 Core 球 |
| 02-region-hover.png | B | 本区清晰、其余退后、采样点归属 | 一致 |
| 03-region-selected.png | C | region 扩大 + 内部概览 + 仍在 World | 一致 |
| 04–07-morph-frame-0N.png / 07-reading-surface.png | D | 边界 + label 双连续四帧 | 一致（captureSlow） |
| 08/09-claim-evidence-frame-0N.png / 10-evidence-detail.png | E | claim 镜像 dimmed / 锚点权重上升 / tether / context spine | 一致 |
| 11–14-unknown-*.png | F | RESOLVING seed → fog 落地 → region → 研究边界 | 一致（真实 UNKNOWN 响应） |
| 15–17-suggestion-*.png | G | UNEXPLORED → RESOLVING → resolved region | 一致（真实 partial 响应） |
| 18-degraded-localized.png | H | 局部降级、零页面级 banner | 一致（真实 partial_failure 载荷） |
| interaction-record.json | 全部 | scenario/action/frames/result | 10 scenarios 全 pass |
