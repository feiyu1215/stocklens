# REFERENCE_COMPARISON — Company World V2 vs Unseen World

同尺寸人工比较（§31–§33）：1440×900。
本地并排图：`.tmp/reference/comparison-side-by-side.png`（第三方参考不入公开仓）。
比较维度为 composition / scale / density / hierarchy / motion / interaction —— **不比较颜色**。

| 问题（§32） | Reference 观察 | 本实现观察 | 差距 |
|---|---|---|---|
| 世界占屏比例是否接近？ | 100% viewport；无任何页面容器 | 100% viewport；world 层铺满，页面无容器（`01-company-world.png`） | 已接近 |
| chrome 是否同样克制？ | 左上 wordmark + 右上主导航 + ©；约 4 处 | 左上 STOCKLENS + 右上 ticker + 底部 DRAG TO EXPLORE + ⌘K；4 处 | 已接近（本实现另有公司 identity 属 §39 指定） |
| 主要对象数量是否相似？ | 一屏约 7 个媒体对象 + 1 个主导结构 | 一屏 7 个媒体对象（含 1 个 UNKNOWN）+ 1 个主导光场 | 已接近 |
| 是否仍有明显 Card Wall？ | 无卡片；对象是无边框影像 | 无卡片：媒体片无边框、无白色表面、无圆角容器；typography 直接浮在场中 | 已消除（旧版 7 张白卡已不复存在） |
| 视觉主体是否足够大？ | 主导结构（线框体）高约占屏 70%，对象大者约屏宽 25–30% | 主导光场为整屏氛围；最大媒体片约屏宽 32%（470 世界单位 × fit 缩放） | 对象尺度接近；**主导结构的存在感弱于参考**（参考是一个可辨识的实体结构，本实现是大气光场 + 光片） |
| Drag 是否感觉在移动一个 World？ | 拖拽时整个空间（结构 + 对象）同步位移，有惯性 | 媒体场、媒体对象、typography 处于同一世界层，同步位移；FigJam 物理（pan 生效，见 02 截图前状态） | 已接近；本实现暂未加惯性 |

## 结构性差异（如实记录，供 reviewer 判断）

1. **主导视觉体（dominant subject）**：参考有一个可辨识的、占据画面中心的结构体（线框球体）；
   本实现按 §8 不使用任何具象形状（山/岛/星球/blob/圆环/terrain 全部禁用），
   改用「光片 + 透视网格 + 体积光」的建筑空间场。结果：空间深度成立，但**结构辨识度低于参考**。
2. **文字量与视觉量之比**：参考的对象不带可见文字标签；本实现按 §5/§12/§39 显示
   Dimension 名称与 48–72px 公司 identity，因此文字权重高于参考。
   这是被明确要求的 StockLens 层（Dimension label + company identity），不是偏差。
3. **对象亮度**：参考对象是明亮、高饱和的摄影内容；本实现受 §50「无黄色/棕色主色」与
   §10「素材不得驱动金融判断」约束，媒体片为冷调暗场图像，整体亮度低于参考。
4. **hover 响应**（§14）：参考为对象交互态；本实现 hover 同时改变 typography 层级、
   reveal 证据 marks、压低其余对象、并让世界光斑跟随（见 `02-dimension-hover.png`）。
   参考中无同构对比项，按规格要求实现。
