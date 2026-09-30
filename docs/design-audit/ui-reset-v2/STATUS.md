# STATUS — Task 15.2R Company World V2

## route

`/observatory-v4`（独立路由；生产 `/observatory` 未改动）

## commit

见本文件同 commit（feat: company world v2 — reference reproduction）

## viewport

1440 × 900（截图 `01-company-world.png` / `02-dimension-hover.png` 均为该尺寸）

## files

- 新增：`src/app/observatory-v4/page.tsx`、`src/components/v4/CompanyWorldV2.tsx`、`src/lib/v4/media.ts`
- 新增（文档）：本目录 4 文件
- 变更：`.gitignore`（新增 `.tmp/`，用于存放第三方参考截图，不入公开仓）
- 未改动：`/observatory`、`/observatory-v3`（保留为实验分支）、`/observatory/lab/editorial-v1`、`/lab/art-direction`
- 复用：camera 数学（`src/lib/spatial/camera.ts`）、fixture API（`/api/observatory/fixture`）、
  `ResearchSpacePayload` 类型、`stableHashUnit`

## implemented interaction（本阶段仅此）

- **Pan**：拖拽移动整个世界（媒体场 + 媒体对象 + typography 同层）
- **Zoom**：滚轮（沿用 camera 数学，FigJam 物理）
- **Dimension hover**：typography 层级提升 + 证据 marks reveal（`01 名称 数值 ──●`）+ 其余对象降至 0.26 + 世界光斑跟随
- 默认远景仅显示 Dimension label 与计数提示；摘要与证据细节仅 hover 出现
- UNKNOWN：模糊/遮蔽的视觉区 + `EVIDENCE INCOMPLETE` 文字，非白卡

## known gaps

1. 主导视觉体为大气光场（受 §8 禁用具象形状约束），结构辨识度低于参考照片级对象
2. 未实现惯性 / 无阻尼参数调优；pan 为线性跟随
3. My World、Peek、Reading、Command Lens 视觉未在本阶段实现（§46–§48 禁止）
4. 媒体片亮度低于参考（§50 禁暖色 + §10 素材不表达金融判断）
5. `/observatory-v3` 保留为实验分支，未删除；如确认废弃可在后续任务移除

## verification

`npx tsc --noEmit` PASS · `npx eslint src/components/v4 src/lib/v4 src/app/observatory-v4` 0 error · `npx next build` PASS
