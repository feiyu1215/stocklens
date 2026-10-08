# 评审者冷启动走查 + 入口收敛（2026-10-09）

方法：Playwright + Chromium 真实浏览器，`localStorage.clear()` + `indexedDB.deleteDatabase("stocklens")` 模拟**首次到访的评审者**，对 `localhost:3100`（与 git HEAD 一致）实测。探针：`.tmp/coldstart-reviewer-path.cjs`、`.tmp/coldstart-sample-idb.cjs`。

## 一、冷启动实测结果

| 步骤 | 结果 |
| --- | --- |
| 打开 `/`（首页） | ✅ 品牌标→首页、▦→研究库、「打开示例画布 →」、搜索框、三个建议问题、底部助手条（「问问 StockLens：导航、概念、对比、研究…」）全部在 |
| 点「打开示例画布」 | ✅ **秒开**（`?fixture=midea-artdirection` 录制样本，琥珀徽标 `data-recorded-sample`，8 锚点），**且自动把美的存入本机**：IndexedDB 出现 `stocklens.research.000333.SZ` + `stocklens.canvas.000333.SZ` + `stocklens.shelf.recent` |
| 研究库 `/research` | ⚠️ **冷启动为空**（0 行）——看完示例画布后才有美的一条 |
| 对比页冷启动直开 | ⚠️ **诚实空态**：明示「研究数据不在本机（可能已被清理）」、缺失以「—」展示不当作 0、给「重新研究 ×2」按钮。看完示例后有 1 家，**还差第二家**（每家实时 15–30 秒） |
| 底部助手条 | ✅ 首页/对比页都在（研究空间内为 Sidekick，未动） |

**结论**：评审者冷启动路径整体走得通，"秒开"属性不依赖旧入口（首页一键直达示例画布）；唯一的体验断点是**对比页需要本机攒够两家公司**——这已用 README「评审建议」里的顺序说明兜住，不改产品行为。

## 二、入口收敛（本轮执行）

**问题**：README / SUBMISSION 全部入口（含给国内用户的推荐地址）仍指向 `/observatory-v5`（无首页叙事、无研究库、无对比、无底部助手），四轮新功能对外部评审者不可见。

**改动（仅文档，路由未动，`/observatory-v5` 原样保留兼容）**：

| 文件 | 改动 |
| --- | --- |
| `README.md` | 两处线上地址改指向 `/`；「两种打开方式」表改用 `/lab/ai-workspace-v1?stockCode=000333.SZ`（秒开样本）与 `?live=1`；Run Locally 注释改 `localhost:3000/`；仓库结构表补 `page.tsx`（首页）、`research/`（研究库/对比），v5 标注「旧版画布入口（保留兼容）」；评审建议改为「首页 → 示例画布 → 双公司对比 → live 链路」顺序，并写明对比数据来自本机 |
| `SUBMISSION.md` | Web URL 区块改指向 `/`（首页）+ 直开示例画布 + live 链路，国内直连同步 |
| `docs/PROJECT_GUIDE.md` | 目录地图（page.tsx/research/v5 兼容）、`npm run dev` 注释、Vercel 与 CloudBase 生产地址 5 处改 `/` |

**有意不改**：`docs/final/需求对照.md`、`测试说明.md`、`演示脚本.md`、`提交包清单.md` 中指向 `/observatory-v5` 的记载——它们绑定各自实测/打包时的部署版本，属历史记录；将在演示脚本重写 + 全景走查（下一轮）随新版本一起刷新。README 的 `localhost:3000` 也不是漂移：3100 只是本机占用现状，新 clone 默认 3000。

## 三、遗留与下一轮

1. **60 条意图标注集**（用户已定：因面试叙事价值提前）——产出准确率报告进 `docs/final/`。
2. **演示脚本重写 + 全景走查**——在入口已收敛的前提下写，覆盖对比页全流程、助手意图、摘要成功/降级、全局导航 5 面 × 2 端；`docs/final/` 四份历史文档届时一并刷新。
3. **CloudBase v6 国内包**——当前线上国内包缺 P1 合规修复/P2 摘要/导航修复，打包脚本重打后由用户手动上传。
4. 已知未修（见交接文档 §七）：P2 摘要方向性陈述无机器校验等，维持记录。
