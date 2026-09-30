# StockLens Observatory
## Screen-by-Screen Visual & Interaction Spec v1.0

本文件承接：

`StockLens Observatory｜Interaction & Technical Architecture v1.0`

前一文件负责：

- 产品范式；
- Research Space；
- Lens / Space / Objects；
- Dynamic Research Dimensions；
- Research Claim；
- Evidence Rail；
- Research API；
- 前后端总体架构。

本文件负责：

> **把这些概念真正落成可以开发的屏幕、空间、交互、视觉和动效。**

---

# 1. 总体体验原则

StockLens Observatory 不是：

```text
AI Chat
+
金融 Dashboard
```

核心体验：

```text
发现公司
↓
进入公司研究空间
↓
AI 组装研究视角
↓
直接操作研究对象
↓
Claim 与 Evidence 同屏
↓
用户扩展 / 质疑 / 继续研究
```

整个产品必须让用户产生：

> “我进入了一家公司，而不是打开了一个报告。”

---

# 2. Desktop First

主要设计基准：

```text
1440 × 900
```

兼容：

```text
1280 × 800
```

移动端：

保证功能可用。

但本次最重要的评审体验是 Desktop。

---

# 3. Global Shell

整个 Observatory 默认：

```text
100vw × 100vh
overflow: hidden
```

背景：

```text
#07090E
```

不是纯黑。

带极弱：

```text
radial gradient
noise texture
evidence field
```

---

# 4. Global Chrome

顶部只保留极少信息。

左上：

```text
STOCKLENS
```

小型 wordmark。

右上：

```text
[当前公司]
[Help / About]
```

不要传统：

```text
首页
分析
行情
新闻
设置
```

Navigation Bar。

---

# 5. Bottom Command Lens

默认常驻屏幕底部中央。

Collapsed：

```text
┌────────────────────────────┐
│  ⌘K   Ask · Focus · Add    │
└────────────────────────────┘
```

尺寸约：

```text
420 × 46px
```

透明黑玻璃。

不是大输入框。

---

# 6. Scene A｜Company Discovery

这是首页。

页面不要：

```text
Hero Title
Subtitle
Big Prompt Box
Quick Question Chips
```

---

# 7. Discovery Visual

屏幕中央：

一个直径约：

```text
520px
```

的弱光 Lens Field。

不是明显圆形按钮。

更像：

```text
光学焦域
```

---

# 8. Discovery Typography

Lens 中央：

```text
STOCKLENS

Understand a company.
```

下面：

```text
Search company / ticker
```

字体大但克制。

---

# 9. Company Search Interaction

用户开始输入：

```text
美的
```

Lens 周围形成候选对象。

不是普通 dropdown。

例如：

```text
              美的置业
                 ·

     美的集团
     000333.SZ        · 其他结果

                 ·
```

最相关结果：

更靠近 Lens 中心。

其他结果：

```text
opacity 0.35
blur 1–2px
scale 0.92
```

---

# 10. Search Usability

视觉可以空间化。

但：

键盘 ↑ ↓ Enter 必须正常工作。

Accessibility 优先于炫技。

---

# 11. Default Demo

第一次打开：

可以在 Lens 下方非常轻地显示：

```text
Try:
美的集团 · 000333.SZ
```

点击即可进入。

---

# 12. Company Selection

选中股票后：

不要 page reload。

Lens 扩张。

候选公司淡出。

公司名称：

```text
美的集团
000333.SZ
```

向中央吸附。

---

# 13. Company Zoom

Transition：

```text
500–700ms
```

公司进入：

```text
Company Core
```

---

# 14. Scene B｜Research Assembly

Company Core 中央：

```text
MIDEA GROUP

000333.SZ
白色家电
```

下方小字：

```text
Building your evidence space…
```

---

# 15. Loading 不伪造进度

如果后端没有 streaming：

禁止：

```text
Company resolved ✓
Metrics computed ✓
Evidence built ✓
```

假步骤。

---

# 16. Assembly Background

请求返回前：

只有：

```text
模糊 dots
极细网格
focus ring
```

这些不代表真实 Evidence。

---

# 17. API 返回

真实 Research Space 到达后：

Evidence Field 才开始形成。

---

# 18. Dimension Reveal

AI 生成的 Research Dimensions：

