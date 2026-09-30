# Task 15.2｜FULL UI RESET
## Reference-led StockLens Redesign

---

# 0. 先理解：当前 UI 视觉方案正式废弃

当前 `/observatory` 的视觉方向判定：

```text
REJECTED
```

不要继续基于它重构。

以下设计语言全部停止继承：

```text
土黄色 / 米黄色 / 暖褐色主色
#EFEEE9 一类大面积 beige canvas
Terrain / mountain / island
等高线
中央 Company 圆
Dimension 围绕中央排列
Radial constellation
几个 blob 围成一圈
小蓝点散落
虚线岛屿
中心 + 卫星
```

不要：

> “保留结构，换个颜色。”

不要：

> “现有 Terrain 上继续精修。”

不要：

> “增加材质、阴影、渐变让旧页面高级一点。”

---

# 1. 本轮是重新设计 UI

新建：

```text
/observatory/redesign
```

或：

```text
/observatory-v3
```

现有 `/observatory` 暂时保留。

新 UI：

**从空白 Canvas 开始重新设计。**

但是：

---

# 2. 视觉重做 ≠ 交互重做

以下已经存在的优秀交互能力必须保留：

```text
Pan whole workspace
Zoom
Fit view
Dimension drag
Gather
Spread
Reset layout

Shift multi-select
Focus selected
Show all
Marquee selection

Dimension hover
Click → Peek
Explore/Open → deep research

Pinned summary
Summary drag
Collapse summaries

Park dimension
Restore dimension

AI suggestion
Suggestion drag-in
Add dimension

Command Lens

My World company traversal

Company → Dimension → Claim → Evidence
semantic hierarchy

Claim ↔ Evidence
Inline follow-up
Challenge
```

任何视觉重构导致上述能力消失：

```text
FAIL
```

---

# 3. 不允许从旧 UI copy JSX/CSS 后慢慢改

旧组件中的：

```text
ResearchWorkspace state
interaction handlers
camera
data
API wiring
```

可以复用。

但是旧：

```text
visual markup
layout composition
colors
surface style
terrain renderer
radial visual hierarchy
```

不要作为新页面起点。

---

# 4. 新页面开发顺序

必须：

```text
Reference Audit
↓
Composition
↓
Typography
↓
Media / Visual layer
↓
Object placement
↓
Interaction integration
↓
Reading transition
↓
Micro polish
```

禁止：

```text
先把旧组件复制过来
↓
再换色
↓
再调 border-radius
```

---

# 5. 必须实际打开下面这些网站

不要只阅读本 Prompt 对它们的描述。

在开始 UI 代码之前：

**逐个在浏览器打开。**

---

# 6. PRIMARY VISUAL REFERENCE 01 — Unseen World

Unseen World：

