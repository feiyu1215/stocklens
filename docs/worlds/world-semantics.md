# World Semantics（Task 14 §73）

所有 World Renderer 的视觉映射**允许表达**与**禁止暗示**的清单。
目的：防止后续设计漂移，杜绝"研究对象偷偷变成股票评级"。

## 允许的映射（只表达研究状态）

| 视觉 | 含义 | 数据来源 |
|---|---|---|
| 亮度 / 对比度 | 当前焦点（active company / focused dimension） | interaction state |
| 尺寸（0.9–1.1x，极窄区间） | 探索深度（exploredDimensionCount / evidence count） | 研究行为 |
| 等高线密度 / 细节 | 研究完成度（terrain richness） | evidence count |
| Fog / 未闭合轮廓 | **证据不足**（UNKNOWN dimension） | dimension.status |
| 分裂 / 交叉线 | CONFLICT 证据 | evidence.signal |
| Pin / bookmark landmark | 用户收藏（Saved） | 用户行为 |
| 距离 | 最近研究时间 / 稳定排序 | lastVisitedAt |

## 禁止的映射

| 禁止 | 原因 |
|---|---|
| brightness = stock quality | 亮度只表示焦点 |
| size = recommendation | 尺寸只映射探索深度，区间 0.9–1.1x |
| color green/red = good/bad stock | 颜色只表示信息性质（FACT/INFERENCE/UNKNOWN/CONFLICT） |
| territory shape = company type | 形状由 stable id 程序生成，语义中性 |
| detail density = fundamentals quality | 细节密度只反映"研究过多少" |
| glow / crown = superiority | 不允许荣誉性视觉 |
| 任何评分、排名、评级类视觉 | 产品禁止 rating |

## 关键禁令（可被代码/测试扫描）

```text
brightness != stock quality
size != recommendation
color != good/bad stock
detail density != fundamentals quality
```

## 关键断言

```text
fog            = insufficient evidence（不是坏消息）
region size    = research depth（不是公司规模/好坏）
focus contrast = 当前注意力（不是推荐）
saved pin      = 用户收藏（不是优质标记）
```

新增任何视觉映射前必须先在此登记：表达什么研究状态、数据来自哪个字段、禁止被读成什么。
