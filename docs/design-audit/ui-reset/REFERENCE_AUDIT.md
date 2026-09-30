# REFERENCE_AUDIT — UI RESET（Task 15.2）

> 依据 `00-TASK15_2_UI_RESET_SPEC.md` §5/§19：所有 PRIMARY 参考于 2026-10-01 在真实浏览器逐个打开并操作
> （截图存 `.tools/ref-*.png`，本审计完成后随仓库提交）。逐参考回答 §19 的 10 问。
> 结论先行：**主参考 = Cosmos**；Oryzo（构图）与 OceanX（转场手感）在次要层面吸收；Unseen 判定不适合做主参考（理由见 §A.11）。

---

## A. Cosmos — www.cosmos.so（主参考）

一手操作：首页对象散布场（两次访问，对象位置随时间漂移）、底部巨型 wordmark、explore 需登录（营销页为准）。

1. **Above the fold 第一视觉主体**：满屏 #F5F7FA 冷白 field 上几十个**非等大、随手散布、缓慢漂移**的媒体对象（图卡/手机截图/纹理），中央只有一行小字 + 超大标题「Your space for inspiration」+ 两个按钮；底部一个巨型 COSMOS wordmark 压场。
2. **一屏真正的大视觉对象数**：散布对象约 30–40 个，但「大」的对象 4–6 个（其余小、虚化、贴边）；中央大标题算 1 个文字主体。
3. **Media : Text 面积比**：≈ 8 : 2（对象层几乎全是 media；文字只有标题区与极简导航）。
4. **传统 Card Grid？** 无。对象旋转、错位、远近不一，完全没有等宽栅格。
5. **最重 Typography**：标题 ~72–88px（居中两行）；底部 wordmark 占满屏宽（≈300px 级）。
6. **Hover**：对象轻微上浮/放大，光标变化；无边框发光。
7. **Drag**：整场平移（对象层随视口拖动漂移），对象本身可拖入收藏流（登录后）。
8. **Click**：对象 → 内容 detail（登录后；营销页对象不可点）——"对象即内容入口"。
9. **状态切换**：滚动进入下一段叙事（wordmark 层/注册层），媒体场持续存在，状态由滚动与层级切换表达，无页面刷新感。
10. **StockLens 借**：冷白 field 全屏即工作区；Dimension = 散布的非等大 research object（top claim 排版封面块，文本即媒体）；对象点击 → Peek → Reading 的入口语义；超大标题 + 极简 chrome；对象随手散布的「自然分布」感。

---

## B. Unseen — unseen.co/world 与 /projects

一手操作：World 预载页（N logo → 眨眼动画 → Enter）→ 进入暗场空间，grab 光标拖拽漫游，成功拖动视角看到线框球与散布的照片/视频对象；Projects 进入后为浅色编辑列表；点击项目卡进入 detail 页（意外获得一手样本）。

1. **第一视觉主体**：World = 暗黑虚空 + 线框球 + 散布媒体碎片；Projects = 居中超大标题「Selected Projects」+ 两列大媒体卡。
2. **大对象数**：World 视野内 4–7 个媒体碎片；Projects 一屏 4 张大卡。
3. **Media : Text**：World ≈ 7:3；Projects ≈ 8:2。
4. **Card Grid？** Projects 是两列大卡（大而非均等小卡）；World 完全无栅格。
5. **最重 Typography**：Projects 标题 ~72px；detail 页 serif/sans 混排大字（PROJECTS/ DALA.AI + BRAND ECOSYSTEM）。
6. **Hover**：World 对象抓取态（光标变 grab 手）；Projects 卡标题下划线。
7. **Drag**：**核心交互**——拖 = 相机漫游，整个空间随拖移动，惯性平滑。
8. **Click**：Projects 卡 → 项目 detail 页（深色编辑排版 + SERVICES/DATE/CLIENT/LOCATION 元数据栏 + View project ↘）。
9. **状态切换**：World→Projects 通过导航淡入淡出；detail 为独立编辑页。
10. **StockLens 借**：detail 页的元数据栏排版 → Reading header；「拖 = 导航」的手感参数（缓动/grab 光标）。
   **为什么不选它做主参考**：World 的碎片是氛围对象——点不开内容、没有深读层，交互目的是「逛」。StockLens 的对象是研究入口（每 Dimension 背后是证据长文），核心动作链是「散布 → 聚焦 → **读**」。拿它当主参考会把产品做成氛围漫游 demo（§88 明确反对）。它的拖拽漫游只适合 My World 穿行。

---

## C. OceanX — 2025.oceanx.org

一手操作：首页（地球满幅 + ENTER EXPERIENCE）→ 进入 Chapter 01（满幅海面摄影 + 船只主体 + 右下章节标题）→ 按官方提示「SCROLL OR DRAG SIDEWAYS」横向拖拽，实测一次拖动从 Chapter 01 推进到 Chapter 03：**同一媒体世界换景（船重新构图）+ 章节文案换位（右下 → 中左）**。