[https://unseen.co/world/](https://unseen.co/world/?utm_source=chatgpt.com)

Unseen Projects：

[https://unseen.co/projects/](https://unseen.co/projects/?utm_source=chatgpt.com)

必须观察：

```text
整个 viewport 是体验
Drag = navigation
强烈 visual subject
极少 chrome
对象不是整齐 card grid
大量负空间
文字与 visual 共存
内容层与沉浸层可以切换
```

StockLens 必须借：

```text
workspace 本身就是 navigation
拖动研究空间是第一等操作
Dimension 散布在 visual field 中
不是中心圆环
```

禁止复制：

```text
Unseen 品牌资产
具体 3D object
logo
字体品牌风格
```

---

# 7. PRIMARY VISUAL REFERENCE 02 — OceanX 2025

[https://2025.oceanx.org/](https://2025.oceanx.org/?utm_source=chatgpt.com)

必须观察：

```text
高清摄影 / 视频主导画面
media-first
big typography
文字直接叠在视觉层
不同状态通过 camera / visual transition 切换
不是组件墙
```

StockLens 借：

```text
高质量 Visual 主体
研究标签叠在视觉环境里
Company / Dimension 状态转换不是页面刷新
```

重要：

> 不要看到 OceanX 就去建 3D。

学习的是：

```text
composition
media
scale
transition
```

---

# 8. PRIMARY VISUAL REFERENCE 03 — Lusion

Projects：

[https://lusion.co/projects/](https://lusion.co/projects/?utm_source=chatgpt.com)

Devin AI：

[https://lusion.co/projects/devin_ai/](https://lusion.co/projects/devin_ai/?utm_source=chatgpt.com)

必须观察：

```text
大胆 composition
主体特别大
文字层级差非常明显
少量 UI chrome
visual confidence
不怕留白
复杂产品仍然可以很有设计感
```

StockLens 当前一个重大问题：

```text
所有东西都太小
太平均
太谨慎
太像工程 Demo
```

新设计必须解决。

---

# 9. PRIMARY VISUAL REFERENCE 04 — Oryzo

Oryzo：

[https://oryzo.ai/](https://oryzo.ai/?utm_source=chatgpt.com)

Creative Direction BTS：

[https://blog.lusion.co/oryzo-bts-part-1-7-concept-and-creative-direction](https://blog.lusion.co/oryzo-bts-part-1-7-concept-and-creative-direction?utm_source=chatgpt.com)

重点观察：

```text
每屏都有明确 art direction
图片 / visual / typography 的关系
不是标准 SaaS Grid
强 hierarchy
大胆裁切
```

不要：

> 做它的 3D 物体。

要：

> 学它如何构图。

---

# 10. PRIMARY VISUAL REFERENCE 05 — Cosmos

[https://www.cosmos.so/](https://www.cosmos.so/?utm_source=chatgpt.com)

重点观察：

```text
media-first discovery
内容尺寸不统一
非传统 grid
视觉对象自然分布
空间探索感
```

StockLens 借：

> Research Objects 不需要全部尺寸一样。

---

# 11. INTERACTION REFERENCE 01 — Bruno Simon

[https://bruno-simon.com/](https://bruno-simon.com/?utm_source=chatgpt.com)

不要学：

```text
车
游戏
3D 风格
```

必须学：

> 整个体验被一套统一动作语言统治。

Bruno：

```text
Drive
Camera
Interact
Map
```

StockLens：

```text
Explore
Focus
Inspect
```

---

# 12. INTERACTION REFERENCE 02 — Krea

[https://www.krea.ai/blog/realtime-edit](https://www.krea.ai/blog/realtime-edit?utm_source=chatgpt.com)

必须学习：

```text
Direct Manipulation
```

用户动作：

```text
drag
focus
move
add
```

应直接改变工作区。

不要：

```text
drag
→ submit
→ confirm
→ generate
```

---

# 13. INTERACTION REFERENCE 03 — FigJam

[https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam?utm_source=chatgpt.com)

这是 Canvas Physics 参考。

已有行为必须保留：

```text
Pan
Zoom
Fit
Recenter
Trackpad
Keyboard
```

不要因为新 UI 丢失。

---

# 14. INTERACTION REFERENCE 04 — Milanote

[https://milanote.com/product/note-taking](https://milanote.com/product/note-taking?utm_source=chatgpt.com)

学习：

> Spatial arrangement itself carries meaning.

StockLens 对应：

```text
Dimension 拖动
Focus Set
Pinned research notes
用户自己组织研究空间
```

但：

不要变成自由白板。

---

# 15. INTERACTION REFERENCE 05 — Linear

[https://linear.app/changelog/2019-10-07-contextual-command-menu](https://linear.app/changelog/2019-10-07-contextual-command-menu?utm_source=chatgpt.com)

必须学习：

```text
Contextual Actions
```

选：

Dimension：

只显示 Dimension actions。

Claim：

只显示 Claim actions。

Evidence：

只显示 Evidence actions。

---

# 16. INTERACTION REFERENCE 06 — Arc

[https://start.arc.net/command-bar-actions](https://start.arc.net/command-bar-actions?utm_source=chatgpt.com)

学习：

> Command Bar 是整个 workspace 的 controller。

StockLens：

```text
Command Lens
```

不要变成大聊天输入框。

---

# 17. MOTION REFERENCE — Rive

[https://github.com/rive-app/help-center/blob/master/editor/state-machine.md](https://github.com/rive-app/help-center/blob/master/editor/state-machine.md?utm_source=chatgpt.com)

不要引入 Rive runtime。

学习：

```text
state
+
input
→ transition
```

所有 motion 必须有真实状态原因。

---

# 18. INFORMATION ARCHITECTURE REFERENCE — Insilico

[https://insilico.com/](https://insilico.com/?utm_source=chatgpt.com)

Insilico：

**不作为主要视觉参考。**

只学习：

```text
复杂能力
如何组织成一个统一产品世界
```

---

# 19. 在写 UI 代码之前必须提交 Reference Audit

创建：

```text
docs/design-audit/ui-reset/
REFERENCE_AUDIT.md
```

逐个 PRIMARY Reference 回答：

```text
1. Above the fold 第一视觉主体是什么？
2. 一屏中真正的大视觉对象有几个？
3. Media : Text 面积比例大概是多少？
4. 有没有传统 Card Grid？
5. 页面最重的 Typography 多大？
6. 用户 Hover 会发生什么？
7. Drag 会发生什么？
8. Click 会发生什么？
9. 状态变化如何通过视觉表现？
10. StockLens 具体借什么？
```

未完成 Reference Audit：

**禁止开始正式 UI。**

---

# 20. 新 StockLens Visual Direction

名称：

# Editorial Research Canvas

不是：

```text
Terrain
Cosmos
Dashboard
Mind Map
```

它应该像：

```text
premium creative website
×
research workspace
×
financial evidence tool
```

---

# 21. 全新色彩系统

明确禁止继续使用：

```text
soil yellow
beige
sepia
warm brown
dirty ivory
ochre large background
```

---

# 22. 默认 Base

采用：

```text
cool white / silver / graphite
```

建议基线：

```text
background:
#F5F7FA
or
#F2F4F7

primary text:
#101318

secondary:
#69707D

surface:
rgba(255,255,255,0.72)

key blue:
#2962FF / 相近高纯度冷蓝
```

---

# 23. Evidence semantic color

FACT：

冷蓝。

INFERENCE：

冷紫。

UNKNOWN：

Amber 只作为小面积状态。

CONFLICT：

Coral 只作为小面积状态。

---

# 24. UNKNOWN 不允许把整个页面染黄

Amber：

只用于：

```text
annotation
small mark
status
```

---

# 25. 主画面不允许中心构图

禁止：

```text
        Dimension
           ↓
Dimension → Company ← Dimension
           ↑
        Dimension
```

彻底删除这种构图。

---

# 26. Company World 必须 asymmetric

视觉上：

更接近：

```text
Unseen
Lusion
OceanX
```

而不是：

```text
mind map
radar chart
solar system
```

---

# 27. 推荐构图

1440×900：

## 左上 / 左侧

大 Company Identity。

例如：

```text
MIDEA GROUP

美的集团
000333.SZ

白色家电
```

Company Name：

可以：

```text
48–72px
```

不要 18px。

---

# 28. 主 Visual

屏幕：

```text
50–65%
```

应该存在一个大的：

```text
visual field
```

可以是：

```text
high-resolution image
abstract media
moving crop
editorial image
soft video
graphic visual
```

不要：

程序生成山。

---

# 29. Prototype 阶段允许固定一张高质量视觉素材

不需要先解决：

```text
每一家 A 股配什么图
```

本轮先证明：

> UI 设计成立。

---

# 30. Dimension

Dimension 主要作为：

```text
large editorial annotations
```

而不是 Card。

例如：

```text
盈利质量
6 evidence
```

文字可以直接浮在 Visual / 空白区域。

---

# 31. Dimension 尺寸不统一

Priority / Focus：

可影响：

```text
font size
distance
weight
```

但不表达股票好坏。

---

# 32. 示例层级

高优先：

```text
盈利质量
28px
```

普通：

```text
现金转化
18px
```

次级：

```text
股东回报
14px
```

实际可调整。

重点：

> 不要全部六张一模一样。

---

# 33. Dimension 依然可以 Drag

必须保留。

拖拽后：

annotation 跟随移动。

相关 Evidence visual：

跟着更新连接。

---

# 34. Gather

Gather：

不是重新围一圈。

应该：

把当前 selected dimensions：

组织到主 visual 周围 / 上方。

---

# 35. Spread

Spread：

使用 asymmetric editorial layout。

禁止回到 radial circle。

---

# 36. Fit

继续是 Camera。

---

# 37. Focus selected

Focus 三个 Dimension：

其他：

```text
fade
```

Visual：

相应重新 composition。

---

# 38. Evidence 不再是小蓝散点

采用：

# Technical Annotation Language

例如：

```text
01
Revenue YoY
+3.55%

────────── ●
```

或者：

```text
● 01
```

与 Dimension / media 通过：

```text
thin leader
```

连接。

---

# 39. Hover Dimension

不要：

```text
card glow
border
```

应该：

```text
Dimension title emphasis
related media crop / mask shifts
Evidence annotations reveal
other dimensions recede
```

---

# 40. Click Dimension

仍然：

```text
Click → Peek
```

不能直接打开 Reading。

---

# 41. Peek

不要弹白色 SaaS Card。

可以：

在 Dimension 附近：

```text
inline editorial text
thin rule
summary
top claim
Explore →
```

直接生长出来。

---

# 42. Peek 示例

```text
盈利质量
────────────

收入仍保持增长，
但毛利率与净利率承压。

3 verified
1 conflict

Explore →
```

背景：

可以透明。

---

# 43. Pin Summary

Pinned summary：

像：

```text
editorial note
```

不是 popover。

---

# 44. My World

用户研究过的公司：

也不要 Terrain islands。

改成：

# Horizontal Editorial Scenes

例如：

```text
← 招商银行

[   MIDEA VISUAL SCENE   ]
      美的集团

                   贵州茅台 →
```

---

# 45. Company Traversal

左右 drag / trackpad：

整个 Scene 横移。

邻居 Scene：

露出一部分。

参考：

```text
Unseen
OceanX
high-end portfolio
```

---

# 46. 不做传统 carousel

不要：

```text
< 1 / 3 >
```

---

# 47. My World Scene

每家公司：

拥有：

```text
visual
name
ticker
industry
research status
```

---

# 48. Enter Company

当前 Scene：

扩大 / crop。

其他公司：

离开。

Company Research Canvas：

从 Scene 中生长。

---

# 49. World → Reading

这是重点。

不要：

```text
点击
→ 页面闪换
```

---

# 50. Dimension Explore

用户：

```text
Explore →
```

以后：

主 Visual：

```text
reposition
crop
shrink / slide
```

Dimension title：

使用 shared element：

移动到 Reading header。

---

# 51. Reading Layout

现有 Claim Spine + Evidence Rail：

可以保留。

因为它已经是成熟信息设计。

但重新做视觉样式。

---

# 52. Reading 页面配色

继续：

```text
cool white
graphite
```

不要回到土黄色。

---

# 53. Reading Visual Continuity

保留：

```text
10–20% Company Visual
```

作为：

```text
left strip
top strip
background fragment
```

任选合理方式。

用户应该知道：

> 仍然在同一个 Company World。

---

# 54. Reading Typography

Company / Dimension title：

明显更大。

正文：

更舒展。

不要所有内容：

```text
12–16px
```

---

# 55. Evidence Rail

可以保留。

但：

弱化“传统 Sidebar”。

使用：

```text
editorial column
vertical rule
```

而不是：

card panel。

---

# 56. Claim → Evidence

Anchor：

可以通过：

```text
thin line
position
highlight
```

连接。

不要更多 Card。

---

# 57. UNKNOWN

不要：

terrain fog。

新语言：

```text
blurred media region
masked visual
empty annotation zone
unfinished rule
```

---

# 58. UNKNOWN 示例

```text
海外业务

Evidence incomplete
────────────
```

附近 visual：

soft blur / reduced detail。

---

# 59. CONFLICT

不要裂谷。

使用：

```text
split annotation
crossing leaders
two directional metrics
```

例如：

```text
Revenue       +3.55%
               ↘
                 CONFLICT
               ↗
Gross Margin  -0.36pct
```

克制表现。

---

# 60. AI Suggestion

不要 Card。

可以存在于：

Visual field 边缘。

例如：

```text
+ 全球化与海外收入
  suggested research
```

像一个：

```text
ghost annotation
```

---

# 61. Suggestion Drag

继续保留。

拖进主 Research Area：

直接调用已有 Add 逻辑。

---

# 62. Command Lens

保留。

但当前黑色 pill：

视觉权重过高。

新设计：

更薄、更轻。

例如：

```text
translucent cool surface
thin border
```

---

# 63. Command Lens 不得成为页面最大黑块

---

# 64. Top Chrome

当前：

```text
STOCKLENS
右上大黑 pill
```

重新设计。

建议：

```text
STOCKLENS                 MIDEA / 000333.SZ
```

plain typography。

不一定需要 pill。

---

# 65. Interaction priority

必须保证：

```text
Pan
Dimension drag
Gather
Spread
Focus Set
Peek
Pin
Park
Suggestion Drag
Command Lens
```

全部继续存在。

---

# 66. 任何新视觉导致上述功能消失

```text
FAIL
```

---

# 67. 不要为了保留交互恢复旧布局

交互能力：

和旧视觉布局解耦。

---

# 68. Responsive

Desktop First：

1440×900。

---

# 69. Mobile

不要求同样视觉世界。

保留：

```text
company header
dimension strip
reading
```

---

# 70. Visual Prototype 第一个 Gate

先只做：

```text
Company World
```

不要立即开发：

```text
Reading
My World
UNKNOWN
```

---

# 71. Company World 第一张截图

实现完：

立刻保存：

```text
docs/design-audit/ui-reset/
01-company-world-v1.png
```

---

# 72. 然后停止继续功能

Agent 自己检查：

是否仍然存在：

```text
中心环
一圈节点
土黄
几个小点
六个一样大小对象
```

只要任一明显存在：

**先重新设计。**

---

# 73. Company World Gate

要求第一屏视觉：

至少满足：

```text
1 major visual focal area
1 strong company identity
4–6 research annotations
clear asymmetry
strong whitespace
strong typography hierarchy
almost no card backgrounds
```

---

# 74. 不通过不要继续

---

# 75. 第二 Gate

Company World 通过后：

实现：

```text
Hover
Drag
Peek
Focus Set
```

截图：

```text
02-hover.png
03-dragged-layout.png
04-peek.png
05-focus-set.png
```

---

# 76. 第三 Gate

再做：

```text
Reading transition
```

截图：

```text
06-transition-start.png
07-transition-mid.png
08-reading.png
```

---

# 77. 第四 Gate

再做：

```text
My World traversal
```

---

# 78. GitHub Artifact

必须上传：

```text
docs/design-audit/ui-reset/
```

---

# 79. REFERENCE_AUDIT.md

必须上传。

---

# 80. UI_RESET_STATUS.md

必须记录：

```text
Route
Commit
Primary references
Palette
Typography
Visual asset source
Interaction preserved checklist
Known gaps
Screenshot index
```

---

# 81. Interaction preserved checklist

逐项：

```text
[ ] Pan
[ ] Zoom
[ ] Fit
[ ] Dimension drag
[ ] Gather
[ ] Spread
[ ] Reset
[ ] Multi-select
[ ] Focus selected
[ ] Peek
[ ] Open research
[ ] Pinned summary
[ ] Summary drag
[ ] Park
[ ] Restore
[ ] Suggestion drag
[ ] Add dimension
[ ] Command Lens
[ ] My World traversal
[ ] Evidence interaction
```

---

# 82. 不允许用 tests 替代视觉验收

可以：

```text
lint
typecheck
build
```

正常过。

但：

> UI 是本任务本体。

---

# 83. 禁止 Agent 自己说“设计通过”

Completion 只能说：

```text
UI Reset prototype delivered for review.
```

---

# 84. 不修改 Root

新页面仍然独立 Route。

Reviewer 批准：

才替换 `/observatory`。

---

# 85. 最终 3 秒 Test

如果打开截图：

第一眼看到：

```text
圆
节点
网络图
Dashboard
```

FAIL。

如果第一眼看到：

```text
strong visual composition
large media
large typography
research annotations
interactive workspace
```

正确。

---

# 86. 核心原则

不要再问：

> “这些维度应该围着公司怎么摆？”

重新问：

> **“如果 Unseen / OceanX / Lusion 来设计一家公司的 AI Research Workspace，它会长什么样？”**

然后：

把那个设计语言应用到 StockLens。

---

# 87. 这一次不要创新新的视觉隐喻

不要：

```text
mountain
island
planet
cow
galaxy
terrain
```

先把：

```text
composition
typography
media
spacing
interaction
motion
```

真正做好。

---

# 88. 最终目标

不是：

> 一个视觉新奇的 AI 股票 Demo。

而是：

> **一个看起来真的由成熟数字设计团队做出来的 AI Research Product。**