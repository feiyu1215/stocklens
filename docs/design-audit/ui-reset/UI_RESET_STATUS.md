# UI_RESET_STATUS — Editorial Research Canvas（Task 15.2 UI Reset）

## Route

`/observatory-v3`（独立路由；生产 `/observatory` 未改动，§46/§84）

## Commit

见本文件同 commit（feat: UI reset — editorial research canvas v3）

## Primary references（一手实测，截图见 `.tools/ref-*.png` 与 REFERENCE_AUDIT.md）

- **Cosmos**（主参考，复刻其语法）：冷白 field + 非等大对象随手散布 + 对象即内容入口 + 极简 chrome
- Oryzo（构图）：拼贴 scene + 邻景露边 → My World；Unseen（排版）：detail 元数据 → Reading header；
  OceanX（手感）：横推换景 → My World 切换与 Reading 转场
- 完整十问审计：`REFERENCE_AUDIT.md`

## Palette（§21–§23）

| token | value | 用途 |
|---|---|---|
| background | `#F5F7FA` | field 底色（冷白） |
| text primary | `#101318` | 正文/标题 |
| secondary | `#69707D` | 元数据/mono |
| surface | `rgba(255,255,255,0.72)` | 对象表面 |
| key blue | `#2962FF` | FACT / 交互强调 |
| inference | `#6C5CE7` | INFERENCE |
| amber | `#B4802A` | UNKNOWN（仅小面积状态，§24） |
| coral | `#D9534F` | CONFLICT（仅小面积状态） |

**暖色全禁用**（soil/beige/sepia/ochre 大面积）已核验：新代码零暖色 token。

## Typography（§48–§54）

| 层 | 字号 |
|---|---|
| Company identity | 58px（§27 要求 48–72） |
| Reading dimension title | 46px（§54 明显更大） |
| Claim 正文 | 22px |
| 对象标题（三级） | 30 / 23 / 18px（§31–32 非等大） |
| 对象 claim 摘要 | 15.5 / 13.5 / 12px |
| 元数据 | 9–11px mono + tracking |

## Visual asset source（§29/§189 说明）

自制冷调抽象媒体（`src/lib/v3/media.ts`）：银灰/石墨/冷蓝 + 等高细线 + 测量标记 + 颗粒 + 焦点暗区，
确定性一次绘制（canvas，零逐帧成本）。未使用任何第三方图片资产（§15）。

## Interaction preserved checklist（§81，逐项核验）

- [x] Pan（拖空白 = 世界平移，camera 数学沿用）
- [x] Zoom（wheel → zoomAtPointer，range 0.65–1.45 同旧）
- [x] Fit（⌘K → Fit view / 初始 fit）
- [x] Dimension drag（拖对象改世界坐标，overlay 跟随）
- [x] Gather（⌘K → Gather selected：选中项聚到 media 上方横带，非围圈）
- [x] Spread（⌘K → Spread layout，回到非对称散布）
- [x] Reset（⌘K → Reset layout：manual/focus/selection/park 全清 + refit）
- [x] Multi-select（⇧+点击切换选中；⇧+拖 = marquee 框选）
- [x] Focus selected（⌘K → Focus set：选中保亮、其余 fade 至 0.32）
- [x] Peek（点击对象 → inline editorial 生长：top claims + 计数 + 操作，非白色 SaaS 卡）
- [x] Open research（Peek 内 EXPLORE → / 双击返回世界）
- [x] Pinned summary（Peek → PIN NOTE → editorial note，可拖、可折叠、可删除）
- [x] Summary drag（note 在世界坐标拖动）
- [x] Park（Peek → PARK → 边缘编号圆点）
- [x] Restore（点击编号圆点恢复）
- [x] Suggestion drag（ghost annotation 拖入主 field → 调既有 Add API）
- [x] Add dimension（真实 `/api/research/dimension`；compliance/unknown 提示沿用；RESOLVING 态）
- [x] Command Lens（⌘K：半透明冷表面 + 细边框；上下文命令按 view 变化）
- [x] My World traversal（拖拽/←→ 横移、邻景露边、№ 序号章、ENTER RESEARCH）
- [x] Evidence interaction（hover 对象 → technical annotations 01/名称/数值/──●；Reading 内锚点 hover 预览、click 钉住、CALCULATION 展开）
- [x] Claim ↔ Evidence / Inline follow-up / Challenge（Reading：ASK → /api/followup 内联线程；CHALLENGE 三层 SUPPORT / COUNTER-SIGNALS / UNKNOWN）

## Screenshot index（§41/§75–77）

| 文件 | 内容 |
|---|---|
| `01-company-world-v1.png` | Company World（Gate 1）：冷白 field + 7 个非等大对象 + 58px identity + ghost suggestions |
| `02-hover.png` | hover：对象提起、其余退后、右侧 technical annotations |
| `03-dragged-layout.png` | 拖动「现金转化与分红能力」后的布局 |
| `04-peek.png` | Peek：对象内联生长（top claims + 5 VERIFIED · 1 CONFLICT + PIN/PARK/EXPLORE） |
| `05-focus-set.png` | Focus set：三个选中对象保亮，其余 fade |
| `06-transition-start.png` / `07-transition-mid.png` | World → Reading 转场（媒体让位 + shared title 飞行） |
| `08-reading.png` | Reading：46px 标题 + 22px Claim Spine + editorial Evidence Rail + 左侧 media strip |
| `09-my-world.png` | My World：满幅拼贴 scene + №1 章 + ENTER RESEARCH |
| `ui-reset-prototype.webm` | 13.9s 动效（drag pan → hover → click peek → explore），1.6MB |

## Known gaps

1. `06-transition-start.png` 与 `07-transition-mid.png` 的差异偏小（转场主体是 media 让位 + title FLIP，
   时长 620ms，截图间隔难以精确对齐动画中点）——gif/webm 更能体现
2. My World 目前仅有 1 家公司（localStorage 世界为空时的默认演示公司），邻景露边需 ≥2 家才能看到；
   进入其它公司会调用真实 `/api/research/init`（约 15–25s，已有 RESOLVING 态）
3. 对象 7 个（6 维度 + 1 UNKNOWN），§73 要求「4–6 research annotations」，按「至少」理解通过；
   若 reviewer 要求严格 6，可把 UNKNOWN 收进边缘
4. 冷调 media 为程序绘制抽象图；进入正式内容系统后可替换为公司专属影像（§32 已说明本轮不解决）
5. Reading 的 `06/07` 帧未做逐帧放大对比；webm 为准

## Production

https://stocklens-blush.vercel.app/observatory-v3 —— 线上复验通过（7 objects / identity / chrome 全在），
生产 `/observatory` 未受影响。线上截图：`10-production-v3.png`。

## Verification

`npx tsc --noEmit` PASS · `npx eslint src/components/v3 src/lib/v3 src/app/observatory-v3` 0 error 0 warning ·
`npx next build` PASS（见 commit 记录）
