# Task 15.2｜照参考图实现 High-Fidelity Sculptural Research World

> **治理声明**：本文件是 Task 15.2 的完整原始 Spec（逐字保留，未经压缩）。
> 实现过程中的所有决策以本文件为准；压缩摘要（见 TASK15_2_VISUAL_GATE.md）仅作索引用。
> Userselect 附图（5 张参考截图）为权威视觉依据：San Rita 地形主界面、EQT Ventures 首屏雕塑主体、
> EQT 粒子 Q、Unseen 首屏、OceanX 章节。

---

## 重要：这轮不是"自由设计"

这轮不要再根据文字描述自行理解"高级 / Terrain / 沉浸"。

**必须先打开下面所有参考页面和参考图，按图实现。**

目标不是逐像素复制品牌内容，而是：

> **在构图、空间占比、材质、景深、光影、3D 世界感、交互层级上，达到这些参考图同级别的视觉完成度。**

禁止再次产出：

```text
米白背景
+ SVG 等高线
+ 几个 blob
+ 小蓝点
```

这种概念图。

---

# 1. VISUAL REFERENCES — 必须先打开

## Reference A｜San Rita — 主视觉硬参考

页面：

[San Rita Topographic Design Case Study](https://abduzeedo.com/san-ritas-topographic-web-design-navigates-projects-terrain)

官网：

[San Rita Official Site](https://sanrita.ca/)

重点参考图：

### A1 — Terrain 主界面

打开 Case Study 后找到：

> `San Rita topographic web design 3D terrain map overview`

必须重点观察：

```text
真实 terrain depth
大面积世界占屏
材质纹理
阴影
camera angle
地图信息嵌入 terrain
hotspot 作为世界里的对象
```

不是看配色。

---

## Reference B｜EQT Ventures — Sculptural Object + Premium Corporate

页面：

[Immersive Garden — EQT Ventures](https://immersive-g.com/projects/eqt-ventures/)

重点观察页面首屏和主 3D object：

```text
大尺度主体
3D 材质
柔和高光
渐变光照
强视觉 hierarchy
大片负空间
DOM typography 和 WebGL object 共存
```

官方项目说明明确是：

```text
WebGL visual layer
+
clean DOM structure
```

StockLens 必须采用同样的"双层思路"。

---

## Reference C｜Unseen World — Drag to Explore

页面：

[Unseen World](https://unseen.co/world/)

重点观察：

```text
Drag to explore our world
world 本身就是 navigation
camera motion
视觉空间不是网页背景
用户真的在探索一个 world
```

---

## Reference D｜Immersive Garden — New World

页面：

[Immersive Garden — Amazon New World](https://immersive-g.com/projects/amazon-new-world/)

重点观察：

```text
map-driven world
3D depth
hover region response
世界本身承担信息结构
foreground / midground / background
```

---

## Reference E｜Immersive Garden — Orano

页面：

[Immersive Garden — Orano](https://immersive-g.com/projects/orano/)

重点观察：

```text
technical subject
stylized 3D
wireframe / scientific aesthetics
复杂技术信息如何被做得高级
```

不要复制核工业视觉。

---

# 2. 视觉目标不是"Terrain Map"

最终方向：

# Sculptural Research Landscape

不是：

```text
地图
山
岛
```

本身。

而是：

> **一个具有真实材质、深度、照明和空间结构的"研究地貌雕塑"。**

它应该同时具有：

```text
San Rita 的地貌感
+
EQT 的高端材质感
+
Unseen 的世界探索感
+
StockLens 自己的金融研究语义
```

---

# 3. 当前 Terrain V1 明确判定失败

以下视觉全部不要沿用：

```text
radial circle composition
中心一个公司
外围均匀摆六个节点
SVG blob island
thin contour only
small blue dots
card-like dimension object
```

当前 Terrain V1 可以保留代码。

但：

**不要在它上面继续修。**

---

# 4. 新建独立 Visual Prototype

先新建：

```text
/observatory/lab/landscape-v2
```

或：

```text
/lab/art-direction
```

使用固定 Midea canonical fixture。

不要改生产 Observatory。

---

# 5. 第一阶段目标只是一张图

第一阶段不要实现完整产品功能。

只做：

> **一张达到参考视觉水平的 Research Landscape。**

如果截图不够好：

不进入 integration。

---

# 6. 技术不再限制 SVG

允许：

```text
Three.js
React Three Fiber
WebGL
Canvas
custom shader
post-processing
```

只要结果明显更好。

---

# 7. 推荐 Visual Stack

优先尝试：

```text
React Three Fiber
+
Three.js
+
DOM overlay
```

---

# 8. 世界和 UI 必须分层

```text
WORLD LAYER
Three.js / WebGL / Canvas

UI LAYER
React DOM
```

禁止：

把中文、数字、Claim 全部画进 Canvas。

---

# 9. Camera

不要 top-down flat map。

采用：

```text
orthographic
or weak perspective
```

camera pitch：

```text
25°–40°
```

让世界真正有：

```text
foreground
midground
background
```

---

# 10. World 占屏比例

1440×900：

Research Landscape 必须占：

```text
75%–90% viewport
```

不是中央一小圈。

---

# 11. Full-bleed World

不要继续：

```text
白网页
里面套一个米白画布
```

World 应接近：

```text
full viewport
```

DOM controls 浮在其上。

---

# 12. Company ≠ 中央圆球

Terrain/Landscape 模式：

```text
Company = 整个 world / landscape
```

不再显示：

```text
一个巨大 Company Core 圆
```

公司名只作为：

```text
map / landscape title
```

例如：

```text
MIDEA GROUP
000333.SZ
WHITE GOODS
```

---

# 13. 不再使用 radial layout 作为视觉构图

底层 deterministic position 可以参考。

但视觉构图禁止：

```text
六个维度均匀环绕中心
```

必须：

```text
asymmetric
foreground / background
不同深度
不同距离
自然 terrain distribution
```

---

# 14. Terrain 必须是一整块 mesh

禁止：

```text
6 个 island blobs
```

推荐：

```text
one continuous displaced mesh
```

或：

```text
few connected sculptural surfaces
```

---

# 15. Region

Research Dimension：

必须像：

> 同一个 landscape 中的不同 zone。

不是：

> 六座孤立小山。

---

# 16. Region 之间的关系

允许：

```text
valley
ridge
transition zone
plateau
fog area
fracture
```

这些表达：

```text
coverage
evidence structure
unknown
conflict
```

---

# 17. Elevation 禁止表达股票好坏

禁止：

```text
higher = better
lower = worse
```

Elevation 只可映射：

```text
research depth
evidence richness
structural complexity
```

---

# 18. Material

必须有：

```text
roughness
specular response
normal/detail
soft shadow
surface variation
```

禁止纯色面片。

---

# 19. 推荐材质语言

## Mineral Editorial

方向：

```text
limestone
ivory mineral
graphite
cool slate
muted cobalt
ochre uncertainty
```

不要：

```text
green grass
orange canyon clone
purple AI neon
```

---

# 20. Lighting

至少：

```text
ambient
directional key
soft fill
```

视觉应类似：

> 建筑模型 / 产品雕塑摄影。

不是游戏。

---

# 21. Shadow

需要：

```text
soft contact shadow
ambient depth
```

但不要：

```text
dramatic game shadow
```

---

# 22. Atmospheric Depth

允许：

```text
fog
depth fade
slight haze
```

必须克制。

---

# 23. Evidence landmarks

Evidence 不能再是"小蓝点"。

至少要像真正的：

```text
survey marker
beacon
pin
instrument landmark
```

---

# 24. FACT

视觉：

```text
small precise beacon
solid
high clarity
```

---

# 25. INFERENCE

视觉：

```text
fine structural connector
linked markers
```

---

# 26. UNKNOWN

视觉：

```text
reduced-detail terrain
fog
unresolved mesh
blurred boundary
```

不是：

```text
虚线圈
```

---

# 27. CONFLICT

视觉：

```text
subtle terrain distortion
fault
crossing contour
```

禁止大红裂缝。

---

# 28. Label

Dimension Label：

使用 DOM overlay。

例如：

```text
PROFIT QUALITY
盈利质量
```

采用：

```text
thin leader
small anchor
```

与世界位置连接。

---

# 29. Label 不要卡片背景

默认：

```text
text only
```

或极轻 annotation。

禁止：

```text
white rounded rectangle
```

---

# 30. Suggestion

Suggested Dimension：

必须出现在：

```text
far edge
unresolved terrain
fogged shape
```

像：

> 世界正在形成的新区域。

---

# 31. Suggestion Label

例如：

```text
UNEXPLORED

全球化与第二曲线
```

---

# 32. Hover Region

不要 outline glow。

应该：

```text
local terrain contrast ↑
landmarks reveal
camera shifts subtly
label gains hierarchy
```

---

# 33. Pan

用户 drag：

真正移动 camera/world。

参考 Unseen：

> Drag to explore our world。

---

# 34. Camera Parallax

鼠标移动允许：

非常轻的 camera parallax。

不要过头。

---

# 35. Prototype 只实现 4 个 interaction

第一阶段只需要：

```text
Pan
subtle camera parallax
Hover Dimension
Hover Evidence
```

不要接完整 Task 13。

---

# 36. 动画

重点：

```text
material response
camera movement
terrain resolving
```

不要：

```text
floating bouncing islands
```

---

# 37. 第一阶段视觉必须照图

San Rita 主参考：

重点对齐：

```text
世界占屏比例
深度
复杂度
terrain 细节
空间 hierarchy
hotspot 嵌入方式
camera 感
```

EQT：

重点对齐：

```text
premium material
large sculptural visual
lighting
visual hierarchy
DOM + 3D
```

Unseen：

重点对齐：

```text
world navigation
drag interaction
```

---

# 38. 不要做"自己的理解"

如果不知道怎么画：

先让实现更接近参考图。

不要自行简化成：

```text
SVG circles
contour blobs
diagram
```

---

# 39. 视觉目标允许 70–80% 接近参考质感

不是逐像素复制。

但至少：

```text
depth
material
composition
visual density
world scale
```

必须明显达到同一类产品级别。

---

# 40. Brand Assets 禁止复制

不要复制：

```text
San Rita logo
San Rita text
EQT branding
Unseen assets
```

只参考：

```text
art direction
composition
rendering quality
interaction style
```

---

# 41. Prototype Artifacts

创建：

```text
docs/design-audit/task15-2/
```

---

# 42. Reference Board

保存：

```text
01-reference-board.md
```

内容必须列：

```text
reference
URL
specific screenshot/section
what to copy structurally
what not to copy
```

---

# 43. 截图

必须：

```text
02-prototype-wide.png
03-prototype-close.png
04-region-hover.png
05-evidence-landmarks.png
06-unknown-region.png
07-suggestion-edge.png
08-alt-lighting.png
```

---

# 44. Wide Screenshot

1440×900。

这是最重要的 Gate。

---

# 45. Close Screenshot

展示：

```text
material
depth
evidence landmark
label
shadow
```

---

# 46. Unknown Screenshot

必须能一眼看出：

> 这个区域尚未解析。

而不是看到一个"虚线圈"。

---

# 47. Motion Recording

保存：

```text
terrain-prototype.webm
```

或：

```text
terrain-prototype.gif
```

约 10–20 秒。

内容：

```text
Pan
Hover
Camera movement
UNKNOWN
```

---

# 48. 如果视频太大

GitHub 可以只提交：

```text
compressed webm
```

不要上传几十 MB。

---

# 49. Visual Gate

第一阶段完成后：

**停止。**

不要集成 Observatory。

---

# 50. 不允许 Agent 自己判断 PASS

最终报告禁止：

```text
效果很好
高保真完成
视觉验收通过
```

---

# 51. Agent 只能说

```text
Visual Prototype Delivered
```

---

# 52. Reviewer Gate

只有 reviewer 看完：

```text
02-prototype-wide.png
03-prototype-close.png
04-region-hover.png
06-unknown-region.png
terrain-prototype.webm
```

明确批准后：

才进入 Phase B。

---

# 53. 如果视觉不够

不要继续做产品功能。

继续修改：

```text
material
camera
composition
lighting
world density
```

直到通过。

---

# 54. 禁止测试数量成为完成证据

本轮只需必要：

```text
lint
typecheck
build
```

如果 prototype 没有复杂状态：

甚至不用增加大量 tests。

---

# 55. Performance

1440×900：

目标：

```text
45–60fps
```

记录：

```text
average FPS
geometry count
draw calls
```

---

# 56. Fallback

WebGL 不支持：

回退 Pearl。

---

# 57. Production 不修改

当前：

```text
/observatory
```

保持。

---

# 58. Route

只部署：

```text
/observatory/lab/landscape-v2
```

或：

```text
/lab/art-direction
```

---

# 59. Git

Push：

```text
prototype code
screenshots
reference board
visual notes
```

---

# 60. STATUS

创建：

```text
TASK15_2_VISUAL_GATE.md
```

记录：

```text
commit
route
visual stack
libraries
fps
draw calls
viewport
artifacts
known gaps
```

---

# 61. 最终报告

只返回：

## Route

## Visual Stack

## Reference Board

## Screenshot Index

## Interaction

## Performance

## Known Gaps

## GitHub Directory

然后：

**停止。**

---

# 62. 最终视觉判断标准

打开截图 3 秒：

如果第一反应是：

> "这是一张图表。"

FAIL。

如果第一反应是：

> "这是几个圈 / 几座小岛。"

FAIL。

如果第一反应是：

> "这是一个真正存在的研究世界。"

继续。

---

# 63. 最终禁止

```text
flat SVG blobs
radial mind map
card constellation
white SaaS cards
AI purple neon
particle starfield
cartoon terrain
game UI
```

---

# 64. Final Principle

不要再设计：

> "几个 Research Dimension 放在哪里。"

而要设计：

> **"一家公司的 Research World 长什么样。"**

先做 World。

UI 后接。