1. **第一视觉主体**：满幅摄影/视频（海洋）本身。
2. **大对象数**：1 个媒体主体 + 1 组章节文字。
3. **Media : Text**：≈ 9 : 1。
4. **Card Grid？** 无。
5. **最重 Typography**：章节大标题 ~64–80px（白色，直接压在摄影上）。
6. **Hover**：按钮/链接微反馈。
7. **Drag**：横推 = 章节推进（媒体 crossfade + 文字换位）。
8. **Click**：LEARN MORE → 章节内容。
9. **状态切换**：章节推进通过**同一世界的镜头/媒体变化**表达，绝不换页。
10. **StockLens 借**：My World 公司切换手感（横拖换公司、媒体换景）与 World→Reading 转场的气质；文字压媒体 + 极简 mono 提示（SCROLL OR DRAG SIDEWAYS → DRAG TO EXPLORE）。

---

## D. Lusion — lusion.co

一手操作：首屏（三行大字 + 满幅 3D 十字块群 + SCROLL TO EXPLORE）。

1. **第一视觉主体**：满幅渲染的主体群（占屏 ~80%）。
2. **大对象数**：1 个主体场（内含几十个物体，作为一整块视觉）。
3. **Media : Text**：≈ 7:3（三行大字 + 顶部 chrome）。
4. **Card Grid？** 无。
5. **最重 Typography**：顶部宣言 ~40–48px（三行）；标题 LUSION ~36px。
6. **Hover**：chrome 按钮/链接微动。
7. **Drag**：主体随鼠标视差/滚动推进。
8. **Click**：导航进入项目页。
9. **状态切换**：滚动 = 叙事推进。
10. **StockLens 借**：**visual confidence**——大字三行的宣言排版（Company 标题区）、不怕留白、chrome 少到只有 3 个元素。

---

## E. Oryzo — oryzo.ai

一手操作：加载后为暗棕 editorial 场景：中央一张**杂志拼贴卡**（大图 + serif 巨字混排 + №6 圆形章），左右各一张邻卡只露 20–30% 边缘，底部 SCROLL TO CONTINUE。

1. **第一视觉主体**：中央拼贴卡（媒体+排版混合体）。
2. **大对象数**：1 张主卡 + 2 张露边邻卡。
3. **Media : Text**：≈ 6:4（卡内排版本身就是内容）。
4. **Card Grid？** 无（拼贴 + 露边横移）。
5. **最重 Typography**：卡内 serif 巨字 ~90px（被裁切）+ 左侧标题 ~36px。
6. **Hover**：滚动推进卡组。
7. **Drag/Scroll**：横移卡组，邻卡滑入。
8. **Click**：进入下一屏叙事。
9. **状态切换**：滚动 = 卡组横移 + 场景文案轮换。
10. **StockLens 借**：**My World 的构图**——每家公司 = 一张拼贴 scene（visual + name + ticker + industry + status），横移时邻公司露边；№ 圆形章 → 公司序号章。**只借构图，不借暖棕色调**（§21 违规，弃其色）。

---

## F. Active Theory — v4.activetheory.net

一手操作：项目索引页（暗色、媒体瓦片流）。

1–3. 暗场沉浸媒体索引；瓦片即入口；media:text ≈ 9:1。
4. 有松散瓦片流（非严格栅格）。
5. 标题 ~48px。
6–9. Hover 瓦片放大；Click 进入 case；状态以页面过渡表达。
10. **StockLens 借**：瓦片「即入口」的干脆（点对象必有去处）；沉浸与信息层的切换。次要吸收。

---

## 交互参考速记（§11–§18）

| 参考 | 一手结论 | StockLens 落点 |
|---|---|---|
| Bruno Simon | 统一动作语言统治全站 | Explore / Focus / Inspect 三动词贯穿所有对象与命令 |
| Krea Realtime Edit | 动作直接改变结果，无 submit/confirm | 拖对象/聚焦/加入建议 → 状态立即变 |
| FigJam pan/zoom | pan/zoom/fit/recenter 是基础操作 | 沿用既有 camera 数学，Trackpad/键盘不丢 |
| Milanote | 空间排列本身承载语义 | Dimension 拖动 + Focus Set + Pinned notes；但不做自由白板 |
| Linear/Arc | 上下文命令；Command Bar 是 workspace controller | Command Lens 按 level 出上下文动作（既有 experience 层直接复用） |
| Rive state machine | state + input → transition，motion 必须有状态原因 | 所有动效由 EditorialState 驱动，无装饰动画 |
| Insilico | 复杂能力组织成统一产品世界 | Company → Dimension → Claim → Evidence 一套世界 |

---

## 设计决定（依据本审计）

1. **主参考 = Cosmos**：冷白 field + 非等大对象散布 + 对象即入口——与「研究工作台」物种相同，色板天然合规（§22）。
2. **Unseen 不做主参考**（氛围漫游 ≠ 证据精读）；其 Projects detail 元数据栏 → Reading header。
3. **OceanX** 横推换景手感 → My World 切换 + Reading 转场。
4. **Oryzo** 拼贴 + 邻卡露边 → My World 构图（弃其暖棕色）。
5. 色彩一律从 Cosmos 冷白系出发：#F5F7FA / #101318 / #69707D / rgba(255,255,255,0.72) / #2962FF（§22–§23）。