按 priority：

依次进入。

Stagger：

```text
70–100ms
```

例如：

```text
增长韧性
盈利质量
现金转化
行业相对表现
```

---

# 19. Suggested Dimension

AI Suggestion 不自动进入主研究区。

在外围：

```text
半透明
虚线轮廓
```

例如：

```text
Suggested by StockLens

短期市场背离
＋ Add
```

---

# 20. Scene C｜Space Overview

Company Core 在中央。

Dynamic Dimensions：

分布在外围。

不是固定 dashboard grid。

---

# 21. Company Core

尺寸：

```text
180–220px
```

不做大圆球。

视觉：

```text
Typography
+
focus rings
+
subtle refractive glow
```

---

# 22. Dimension Object

默认：

```text
140–210px width
```

不是完整 Card。

更像：

```text
floating research object
```

---

# 23. Dimension Level 0

显示：

```text
盈利质量
```

和一个很细的小 indicator：

```text
4 evidence
```

---

# 24. Dimension Status

READY：

```text
solid
```

PARTIAL：

```text
soft gradient edge
```

UNKNOWN：

```text
outline / translucent
```

---

# 25. Semantic Zoom｜Hover

Hover Dimension：

对象放大约：

```text
1.06
```

显示：

```text
盈利质量

3 verified
1 conflict
```

---

# 26. Evidence Field Reaction

Hover：

属于该 Dimension 的 Evidence nodes：

变亮。

其他 cluster：

```text
opacity → 0.15
```

---

# 27. Semantic Zoom｜Click

Click Dimension：

整个空间：

向该对象产生轻微 camera pan。

Company Core：

缩小并偏向左上。

其他 Dimension：

退到空间边缘。

---

# 28. Scene D｜Dimension Focus

中央打开：

```text
Research Surface
```

不是 Modal。

像这个 Dimension：

在空间里展开。

---

# 29. Dark → Light Transition

Research Surface：

从深色对象 morph 成：

```text
warm ivory
```

颜色：

```text
#F3F0E8
```

---

# 30. Reading Surface Layout

1440 Desktop：

```text
┌────────────┬─────────────────────────┬─────────────┐
│ Context    │ Research Surface        │ Evidence    │
│ Space      │                         │ Rail        │
│ 220px      │ ~760px                  │ ~340px      │
└────────────┴─────────────────────────┴─────────────┘
```

---

# 31. Left Context Strip

显示：

```text
美的集团
盈利质量

← Back to space
```

以及相关 Dimensions：

弱化。

---

# 32. Research Surface Header

例如：

```text
盈利质量

收入仍保持增长，
但利润率正在承受压力。
```

下面：

```text
4 verified evidence
1 conflict
1 unknown
```

---

# 33. Claim Spine

核心不是 Card Grid。

正文：

```text
01
收入保持增长，但毛利率同比下降        ① ②

02
利润增速低于收入增速                  ③ ④

03
经营现金流仍覆盖净利润                ⑤

────────  尚不能确认  ────────

历史盈利能力是否处于周期高位
```

---

# 34. Claim Spacing

Claim 间距大。

每条：

像编辑文章中的论点。

不是：

一张张彩色 Card。

---

# 35. Claim Type

Claim 左侧细标：

```text
FACT
INFERENCE
UNKNOWN
```

只做小字号。

---

# 36. Evidence Anchor

直接显示：

```text
① ②
```

不要：

```text
查看证据 →
```

作为主要入口。

---

# 37. Evidence Hover

Hover：

```text
①
```

右侧 Evidence Rail：

立即 preview。

响应：

```text
< 160ms
```

---

# 38. Evidence Rail

常驻。

Header：

```text
EVIDENCE 01
FACT
```

---

# 39. Evidence Rail Main

例如：

```text
营业收入累计同比

+3.55%

2026-Q2
vs 2025-Q2
```

---

# 40. Evidence Rail Meta

下面：

```text
FUYAO
operating_income

Verified
2026-09-30
```

---

# 41. Metric Formula

折叠：

```text
Calculation →
```

展开：

```text
(current / previous - 1) × 100%
```

---

# 42. Interpretation Guardrail

如果存在：

```text
low_base
sign_flip
extreme_change
```

Rail 显示：

```text
INTERPRETATION CAUTION
```

