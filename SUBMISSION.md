# StockLens｜个股证据诊断 — 提交说明

**Web URL**
https://stocklens-blush.vercel.app/observatory-v5

**源代码仓库**
https://github.com/feiyu1215/stocklens

**生产部署对应的代码版本**
`db618d4`（Vercel 生产别名已指向该构建；其后仅有文档与打包脚本提交。）

**最终提交（包含全部交付物）**
`a4692c8` — README、SUBMISSION、docs/final 全部文档、六张最终截图、以及重新生成的提交包。完整历史见仓库 `git log`。

**建议环境**
桌面浏览器，视口宽度 1280×800 或更大（1440×900 为设计基准）。
本产品是 **desktop-first 的空间化研究界面**：窄屏（如 390×844 手机宽度）不在预期的空间交互环境内——页面不会空白或横向溢出，但画布维度需要桌面宽度才便于操作。

---

## 交付物入口

| 内容 | 文件 |
|---|---|
| 产品说明 / 启动 / 环境变量 / 已知边界 | [README.md](README.md) |
| AI 使用与验证记录（必交） | [docs/final/AI_USAGE_AND_VALIDATION.md](docs/final/AI_USAGE_AND_VALIDATION.md) |
| 测试说明（必交） | [docs/final/TEST_REPORT.md](docs/final/TEST_REPORT.md) |
| 需求对照（逐条对原始题目） | [docs/final/REQUIREMENT_MATRIX.md](docs/final/REQUIREMENT_MATRIX.md) |
| 架构 | [docs/final/ARCHITECTURE.md](docs/final/ARCHITECTURE.md) |
| 产品走查（六张最终截图） | [docs/final/PRODUCT_WALKTHROUGH.md](docs/final/PRODUCT_WALKTHROUGH.md) |
| 已知边界 | [docs/final/KNOWN_LIMITATIONS.md](docs/final/KNOWN_LIMITATIONS.md) |
| 演示脚本（录制用） | [docs/final/DEMO_SCRIPT.md](docs/final/DEMO_SCRIPT.md) |
| 提交包清单 | [docs/final/PACKAGE_MANIFEST.md](docs/final/PACKAGE_MANIFEST.md) |

## 演示视频

**未随包提供。** 本次提交环境无法产出稳定且合规的 MP4（环境内没有视频编码器，应用内浏览器录制在长流程下不稳定）。按"宁可如实缺失、不交付占位物"的原则，改为提供：

- [docs/final/PRODUCT_WALKTHROUGH.md](docs/final/PRODUCT_WALKTHROUGH.md) — 六张最终截图 + 每步的操作与意义
- [docs/final/DEMO_SCRIPT.md](docs/final/DEMO_SCRIPT.md) — 80–100 秒的录制脚本（含分镜、字幕与剪辑说明），可在任意具备录屏能力的环境按脚本一次录成

## 30 秒了解这个产品

1. 打开上面的 URL，默认研究标的为美的集团（000333.SZ）。
2. 首屏是研究画布：6 个维度由 AI 依据公司类型与问题生成，不是固定模板。
3. 点击任意维度 → Focus Aperture：一句话摘要 + 至多 3 条证据数值 + `Explore research`。
4. 进入 Reading：每条 claim 都可以沿 ①②③ 锚点回到证据的指标、期次、单位与计算口径。
5. 底部 AI Research Lens 可以在任意 scope 追问；答案只引用已存在的证据，并明确区分"可以确认"与"暂时不能确认"。
6. 顶部可收藏公司、切换公司——不同公司类型得到不同的研究结构（制造业 vs 银行）。

**它不会做的事**：不给评分，不给买卖建议，不预测涨跌；证据不足时直接返回 UNKNOWN。
