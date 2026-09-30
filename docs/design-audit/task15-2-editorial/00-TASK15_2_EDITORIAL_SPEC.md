# Task 15.2｜Reference-led Visual Redesign（Editorial Research World）

> **治理声明**：本文件是 Task 15.2 第二版方向的完整原始 Spec（逐字保留，未经压缩），**取代**
> `docs/design-audit/task15-2/00-TASK15_2_SPEC.md`（山体/terrain 方向已停止）。
> 实现过程中的所有决策以本文件为准。

---

# Task 15.2｜Reference-led Visual Redesign

## 0. 先停止当前方向

立即停止：

```text
3D 山体建模
terrain mesh
山峰 / 山谷
写实地形
地貌生成
为了做 Terrain 而做 Terrain
```

不要继续优化当前山体方案。

本轮核心不是：

> "如何做一个更好的 Terrain？"

而是：

> **"如何直接学习优秀网站的视觉构图与交互，再把它转译成 StockLens？"**

---

# 1. 重要原则：仿照设计，不仿照技术

看到参考网站使用：

```text
WebGL
Three.js
摄影
视频
Canvas
Shader
```

不要自动使用同样的技术。

先判断：

> 用户肉眼看到的效果是什么？

如果：

```text
HTML + CSS + image + video
```

就能达到类似效果，

优先使用简单方案。

---

# 2. 禁止再次自行发明"世界"

不要再自行设计：

```text
山
岛
星球
牛
terrain
orbit
```

除非 Reference 本身明确需要。

这轮：

**Reference first.**

---

# 3. 必须先实际打开以下网站

不要只读文字。

---

## PRIMARY REFERENCE A｜Unseen World

