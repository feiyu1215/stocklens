# Task 15｜Semantic Zoom & State-Driven Experience

> 本文记录 Task 15 的实现口径、可复现验收与边界。
> 上游：`docs/observatory-visual-spec.md`（V1.0 Screen-by-Screen）、`docs/observatory-architecture.md`。
> 代码：`src/lib/experience/*`（语义层）、`src/components/observatory/*`（表达层）。

## 1. 一句话

Observatory 从此只有**一套语义层级**：`world → company → dimension → claim → evidence`。
层级只由显式意图改变（点击 / Enter / Explore / back / 命令），camera 缩放**只改变信息密度**，
不再改变语义——这正是"语义 zoom"与"图形 zoom"的分界。

## 2. Experience Model（单一状态源）

| 文件 | 职责 |
|---|---|
| `src/lib/experience/state.ts` | ExperienceState、中心 transition table、breadcrumb 段、局部降级判定、视觉状态机、动效时长 |
| `src/lib/experience/detail.ts` | 对象信息密度（micro / compact / expanded）、Evidence Field 预算、上下文命令表 |
| `src/lib/experience/copy.ts` | 主 UI 文案单一来源 + 违禁失败语言扫描（`FORBIDDEN_UI_PHRASES`） |
| `src/lib/world/payload-guard.ts` | 研究空间载荷守卫：结构不完整不得进入 World（不崩页面、不静默空空间） |

`ObservatoryApp` 是**唯一**持有 `ExperienceState` 的组件（`tests/experience.test.ts` 用源码扫描强制，
防止"每个组件自己决定 transition"）。层级与场景（DISCOVERY / ASSEMBLING / SPACE_OVERVIEW /
DIMENSION_FOCUS）解耦：scene 负责画什么，level 负责"我在哪里"。

### Transition table（节选，完整见代码）

| 当前层 | 允许事件 |
|---|---|
| world | select_company |
| company | open_dimension / open_research / select_company / zoom_out / back / reset |
| dimension | open_research / select_evidence / clear_claim / clear_evidence / back / reset |
| claim | select_claim / select_evidence / clear_claim / clear_evidence / back / reset |
| evidence | clear_evidence / select_claim / back / reset |

非法转换**静默忽略**（不抛错）：滚轮、误触、拖拽都不可能把用户"甩"到另一层（§84）。

## 3. 信息密度（不是层级）

`getObjectDetailLevel({ cameraScale, hovered, selected })`：

| detail | 触发 | 呈现 |
|---|---|---|
| micro | scale < 0.8 | 仅对象名 + 轮廓，透明底、无阴影 |
| compact | 常规 | 名称 + 状态刻度 + evidence/conflict 计数 |
| expanded | scale ≥ 1.15 且 hover / selected | 名称 + summary + top claims（真正的阅读内容） |

配套：`evidenceNodeBudget(scale)` 12（远）/ 16（近）；`shouldShowEvidenceLabels(scale)` 近处才连线与标签。
**同一层级下缩放只增减信息，不触发跳转**——实测：camera 1.00 → 1.24 期间
`semanticLevel` 恒为 `company`，只有 `data-detail-level` 从 compact 变为 expanded。

## 4. 空间连续性（不产生"换页"）

| 连续 | 实现 | 证据 |
|---|---|---|
| My World → Company World | 记录 source object 的屏幕坐标，光晕从该对象向外扩张、其余对象收拢变暗，company 标签在原位抬起；**数据并行解析**，morph 结束（760ms）才切层 | `20a-company-morph.png` |
| Dimension → Peek | 点击对象 = 在对象旁展开研究摘要（不是 modal）；peek 打开时对象回到 compact，避免同一段内容出现两次 | `21b-dimension-peek.png` |
| Peek → Research Surface | "Explore region →" 触发 `open_research`，研究面在该 region 的语义位置展开 | `22-claim-reading-transition.png` |
| Claim → Evidence | 锚点点击 = `select_evidence`；进入 evidence 层后其他 claim 变 dimmed mirror，**claim 上下文常驻**（Rail 顶部 CLAIM CONTEXT），并提供 "← Return to claim" | `23-evidence-level.png` |
| Loading | 只显示 `Resolving research regions…` + 未解析轮廓，**不伪造流水线**（§52–§54） | — |

## 5. 降级本地化（§1–§4 / §49–§51）

