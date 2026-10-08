# StockLens 项目指南（内容 · 源码 · 部署）

> 面向"要在这个项目的代码上继续做事的人"——无论在本机还是别的机器。
> 产品介绍与评审入口看 [README](../README.md) 与 [SUBMISSION](../SUBMISSION.md)；本文只讲：项目是什么、代码在哪、怎么改、怎么部署。

## 1. 项目是什么

**StockLens｜个股证据诊断**：把一个 A 股公司的当前状态组织成一张可探索的研究画布。AI 依据公司类型与研究问题动态生成诊断维度，确定性代码负责所有金融数字，模型只负责解释已经存在的证据，每条结论都能点回原始字段、期次、口径与来源。不评分、不给买卖建议、不做涨跌预测；证据不足时显式返回 UNKNOWN。

- **检索范围**：仅 A 股（沪深北三所）。港股/美股不在数据源索引内（如"小米"）
- **数据源**：扶摇金融数据 API（唯一事实来源）+ DeepSeek（仅三处模型调用）；端点使用与边界实测见 [FUYAO_CAPABILITY_AUDIT.md](design-audit/FUYAO_CAPABILITY_AUDIT.md)
- **技术栈**：Next.js 16（App Router）+ React 19 + TypeScript + Tailwind 4 + Vitest；测试 409 个 / 30 文件

## 2. 源代码

| 项 | 值 |
|---|---|
| GitHub 仓库 | <https://github.com/feiyu1215/stocklens>（`main` 分支） |
| 本机工作副本 | `D:\zcode存储\stocklens` |
| 文档主入口 | `README.md` → 评审入口 `SUBMISSION.md` → 过程档案 `docs/design-audit/` |

### 目录地图（改哪里）

| 路径 | 内容 |
|---|---|
| `src/app/page.tsx` | 产品主入口（首页 `/`） |
| `src/app/research/` | 研究库 `/research` 与双公司对比 `/research/compare` |
| `src/app/observatory-v5/` | 旧版画布入口（保留兼容，功能不含 Sidekick；另有 v3/v4 历史版本） |
| `src/app/lab/ai-workspace-v1/` | AI Research Sidekick 隔离实验入口；设计判断与实测记录见 `docs/design-audit/ai-workspace-v1/DECISION.md` |
| `src/app/api/` | 9 个后端路由：`research/init`、`research/dimension`、`followup`、`stocks/search`、`diagnosis` 等（**语义冻结**） |
| `src/components/v5/ResearchCanvas.tsx` | 主编排：研究会话、画布状态、AI Research Thread 与 composer；锚点渲染、证据轨迹和移动端列表分别拆到 `CanvasAnchorLayer.tsx`、`CanvasEvidenceTrace.tsx`、`MobileResearchList.tsx` |
| `src/components/v5/ResearchSidekickPanel.tsx` | Lab 用画布原生 AI 工作区：上下文标签、结构化回答、证据回跳、研究角度预览/确认和移动端全屏布局 |
| `src/lib/ai/` | 三个 AI 角色：`planner.ts`（维度规划）、`synthesizer.ts`(研究空间综合)、`followup.ts`（追问）；`prompts/` 是各自的系统提示词（**改提示词必须同步 bump `*_PROMPT_VERSION`**，且 `tests/ai/orchestrator.test.ts`、`tests/ai/planner.test.ts` 里钉了版本断言） |
| `src/lib/data/fuyao.ts` | 扶摇 API 接入层（鉴权 `X-api-key`，base `https://fuyao.aicubes.cn`） |
| `src/lib/research/`、`src/lib/evidence/`、`src/lib/metrics/` | 证据链 / 证据类型 / 指标引擎与新鲜度守卫（`metrics/freshness.ts`） |
| `src/lib/validation/diagnosis.ts` | AI 输出的证据校验器（分区类型 / 数量上限 / grounding——**不轻易放宽**） |
| `tests/` | Vitest 全量测试（离线，无需密钥；`tests/fixtures/` 同时是产品默认首屏的数据源，**不能删**） |
| `docs/final/` | 交付文档（需求对照 / 测试说明 / 已知边界 / 产品走查） |
| `docs/design-audit/` | 过程档案：`DOMESTIC_DEPLOY_PLAN.md`（国内部署全程）、`FUYAO_CAPABILITY_AUDIT.md`（扶摇能力审计）、`HANDOFF.md`（会话交接） |