而不是 Warning Error。

---

# 43. Pin Evidence

Click Anchor：

Pin。

Rail Header：

```text
PINNED
```

---

# 44. Hover Other Evidence

Pinned 后 Hover 其他：

显示：

```text
Previewing ②
```

Mouse leave：

恢复 pinned。

---

# 45. Claim Hover Actions

Hover Claim：

右侧浮出：

```text
Ask
Challenge
History
```

如果 action 不可用：

不要显示。

---

# 46. Ask Claim

点击：

```text
Ask
```

Claim 下方展开：

```text
Inline Research Thread
```

---

# 47. Inline Research Thread

例如：

```text
02 利润增速低于收入增速

   Why?

   当前证据可以确认：
   …

   当前证据不能确认：
   …

   ① ②
```

---

# 48. 不出现 Chat Bubble

Thread：

像：

```text
research annotation
```

不是微信聊天。

---

# 49. Challenge

点击：

```text
Challenge
```

Claim 轻微抬起。

底下展开三层。

---

# 50. Challenge Layer 1

```text
SUPPORT
```

列支持 Evidence。

---

# 51. Challenge Layer 2

```text
COUNTER-SIGNALS
```

显示：

同 Dimension 中：

方向相反或 conflict Evidence。

---

# 52. Challenge Layer 3

```text
UNKNOWN
```

显示：

仍缺失的信息。

---

# 53. Challenge Visual

三层可以像：

```text
叠纸
```

从 Claim 下方逐层展开。

---

# 54. Scene E｜Add Dimension

Space Overview：

始终存在：

```text
＋
```

节点。

---

# 55. Add Hover

显示：

```text
Add a research angle
```

---

# 56. Add Click

Lens 在原位置扩张。

不是中央 Modal。

---

# 57. Add Input

```text
What else do you want to understand?
```

例如：

```text
库存压力
```

---

# 58. AI Suggestion

输入下面：

```text
StockLens suggests
```

例如：

```text
库存效率
海外业务
资本投入
分红能力
```

这几个：

必须由 AI 当前生成。

不是静态 Chips。

---

# 59. Add Loading

提交后：

新 Research Object：

以 outline 形式先进入空间。

---

# 60. Result Ready

如果可验证：

outline → solid。

如果 partial：

部分亮起。

如果 unsupported：

保持半透明。

---

# 61. UNKNOWN Dimension

例如：

```text
海外业务
```

打开后：

Research Surface：

```text
Current evidence is incomplete.
```

下面：

```text
Currently missing:
• regional revenue
• overseas profit contribution
```

---

# 62. UNKNOWN 不是 Error

视觉：

```text
amber
soft dotted outline
```

不是红色。

---

# 63. Scene F｜AI Suggested Dimension

外围 ghost object：

```text
Suggested by StockLens
```

例如：

```text
短期市场背离
```

---

# 64. Hover Suggestion

显示：

```text
20D 与 120D 的方向不同

＋ Add to research
Dismiss
```

---

# 65. AI 不可自动修改空间

必须：

用户确认后才 Add。

---

# 66. Command Lens

快捷键：

```text
⌘K / Ctrl+K
```

---

# 67. Command Lens｜No Selection

显示：

```text
Ask about this company
Add dimension
Search another company
```

---

# 68. Command Lens｜Dimension Selected

例如：

```text
盈利质量
```

显示：

```text
Ask about 盈利质量
Inspect evidence
Add related dimension
View history
```

---

# 69. Command Lens｜Claim Selected

显示：

```text
Ask why
Challenge claim
Inspect evidence
```

---

# 70. 命令搜索

用户可直接输入：

```text
为什么毛利率下降？
```

它变成 contextual follow-up。

---

# 71. Evidence Field

第一版：

使用：

```text
SVG
```

不要 Three.js。

---

# 72. Evidence Field Rendering

Node：

圆点 / ring。

Edge：

`basedOn`。

---

# 73. FACT Node

小实心点。

颜色：

```text
#45B8FF
```

---

# 74. INFERENCE

两个/多个 Fact：

通过细线汇聚。

节点：

```text
violet ring
```

---

# 75. UNKNOWN

不画具体实体点。

使用：

```text
dashed incomplete contour
```

---

# 76. CONFLICT

