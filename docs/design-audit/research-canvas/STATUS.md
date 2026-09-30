# STATUS — Research Canvas (Task 15.3, First Gate)

## route

`/observatory-v5`（独立路由；生产 `/observatory` 未改动；v3/v4 保留为归档实验）

## commit

见本文件同 commit（feat: research canvas — first gate）

## viewport

1440 × 900（全部 artifact 均为该尺寸）

## features implemented

- Company Canvas：铺满视口的浅色画布（#F5F7FA）、极淡方格底纹、可 pan（空白拖动）
- Research Anchors：7 个纯文字锚点（无矩形背景、非等大、非对称 editorial 分布）；
  每个含 序号（01–07）/ 标题（primary 34、secondary 24、tertiary 17）/ 证据计数 + 条形图标 /
  3 行子条目（取自该维度真实 metric 名称）
- Zoom：滚轮缩放 + 右下 − / 百分比 / + / ⛶（fit）
- Dimension drag：拖动锚点移动其位置；拖动时 camera 不移动
- Dimension hover：标题 scale 1.1、其余锚点 opacity 0.25、该维度 Evidence Trace 显现、
  摘要与动作行出现（Explore 主按钮 + Pin / Ask / Park）
- Evidence Trace：由该维度真实 evidence 生成的曲线 + 节点；默认极淡、hover 显现
- Contextual actions：贴在锚点旁（非中央菜单）
- 其他已实现（超出 §34 列表但为 §10/§24–§28 所需）：UNKNOWN 局部柔化锚点、conflict 小 coral 标记、
  Pin 笔记（最多 3、可拖）、Park/Park 恢复、Command Lens（⌘K：Fit view / Pin note / Park / Restore）、
  AI Suggested Dimension ghost（+ label / suggested research）、局部 AI 失败提示
- Company identity：68px 中文名 + MIDEA GROUP + ticker · 行业（左上，无容器）
- Chrome：STOCKLENS（左上）/ 搜索图标 + ticker + 更换公司 →（右上）/ 行业 · N RESEARCH DIMENSIONS（左下）/
  ⌘K pill（下中）/ zoom 控件（右下）

## features intentionally not implemented

- Peek（§12）、Reading V5（§13–§17）、My World V5（§29–§30）——按 §37 停止点未实现
- 双击空白 Add Dimension（§23）、Suggestion 拖入 Add（§22 drop 行为）、
  Multi-select / Focus selected / Gather / Spread（§18–§21）——不在 §34 First Gate 列表内
- 顶部「更换公司 →」与搜索图标为静态呈现（company traversal §29 未实现）
- Explore / Ask 两个动作按钮已渲染但未接线（其目标 Peek / Reading 属于未实现的下一 Gate）

## known bugs

1. `04-contextual-actions.png` 为裁切特写，画面右侧可见相邻锚点的部分文字（锚点间距在 1440×900 下偏紧）
2. 环境区域标签（CHINA MARKET / GLOBAL EXPANSION / CASH FLOW / VALUATION）为固定文案，非从公司数据推导
3. 公司 identity 下方无描述段落（参考图有；现有 fixture/API 未提供公司描述字段）
4. 初始 fit 后 zoom 显示 73%（参考图视觉为 100%），锚点屏幕字号相应约为参考的 0.73 倍
5. Trace 曲线为确定性生成，个别曲线在画布边缘外（不影响可视区）

## artifact list

```
docs/design-audit/research-canvas/
├── 01-company-canvas.png       Company Canvas 默认态（1440×900）
├── 02-dimension-hover.png      hover 盈利质量与结构：标题放大/其余 0.25/trace/摘要/动作行/右侧证据簇
├── 03-dimension-dragged.png    拖动「现金转化与分红能力」后（anchor 移动，camera 未动）
├── 04-contextual-actions.png   动作行特写（Explore · Pin · Ask · Park + 证据簇）
└── STATUS.md
```