[打开 Unseen World](https://unseen.co/world/)

这是本轮**最主要的交互参考**。

重点仿照：

```text
大面积视觉场
Drag to explore
少量文字
没有 Dashboard Grid
没有卡片墙
对象散布在视觉世界中
视口本身就是导航
高质量 typography
内容之间有明显空间距离
```

StockLens 对应：

```text
Drag to explore company research
```

而不是：

```text
中心公司 + 一圈节点
```

---

# 4. PRIMARY REFERENCE B｜Unseen Projects

[打开 Unseen Projects](https://unseen.co/projects/)

重点仿照：

```text
editorial composition
large media
minimal navigation
strong whitespace
内容不是等宽小卡片
```

StockLens：

Dimension 不要全部变成相同尺寸的块。

可以：

```text
一个大的研究主题
一个靠边的主题
一个只显示 label 的主题
一个只有视觉 hint 的未知主题
```

形成真正的视觉 hierarchy。

---

# 5. PRIMARY REFERENCE C｜OceanX 2025

[打开 OceanX 2025](https://2025.oceanx.org/)

重点仿照：

```text
高清摄影 / 视频作为视觉主体
文字直接浮在媒体上
状态切换通过镜头 / media transition 表达
页面不是一堆组件
```

StockLens 可以直接采用：

> **Media-first World**

即：

```text
一张高质量 visual
+
少量 Research labels
+
Evidence annotations
```

不要把世界建立在"形状"上。

---

# 6. PRIMARY REFERENCE D｜Lusion

[打开 Lusion](https://lusion.co/)

重点看：

```text
一个视觉主体可以占页面绝大部分
超大的 typography
非常少的 UI chrome
大胆 composition
高质量 motion
```

不要学习：

```text
必须 3D
必须 astronaut
```

只学：

> **Visual confidence。**

StockLens 现在的问题正是：

所有东西都太小、太平均、太谨慎。

---

# 7. Lusion Devin AI

[查看 Devin AI project](https://lusion.co/projects/devin_ai/)

这是 AI 产品相关参考。

重点：

```text
complex AI product
仍然可以做得 clean
advanced
approachable
```

StockLens 不应该为了"金融专业"就只剩：

```text
细线
小字
小点
```

---

# 8. Active Theory

[打开 Active Theory Projects](https://v4.activetheory.net/work)

参考：

```text
immersive media
very large visual subject
motion driven navigation
depth from composition
```

不是必须真的 3D。

---

# 9. Krea

[Krea Realtime Edit](https://www.krea.ai/blog/realtime-edit)

Krea 只参考：

> **Direct manipulation。**

官方的 Realtime Edit 是 brushstroke 本身直接改变结果，没有额外 Generate / wait loop。

StockLens 对应：

```text
拖动对象
聚焦对象
选择对象
```

应该直接改变研究状态。

---

# 10. Bruno Simon

[打开 Bruno Simon](https://bruno-simon.com/)

只学习：

> **整个网站拥有一套统一操作语言。**

他的核心是：

```text
Drive
Move
Interact
```

网站自己也明确把 drive、camera、map、interact 组织成统一控制体系。

StockLens：

```text
Explore
```

应该成为统一动词。

---

# 11. 这轮不要综合十个网站做四不像

采用：

## 视觉主参考

```text
Unseen
+
OceanX
```

## Typography / composition 加强

```text
Lusion
```

## Interaction principles

```text
Krea
+
Bruno Simon
```

其他只作为辅助。

---

# 12. 新视觉方向

取消：

```text
Terrain World
```

作为主视觉概念。

暂定：

# Editorial Research World

它应该像：

```text
高端创意网站
+
互动研究工作台
```

不是：

```text
地图
Dashboard
Mind Map
```

---

# 13. 核心画面采用 Media-first

页面视觉主体：

可以是：

```text
高清摄影
高质量视频 loop
静态 editorial image
抽象高质量影像
```

而不是程序生成山体。

---

# 14. Prototype 可以先使用静态媒体

不要先解决：

```text
每家公司自动生成什么背景
```

先固定：

```text
Midea fixture
+
1 个高质量 prototype visual
```

把页面设计做好。

---

# 15. 不要复制参考网站的图片资产

参考它们：

```text
composition
scale
cropping
media placement
typography
motion
interaction
```

不要直接下载并作为 StockLens 正式素材。

Prototype 可以使用：

```text
repo 内已有合法资产
自制抽象资产
允许使用的 stock media
```

---

# 16. 页面不能再是一个中心

当前失败构图：

```text
             Dimension

Dimension   Midea   Dimension

Dimension           Dimension
```

完全取消。

---

# 17. 新构图必须 asymmetric

参考 Unseen / Lusion。

例如：

```text
┌────────────────────────────────────────────┐
│ STOCKLENS                       000333.SZ   │
│                                            │
│                                            │
│            [ LARGE VISUAL ]                │
│            [              ]      盈利质量   │
│            [              ]                │
│   增长韧性 [              ]                │
│            [              ]                │
│                               现金转化     │
│                                            │
│       行业相对表现                         │
│                                            │
│                         Explore →          │
└────────────────────────────────────────────┘
```

这只是示意。

不要照着排版。

重点：

```text
没有中心环
没有 radial
没有六个一样的对象
```

---

# 18. Dimension 应该像 editorial annotations

默认可以只是：

```text
盈利质量
↗ 6 evidence
```

文字直接存在于空间中。

不是：

```text
[ 盈利质量 ]
```

白色框。

---

# 19. Hover Dimension

参考高端 portfolio 的 hover：

```text
文字层级提高
相关媒体区域改变
局部遮罩 / crop 改变
其他内容降低
```

不要：

```text
border glow
```

---

# 20. Dimension 选择

点击：

不是弹 Card。

视觉主体可以：

```text
轻微移动
crop 改变
media focus 到对应区域
summary 出现在其附近
```

---

# 21. Media 可承担"世界"的角色

例如一张 16:9 visual。

每个 Dimension 可以对应：

```text
不同 crop
不同 focal point
不同 overlay
不同 annotation region
```

于是用户 Explore 的感觉来自：

> **镜头在一个 visual world 里移动。**

不用建模。

---

# 22. Background 不等于装饰

Media 层可以用于表达：

```text
当前公司
行业气质
研究主题
```

但不能：

暗示股票好坏。

---

# 23. UNKNOWN

不要山雾。

可以参考 editorial / photographic treatment：

```text
局部 blur
masked image
low detail
empty space
unfinished annotation
```

配：

```text
Evidence incomplete
```

---

# 24. Conflict

不要裂谷。

使用更平面、更设计化的：

```text
双层 annotation
crossed leader
split typography
two competing indicators
```

---

# 25. Evidence

Evidence 可以像：

```text
editorial footnote
image hotspot
technical annotation
```

不是蓝点。

例如：

```text
01
Revenue YoY
+3.55%

──────────●
```

---

# 26. Photography + Technical Annotation

这是 StockLens 很适合的组合：

```text
高质量摄影 / visual
+
精细数据标注
+
大 typography
```

类似：

> magazine editorial × scientific instrument。

---

# 27. Reading Surface

继续保留。

第二张截图那种：

```text
editorial reading
Claim Spine
Evidence Rail
```

本身没有问题。

真正要改的是：

> World → Reading 的视觉连接。

---

# 28. World → Reading

参考 OceanX / high-end portfolio 的 transition：

Visual 可以：

```text
扩大
crop
move aside
fade into background
```

与此同时：

Dimension title：

移动到 Reading header。

---

# 29. 不需要复杂 Shape Morph

不用再：

```text
region path → rectangle
```

这种机械 morph。

可以：

```text
media crop transition
+
shared typography
+
camera movement
```

反而更高级。

---

# 30. Shared Element

必须至少共享：

```text
Dimension title
```

例如：

World：

```text
盈利质量
```

点击。

标题：

移动到 Reading page 左上。

内容随之展开。

---

# 31. World 可以保留一点

进入 Reading：

不要完全把背景杀掉。

可以留下：

```text
5–10% media strip
或
blurred media background
```

强化 continuity。

---

# 32. Photography 不是必须公司实拍

Prototype 阶段：

主要验证：

```text
layout
media use
motion
interaction
```

不需要解决最终内容资产系统。

---

# 33. 不要先做自动选图 AI

本轮不做。

---

# 34. 不要 3D 建模

明确：

```text
NO mountain modelling
NO terrain mesh
NO procedural landscape
NO Blender workflow
```

---

# 35. WebGL 不是禁用

如果只是：

```text
image distortion
cursor displacement
transition effect
```

需要 shader，

可以用。

但：

> WebGL 服务媒体效果。

不是为了建世界模型。

---

# 36. 第一阶段还是 Visual Prototype

Route：

```text
/observatory/lab/editorial-v1
```

---

# 37. 只使用固定 Midea fixture

不要调用真实 AI。

避免等待。

---

# 38. 必须至少设计三个状态

## State A

Company World。

## State B

Dimension selected。

## State C

Reading entry。

---

# 39. 必须做真实 interaction

至少：

```text
drag / pan visual field
hover dimension
click dimension
transition into reading
back
```

---

# 40. 不做

```text
完整 Add Dimension
完整 Compare
完整 Evidence API
```

先看设计。

---

# 41. Visual Gate 截图

提交：

```text
docs/design-audit/task15-2-editorial/
```

至少：

```text
01-company-world.png
02-world-hover.png
03-dimension-selected.png
04-reading-transition.png
05-reading.png
06-unknown-treatment.png
07-conflict-treatment.png
```

---

# 42. 视频

必须录：

```text
editorial-prototype.webm
```

15–25 秒。

流程：

```text
进入
→ Drag / Explore
→ hover Dimension
→ click
→ Reading
→ back
```

---

# 43. Reference Comparison

新增：

```text
REFERENCE_COMPARISON.md
```

逐项回答：

## Unseen

我们的页面在哪些地方仿照：

```text
world scale
drag exploration
sparse interface
```

## OceanX

仿照：

```text
full-bleed media
state transition
typography over visual
```

## Lusion

仿照：

```text
visual scale
bold hierarchy
minimal chrome
```

## Krea

仿照：

```text
direct manipulation
```

---

# 44. 截图必须放一起对比

STATUS 中不要说：

```text
已实现高端视觉
```

而写：

```text
Reference characteristic:
Large media focal point

Our implementation:
01-company-world.png
```

让 reviewer 判断。

---

# 45. 禁止 Agent 自评通过

只能返回：

```text
Visual prototype delivered for review.
```

---

# 46. 第一阶段不能改 Production

当前：

```text
/observatory
```

不动。

---

# 47. 不做山以后不要偷偷换成球

也禁止：

```text
planet
sphere
floating blob
radial network
```

这轮应该彻底离开：

> 中央物体 + 周边节点。

---

# 48. Typography

本轮非常重要。

参考 Lusion / Unseen：

使用：

```text
large scale typography
extreme size contrast
small technical metadata
lots of negative space
```

---

# 49. 中文也要大胆

不要因为中文就全部：

```text
14px
16px
```

例如 Dimension focal title：

可以：

```text
32–48px
```

Company：

甚至：

```text
56px+
```

根据构图判断。

---

# 50. Visual density

现在 StockLens：

太碎、太小。

新版：

```text
fewer things
much larger things
strong hierarchy
```

---

# 51. Command Lens

保留。

但更轻。

不能成为页面最重的黑色对象。

---

# 52. 顶部 Chrome

减弱。

当前右上黑色 Company pill：

过 SaaS。

Prototype 中尝试：

```text
plain text
+
small metadata
```

---

# 53. Color

不要预先固定 Pearl。

颜色应该从：

```text
media
+
content
```

产生。

---

# 54. 可以深色也可以浅色

但必须像：

> 一个完整 Art Direction。

而不是 Theme Toggle。

---

# 55. 最终 3 秒判断

打开截图：

如果先看到：

```text
卡片
节点
圈
```

FAIL。

如果先看到：

```text
visual composition
media
typography
world
```

正确。

---

# 56. Development Priority

顺序必须：

```text
Composition
↓
Typography
↓
Media
↓
Interaction
↓
Micro detail
```

禁止：

```text
先写 architecture
先写 test
再看看长什么样
```

---

# 57. 第一天就截图

实现第一个 Company World 后：

立即截图。

如果构图不好：

先改构图。

不要继续功能。

---

# 58. 不允许"差不多再优化"

设计是本任务本体。

---

# 59. GitHub

Push：

```text
prototype
screenshots
video
reference comparison
status
```

---

# 60. Completion Report

只返回：

## Prototype Route

## Primary References

## Company World Screenshot

## Hover Screenshot

## Selected Screenshot

## Reading Screenshot

## Video

## Reference Comparison

## Known Visual Gaps

然后停止。

不要进入 integration。
```