使用：

```text
split stroke
crossing waveform
```

避免：

大红警报灯。

---

# 77. Evidence Field Density

最多：

```text
12–20
```

显式节点。

---

# 78. Evidence Field 不是完整 Graph

它的作用：

```text
orientation
+
atmosphere
+
relation
```

完整信息仍在 Research Surface。

---

# 79. Visual Language

## Observatory Background

```text
#07090E
```

## Dark Surface

```text
#0E1118
```

## Primary Light Text

```text
#F1F3F5
```

## Secondary

```text
#8C94A8
```

---

# 80. Reading Sheet

```text
#F3F0E8
```

Ink：

```text
#14161B
```

Secondary Ink：

```text
#676A70
```

---

# 81. Evidence Type Colors

FACT:

```text
#45B8FF
```

INFERENCE:

```text
#9A7BFF
```

UNKNOWN:

```text
#EAB95F
```

CONFLICT:

```text
#F06B5E
```

---

# 82. 禁止

不要：

```text
绿色 = 股票好
红色 = 股票差
```

---

# 83. Typography

英文：

```text
Geist / Inter
```

中文 fallback：

```text
PingFang SC
Microsoft YaHei UI
Noto Sans SC
sans-serif
```

数字：

```text
font-variant-numeric: tabular-nums
```

---

# 84. Technical Metadata

使用：

```text
Geist Mono
IBM Plex Mono
monospace
```

---

# 85. Motion Philosophy

Motion：

必须解释空间关系。

不是：

装饰动画。

---

# 86. Motion Types

允许：

```text
scale
opacity
blur
translate
shared layout morph
subtle spring
```

---

# 87. 禁止

```text
constant floating animation
random bouncing cards
huge parallax
rainbow gradients
excessive glow
```

---

# 88. Important Timings

Company Zoom：

```text
600ms
```

Dimension Reveal：

```text
80ms stagger
```

Object Focus：

```text
420ms
```

Rail Preview：

```text
120ms
```

Add Dimension：

```text
360ms
```

---

# 89. Reduced Motion

`prefers-reduced-motion`：

关闭：

```text
camera zoom
large scale morph
background movement
```

但状态变化仍清晰。

---

# 90. Mobile

移动端不强行复制 Constellation。

---

# 91. Mobile Overview

使用：

```text
Company Header
+
horizontal Dimension Strip
+
Research Surface
```

---

# 92. Evidence Rail Mobile

变成：

```text
Bottom Sheet
```

---

# 93. Command Lens Mobile

固定底部。

---

# 94. Accessibility

必须：

```text
keyboard company search
keyboard dimension focus
keyboard evidence anchors
focus visible
aria labels
escape close / back
```

---

# 95. Responsive Fallback

如果屏幕：

```text
< 1024px
```

减少：

Evidence Field visual density。

---

# 96. First Implementation Scope

本轮 Observatory v1 必须：

```text
Company Search
Dynamic AI Dimensions
Space Overview
Semantic Zoom
Dimension Focus
Claim Spine
Evidence Rail
Add Dimension
AI Suggested Dimension
Inline Follow-up
```

---

# 97. Nice-to-have

时间允许：

```text
Challenge
Evidence Field richer transitions
```

---

# 98. 不在 v1 实现

```text
Full Time Travel
Drag-to-Compare
Dimension Combine
Voice
Three.js
Persistent Workspace
```

这些设计保留。

---

# 99. Reference Principles

Krea：

借：

```text
direct manipulation
```

不借：

生成图片产品布局。

Linear：

借：

```text
contextual actions
command interaction
```

Arc：

借：

```text
spatial workspace
command controller
```

Tufte：

借：

```text
information adjacent in space
layering
separation
```

Bret Victor：

借：

```text
context-sensitive information graphics
```

不要逐像素复制任何产品。

---

# 100. 最终设计验收问题

打开 StockLens Observatory 30 秒后：

评审是否能理解：

```text
这不是聊天机器人
```

是否看到：

```text
不同公司 / 问题形成不同研究空间
```

是否理解：

```text
Claim 来自 Evidence
```

是否可以：

```text
自己加入一个研究角度
```

是否能：

```text
直接沿着 Claim 查看证据
```

如果答案都是 Yes：

Observatory 设计成立。