### 在新机器上跑起来（约 10 分钟）

```bash
git clone https://github.com/feiyu1215/stocklens.git
cd stocklens
npm install                # Node ≥ 20.9（仓库 .nvmrc 锁 22）
cp .env.example .env.local # 填入下面 4 个变量（密钥不进仓库，见 §4）
npm run dev                # http://localhost:3000/
```

`.env.local`（全部服务端使用，前端不接触）：

| 变量 | 说明 |
|---|---|
| `FUYAO_API_KEY` | 扶摇金融数据 API 鉴权 |
| `DEEPSEEK_API_KEY` | DeepSeek 模型调用 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 当前 `deepseek-chat`（DeepSeek 侧别名，指向推理型 Flash） |

改完代码的自证四件套（全部过了再提交）：

```bash
npx tsc --noEmit
npx eslint src
npx vitest run        # 409 个测试
npx next build
```

### 本仓库的修改纪律

1. **AI 提示词**在 `src/lib/ai/prompts/`——改内容就 bump 版本号并同步测试断言；三个角色的硬约束（证据纪律/合规红线）与测试依赖的角色标记词（研究规划器/证据综合器/研究追问器）不要动
2. **后端 API 语义冻结**：`src/app/api/` 与 `src/lib/research|evidence` 的行为变更需明确决策
3. **不要把密钥写进任何文件**提交；`.env*` 已在 .gitignore 与 .dockerignore 双重排除
4. push 需要代理（本机网络 GitHub 被污染）：`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`

## 3. 部署信息（双平台互为镜像）

两个线上地址是**同一份代码的两次独立部署**，功能完全一致：

| 平台 | 地址 | 网络 | 用途 |
|---|---|---|---|
| **Vercel**（评审主入口） | <https://stocklens-blush.vercel.app/> | 需代理 / 海外 | 国际访问与提交评审 |
| **腾讯云 CloudBase 云托管** | <https://stocklens-322840-10-1499757453.sh.run.tcloudbase.com/> | **国内直连** | 大陆网络评审 |

### 3.1 CloudBase 云托管（国内镜像）

| 项 | 值 |
|---|---|
| 环境 ID | `stocklens-d3g7ng6w127b680f4`（上海，个人版，**免费至 2027-04-03**） |
| 服务名 / 端口 | `stocklens` / 3000（容器内 `PORT=3000`） |
| 实例 | 0–5 自动扩缩容（**闲置缩容到 0 不计费**；首次访问有几秒冷启动） |
| 运行方式 | GitHub 仓库 `main` 分支 + Dockerfile（node:22-alpine 多阶段）云端构建 |
| 环境变量 | 服务版本配置里（同上 4 个，值与本地 .env.local 一致） |
| 已知行为 | 首次浏览器访问出现一次腾讯云「确定访问」确认页（平台安全机制，无法关闭；去除需备案自定义域名） |

**更新方式（任选其一）**：

1. **控制台重新部署**（最省事）：云开发控制台 → 云函数/托管 → 服务管理 → `stocklens` → 重新部署——从 GitHub `main` 拉最新构建
2. **上传代码包**：打包仅含 `src`、`tests/fixtures`、`public`、`package.json`、`package-lock.json`、`next.config.ts`、`tsconfig.json`、`postcss.config.mjs`、`Dockerfile`、`.nvmrc` 的 zip（**排除 node_modules/.git/docs/.env\***），在服务的新建版本处上传
3. **自动部署**：服务设置里有「启用自动部署」开关（push 自动重建）；当前未开启，开启后 push 即同步

