# STATUS — Focus Aperture（Task 15.3B）

## route

`/observatory-v5`（独立路由；生产 `/observatory` 未改动）

## commit

见本文件同 commit（feat: focus aperture — progressive disclosure + spatial collision）

## viewport

1440 × 900（另测 1280×800）

## 变更摘要

- 移除默认 soft focal 展开：默认每个 Dimension 只显示 index + label + evidence 计数（+ conflict 微标），无摘要、无动作行、无证据明细
- hover 轻量化：标题 ×1.08、其余 0.36、仅本维度 trace 显现、一句摘要 + ≤2 条微证据；hover 不改变任何对象位置
- click → **Focus Aperture**：专属空间排除区（bbox + 40px 安全边），只把冲突对象沿最短轴推开（局部磁性位移，400ms），未冲突对象保持原位
- Aperture：460×292（1280 宽下 400×291）；半透明白面 rgba(255,255,255,.62)、极细边框、无大阴影；内容 = 序号/tier、标题、一句摘要、≤3 条证据数值、`Explore research →`、`•••` 菜单（Pin summary / Ask about this / Park）
- 关闭语义：空白点击 / Escape / 多选开始 / 拖动所选对象 / 布局命令（Focus·Gather·Spread）→ 关闭并恢复被位移对象；用户手动位置未被覆盖
- 长 leader 移除：证据不再有跨画布连线；非活动维度 trace opacity ≤ .05

## 碰撞客观数据（§43–§45/§49，程序化 bbox 检测）

| fixture | 维度数 | viewport | aperture 尺寸 | 打开时冲突数 | 位移对象数 | 位移后冲突 | 与 Dimension 交叠 | 与控件交叠 | 与 Identity 交叠 |
|---|---|---|---|---|---|---|---|---|---|
| midea-overview | 6 | 1440×900 | 460×292 | 抽样 3 个锚点 | — | **0** | **0** | **0** | **0** |
| midea-artdirection | 7 | 1440×900 | 446×295 | 1–2 | 1–2 | **0** | **0** | **0** | **0** |
| midea-eight | 8 | 1440×900 | 460×292–304 | 2–3（4 个抽样点） | 2–3 | **0** | **0** | **0** | **0** |
| midea-eight | 8 | 1280×800 | 400×291 | 抽样 3 个锚点 | — | **0** | **0** | **0** | **0** |

> 交叠判定为 DOM `getBoundingClientRect` 严格相交（无容差）；「位移后冲突」读自 Aperture 的 `data-collisions-after`。
> 首轮测量曾出现 1 次「假交叠」：测量早于 400ms 位移动画落位；等待动画后复测为 0。

## 交互检查（保留项，本轮回归）

| 项 | 结果 |
|---|---|
| Pan / Zoom / 100% 复位 | PASS |
| Dimension drag（拖动时 Aperture 关闭，drop 后不自动重开） | PASS |
| Shift 多选 / Marquee（多选优先，先关 Aperture） | PASS |
| Focus selected / Gather（非对称）/ Spread | PASS（命令前关闭 Aperture） |
| Pin / Ask / Park / Restore | PASS（Pin·Ask·Park 现位于 ••• 菜单） |
| Suggested research 点击 → rationale + Add（真实 API）；拖入添加 | PASS（沿 15.3A 行为，未纳入碰撞系统） |
| Command Lens（⌘K，上下文相关） | PASS |
| Aperture → Explore research → Reading split（36% / 64%，画布仍可 hover，面包屑退出） | PASS |
| Aperture 内点证据 → 画布同证据节点高亮 | PASS |

## artifacts（1440×900，internal scale 1.00）

```
01-calm-default.png            默认态：无展开、无动作行、无证据面板
02-light-hover.png             hover：一句摘要 + 2 条微证据，邻居未移动
03-focus-aperture.png          click：Aperture 打开，被压邻居已让位（before 1 → after 0）
04-aperture-second-position.png 另一处的 Aperture（通用性；before 2 → after 0）
05-context-menu.png            ••• 菜单（Pin summary / Ask about this / Park）
06-reading-split.png           Explore research → Reading split
focus-aperture.webm            14.9s（default → hover → click → 让位 → 换维度 → 空白关闭 → 再开 → Explore）
```

## known gaps

1. 无证据指标的维度（如「事件与关注度扰动」）Aperture 内只有摘要与 Explore，无 3 行数值（数据本身无 metric）
2. Aperture 跟随所选对象在世界坐标中；打开后若用户大幅 pan，Aperture 可能部分移出视口（未做视口吸附）
3. 位移使用单轮最短轴推出 + 固定区/已落位对象避让（最多 6 轮）；极端密集布局下仍可能出现二次位移连锁
4. `midea-eight` 为碰撞测试合成 fixture（第 8 维度复用真实证据 ID，已标注 rationale）
5. Reading Sheet 内仍为既有 ReadingV3（含其自身的 Claim Spine / Evidence Rail 视觉），未按 15.3B 调整