- 页面级失败视觉被移除：AI 解释不可用时只在**该维度对象**上写 `AI interpretation unavailable`，
  页面级只有一行弱文案 `AI interpretation is temporarily unavailable.`；
- 页面级错误只在**真的无法建立 World**时出现（`shouldShowGlobalError`：公司未解析 / Truth Layer 无证据）；
- 载荷残缺（缺 dimensions / claims / evidence 或类型错误）走同一出口，**不崩溃**（真实案例：把
  `?fixture=unknown-dimension` 这个"新增维度结果"误当作研究空间，守卫拦下并回到可用的世界层）；
- 主 UI 违禁失败语言（`could not be completed` / `failed` / `错误` / `失败`）由测试扫描强制清除。

实测降级样本：`?fixture=one-other-industry`（真实抓取的"AI 失败但证据完整"载荷）——
6 个维度全部显示局部降级，证据节点照常可见（Truth Layer 不受 AI 影响），零页面级 banner。

## 6. 组件 / Card 审计（Before = Task 14 提交，After = Task 15）

| 指标 | Before | After | Δ |
|---|---|---|---|
| `rounded-lg/xl/2xl` 卡片容器 | 28 | 24 | **−4** |
| `border` 框线 | 41 | 42 | +1（均为"排版规则线"：Rail 的 claim 上下文线、INTERPRETATION CAUTION 左线、UNKNOWN 左线，非卡片边框） |
| `boxShadow` | 1 | 2 | +1（expanded 对象的聚合面） |

具体减法：
- dimension 对象 idle 不再有边框 + 底色 + 圆角盒子，只有状态刻度 + 文本（hover/selected/expanded 才聚合成"面"）；
- Evidence Rail 的指标块 → tabular-nums 排版 + 细规则线；INTERPRETATION CAUTION → 左线，不再是警告盒子；
- UNKNOWN 研究面 → 左侧虚线规则，不再是 amber 卡片；
- 页面级失败提示 → 顶部细线排版块，不是卡片。

计数脚本（可复现）：

```bash
git show HEAD:src/components/observatory/<file>.tsx | grep -c 'rounded-\(lg\|xl\|2xl\|3xl\)'
```

## 7. 验收（浏览器实测，1440×900）

| 流程 | 内容 | 结果 |
|---|---|---|
| A | My World → Enter research → morph → Company World | PASS：`semanticLevel: company`，6 个维度对象，面包屑「美的集团」 |
| B | 点击维度 → Peek → Explore region | PASS：`semanticLevel: claim`，Rail 出现，Claim Spine 5 条 |
| C | 点击 claim → 点击锚点 ① | PASS：`semanticLevel: evidence`，claim 上下文条 + Return to claim，其余 claim dimmed |
| D | Return to claim → Back to space → 面包屑回公司 | PASS：claim → dimension（面包屑「美的集团/增长韧性」）→ company（6 维度回到空间） |
| E | 缩放不改变层级 | PASS：scale 1.00 → 1.24，level 恒为 company，仅 detail 从 compact → expanded |
| F | UNKNOWN 研究方向（新增「海外业务收入结构」） | PASS：0 verified / 1 unknown / 待验证 + `Current evidence is incomplete.` + 4 项 missing，amber 不是红色 |
| G | `?experienceDebug=1` | PASS：semanticLevel / company / dimension / claim / evidence / renderer / camera / objectDetail / transitionSource |

截图（`docs/screenshots/t15/`）：
`19-my-world-semantic` `19b-my-world-label` `20-company-semantic` `20a-company-morph`
`21-dimension-expanded` `21b-dimension-peek` `22-claim-reading-transition`
`23-evidence-level` `23a-evidence-rail-claim-context` `24-unknown-semantic` `25-degraded-localized`。

## 8. 边界与不做的事

- 移动端（< 1024px）仍用 Dimension Strip，不复制空间语义；`?experienceDebug=1` 属开发/评审工具，不进主流程；
- Wheel 缩放**故意**不能改变层级：想进下一层必须显式 Explore（避免误触导航，也避免"看起来能进去但其实没进去"）；
- Peek 的锚点位置仍是确定性偏移（对象邻近），未做碰撞避让；对象极密时可能与邻近对象重叠；
- 语义事实一致性（模型绑定合法 ID 但文字与证据矛盾）无自动校验——沿用既有边界，见 `docs/test-notes.md`；
- 新增章节不改变任何 API 契约、Truth Layer 或 AI 输入输出：Task 15 是纯表达层重构（后端零改动）。