> 注意：CLI `tcb cloudrun deploy` 当前报"云托管资源未开通"（CLI 与新版控制台开通状态脱节），**用控制台操作**。

### 3.2 Vercel（主部署）

| 项 | 值 |
|---|---|
| 生产地址 | <https://stocklens-blush.vercel.app/> |
| 部署方式 | CLI：`npx vercel --prod --yes --token=$(cat .tools/vercel-token)`（token 文件只在本机 `D:\zcode存储\stocklens\.tools\`，**不进仓库**；需走代理：`HTTPS_PROXY=http://127.0.0.1:7890`） |
| 环境变量 | Vercel 项目设置里（同上 4 个） |
| 说明 | 本地源码直接上传远端构建；GitHub push 不会自动触发 Vercel（除非在 Vercel 后台连接 Git 集成） |

### 3.3 标准上线流程

```text
本地修改 → 四件套自证 → git commit → git push（代理）
  → CloudBase：控制台「重新部署」（或上传新 zip / 开启自动部署自动同步）
  → Vercel：npx vercel --prod（走代理）
  → 双平台各验收一次（页面 200 + 追问 followup 返回 ai.status: success）
```

**AI 链路验收命令**（替换 `$BASE` 为任一平台地址）：

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"stockCode":"600519.SH","question":"估值处于什么位置?","evidenceIds":["EV_FACT_FIN_REVENUE_YOY_QUARTER","EV_FACT_FIN_NET_PROFIT_YOY_YTD","EV_FACT_FIN_NET_PROFIT_YOY_QUARTER","EV_FACT_FIN_OCF_YOY_YTD","EV_FACT_FIN_OCF_YOY_QUARTER","EV_FACT_FIN_CFO_TO_NET_PROFIT_YTD"]}' \
  "$BASE/api/followup"
# 期望：HTTP 200，JSON 里 "ai":{"status":"success"} 且 synthesis 非空
```

> **运维提醒**：DeepSeek 会"同名换实现"（2026-09 `deepseek-chat` 别名悄然指向推理型 Flash，曾导致追问全局失效——已用提示词 v4 + 2 轮修复 + max_tokens 4000 修复）。若回答再度变空/变差，先怀疑上游模型行为变化，用上面的命令做真实冒烟。

### 3.4 密钥与安全

- 密钥只存在于：本地 `.env.local`、CloudBase 服务版本配置、Vercel 项目设置——**三处之外不落盘**
- 仓库内只有 `.env.example`（变量名模板，无值）；`.env*` 被 .gitignore 与 .dockerignore 排除
- 服务器端（`server-only` 模块）持有密钥，前端零接触

## 4. 相关文档索引

| 文档 | 内容 |
|---|---|
| [README](../README.md) | 产品说明、两个线上地址、访问方式、已知边界 |
| [SUBMISSION](../SUBMISSION.md) | 评审入口：全部地址与交付物直达链接 |
| [docs/final/已知边界.md](final/已知边界.md) | 完整的边界与"明确不做"清单 |
| [docs/design-audit/DOMESTIC_DEPLOY_PLAN.md](design-audit/DOMESTIC_DEPLOY_PLAN.md) | 国内镜像部署全程（EdgeOne 出局原因、CloudBase 选型与坑） |
| [docs/design-audit/FUYAO_CAPABILITY_AUDIT.md](design-audit/FUYAO_CAPABILITY_AUDIT.md) | 扶摇全部端点 × 使用范围 × 可用性实测（含待接入的 P1–P3） |
| [docs/design-audit/HANDOFF.md](design-audit/HANDOFF.md) | 会话交接（做到哪了、硬约束） |
| 说明信息.txt | 交付包根说明（地址 + 文件清单 + 边界） |
