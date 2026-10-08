# StockLens｜个股证据诊断 — 提交说明

**Web URL**
https://stocklens-blush.vercel.app/　（首页：搜索任意 A 股公司 / 打开示例画布 / 研究库 / 双公司对比；研究库与对比页底部输入条随时可问，进入研究空间自动更新数据、顶栏可手动更新）
https://stocklens-blush.vercel.app/lab/ai-workspace-v1?stockCode=000333.SZ　（直接秒开录制好的示例研究空间，**切换公司 / AI 追问 / 新增角度都是实时调用**）
https://stocklens-blush.vercel.app/lab/ai-workspace-v1?stockCode=000333.SZ&live=1　（完整实时链路：首屏真实取数 + 两次模型调用，约 15–30 秒，带数据新鲜度标记）

**国内直连备用地址**（中国大陆普通网络无需代理即可打开，产品与 Vercel 版完全相同；若 Vercel 打不开请用这条）
https://stocklens-322840-10-1499757453.sh.run.tcloudbase.com/　（首页）
https://stocklens-322840-10-1499757453.sh.run.tcloudbase.com/lab/ai-workspace-v1?stockCode=000333.SZ　（示例研究空间）

**源代码仓库**
https://github.com/feiyu1215/stocklens

**生产部署对应的代码版本**
`ea10e99`（Vercel 生产别名已指向该构建；其后仅有文档与打包脚本提交。）

**交付物版本**
`76cea28` 为 Task 17.1 的文档同步提交；本交付物集合在此基础上完成最终文档复核，最终提交见仓库 HEAD（`git log --oneline -1`）。完整历史见 `git log`。

**建议环境**
桌面浏览器，视口宽度 1280×800 或更大（1440×900 为设计基准）。
本产品是 **desktop-first 的空间化研究界面**：窄屏（如 390×844 手机宽度）不在预期的空间交互环境内——页面不会空白或横向溢出，但画布维度需要桌面宽度才便于操作。

---

## 交付物入口

| 内容 | 文件 |
|---|---|
| 产品说明 / 启动 / 环境变量 / 已知边界 | [README.md](README.md) |
| AI 使用与验证记录（必交） | [docs/final/AI使用与验证记录.md](docs/final/AI使用与验证记录.md) |
| 测试说明（必交） | [docs/final/测试说明.md](docs/final/测试说明.md) |
| 需求对照（逐条对原始题目） | [docs/final/需求对照.md](docs/final/需求对照.md) |
| 架构 | [docs/final/架构说明.md](docs/final/架构说明.md) |
| 产品走查（六张最终截图） | [docs/final/产品走查.md](docs/final/产品走查.md) |
| 已知边界 | [docs/final/已知边界.md](docs/final/已知边界.md) |
| 演示脚本（录制用） | [docs/final/演示脚本.md](docs/final/演示脚本.md) |
| 提交包清单 | [docs/final/提交包清单.md](docs/final/提交包清单.md) |

## 演示视频

**未随包提供。** 本次提交环境无法产出稳定且合规的 MP4（环境内没有视频编码器，应用内浏览器录制在长流程下不稳定）。按"宁可如实缺失、不交付占位物"的原则，改为提供：

- [docs/final/产品走查.md](docs/final/产品走查.md) — 六张最终截图 + 每步的操作与意义
- [docs/final/演示脚本.md](docs/final/演示脚本.md) — 80–100 秒的录制脚本（含分镜、字幕与剪辑说明），可在任意具备录屏能力的环境按脚本一次录成

## 30 秒了解这个产品

1. 打开上面的 URL，默认研究标的为美的集团（000333.SZ）。
2. 首屏是研究画布：6 个维度由 AI 依据公司类型与问题生成，不是固定模板。
3. 点击任意维度 → Focus Aperture：一句话摘要 + 至多 3 条证据数值 + `Explore research`。
4. 进入 Reading：每条 claim 都可以沿 ①②③ 锚点回到证据的指标、期次、单位与计算口径。
5. 底部 AI Research Lens 可以在任意 scope 追问；答案只引用已存在的证据，并明确区分"可以确认"与"暂时不能确认"。
6. 顶部可收藏公司、切换公司——不同公司类型得到不同的研究结构（制造业 vs 银行）。

**数据时效**：行情、估值与事件核查类证据带新鲜度标记（`fresh` / `stale` / `unknown`，阈值 7 个自然日）。过期数据**不会**静默支撑"当前状态"结论——结论里会强制声明"当前状态无法由该数据确认"，该标记也会一起进入 AI 上下文。财务报告期数据（如 2026-Q2）不按自然日判定时效。

**它不会做的事**：不给评分，不给买卖建议，不预测涨跌；证据不足时直接返回 UNKNOWN。
