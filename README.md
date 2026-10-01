# StockLens

**个股证据诊断。** StockLens 把一个 A 股公司的当前状态组织成一张可探索的研究画布：AI 依据公司类型与研究问题动态生成诊断维度，确定性代码负责所有金融数字，模型只负责解释已有证据，并且每一条结论都能点回到原始字段、期次、口径与来源。它不判断股票"好/坏"，不给评分，不给买卖建议，也不做涨跌预测。

## Live Demo

**https://stocklens-blush.vercel.app/observatory-v5**

建议桌面浏览器、宽度 **1280×800 或更大**（1440×900 为设计基准）。默认研究标的为美的集团 000333.SZ；可搜索并切换任意 A 股。

## Why StockLens

传统个股页面把数据摆出来，"这说明什么"要用户自己拼；通用 LLM 对话直接给结论，但用户无法验证、也追不到原始口径。StockLens 补的是**问题与结论之间那段距离**：

```text
研究问题
  → 动态研究维度（依据公司类型与问题生成）
  → 结论（claims，绑定具体证据）
  → 证据（指标 / 期次 / 单位 / 来源 / 计算口径）
  → 沿证据继续追问
```

## Core Product Choice: Evidence-first

产品的中心不是"给一个答案"，而是**组织一个研究过程**。所有输出里没有评分、没有评级、没有涨跌预测；每条结论都必须能回到证据；证据不足时返回 `UNKNOWN`，而不是补一段听起来合理的解释。

核心原则写在界面里：**Evidence first. Conclusions second.**

## How It Works

```text
Company / Question
  → Research Framer（LLM：命名 4–6 个研究维度，看不到任何数字）
  → Truth Layer（确定性：取数 → 指标引擎 → 证据引擎）
  → Evidence Selection（确定性打包，控制进入模型的证据量）
  → Composer（LLM：用已有证据组织结论，引用必须真实存在）
  → Validation（证据绑定 / 分区类型 / 合规）
  → Research Canvas（画布 → 光圈 → 阅读 → 证据钻取）
  → Grounded Follow-up（LLM：只在当前 scope 内解释证据）
```

## Product Choices

产品选择指的是下面这些——不是技术栈：

| 选择 | 而不是 |
|---|---|
| **Evidence-first 研究过程** | 给股票打分 / 给买卖判断 |
| **动态研究维度**（随公司类型与用户问题生成） | 一套固定维度套所有公司 |
| **确定性代码算金融数字**（收益 / 波动 / 回撤 / 同比 / 估值比较） | 让 LLM 计算或推断数字 |
| **无证据就返回 UNKNOWN** | 生成合理但不可验证的结论 |
| **研究画布 + 逐层钻取** | 线性报告 / 一页结论 |
| **全屏研究过渡**表达 15–30 秒的真实等待 | 假进度条、假阶段名、角落 spinner |
| **数据新鲜度分两类**（报告期 vs 行情时效） | 用"日期不是今天"判定过期 |
| **桌面优先的空间化界面** | 为窄屏牺牲空间表达 |

## AI and Deterministic Boundary

**LLM 负责**：Research Framer（依据公司类型、行业与用户问题命名研究维度）、Composer（把某维度下已有的证据组织成 claims）、Follow-up（围绕当前 scope 做有依据的追问）。

**确定性代码负责**：全部金融计算（同比、单季还原、区间收益、年化波动率、最大回撤、估值比较、行业相对表现）、证据构造与冲突规则、引用完整性、数据新鲜度判定、合规与结构校验。

**LLM 不得编造金融事实**：不能调用数据源、不能重算数字、不能新增或修改证据、不能给评级或建议。校验失败会修复重试一次，仍失败则该维度 `synthesis = null`——**证据照常返回，AI 失败不污染事实层**。相关说明见 [ARCHITECTURE.md](docs/final/ARCHITECTURE.md)。

## Data Sources

- **扶摇金融数据 API**（唯一事实来源）：行情快照与历史 K 线、三大报表多期、官方财务指标、估值快照、交易日历、标的检索、行业指数行情与成分股、异动与热榜、分红送转。
- **本地行业注册表**：由扶摇行业指数成分股离线构建（90 个一级行业 / 5572 只标的），运行期不做扫描。
- **DeepSeek API**：仅用于上述三处模型调用（模型名见「环境变量」）。
- **iFinD MCP 未接入**：本提交**没有**使用 iFinD。新闻/公告类数据在扶摇侧当前不可用，iFinD MCP 需要付费计划授权，因此未把它算作数据来源；相关维度以 UNKNOWN 显式呈现。

## Run Locally

```bash
npm install
cp .env.example .env.local     # 填入下面的变量
npm run dev                    # http://localhost:3000/observatory-v5
```

其他命令：

```bash
npm run build                  # next build
npm run test                   # Vitest 全量（离线，无需密钥）
npm run lint                   # ESLint
npm run package:submission     # 生成提交包（见 docs/final/PACKAGE_MANIFEST.md）
```

## Environment Variables

仅变量名；真实值只存在于本地 `.env.local` 与部署平台，**不进仓库**：

| 变量 | 用途 |
|---|---|
| `FUYAO_API_KEY` | 扶摇金融数据 API 鉴权（服务端） |
| `DEEPSEEK_API_KEY` | DeepSeek 模型调用（服务端） |
| `DEEPSEEK_BASE_URL` | DeepSeek 接口地址（默认 `https://api.deepseek.com`） |
| `DEEPSEEK_MODEL` | 使用的模型名（当前为 `deepseek-chat`） |

前端不直接请求任何外部数据源，所有密钥只走服务端。

## Validation

自动化测试 **402 个 / 29 个测试文件**全部通过，另有 `tsc --noEmit` / `eslint` / `next build` 三项工程校验。产品侧还做了浏览器真实指针验收（48 行交互清单：PASS 47 / FAIL 0 / NOT TESTED 0 / N-A 1）、网络审计（本地操作 0 业务请求、未缓存切换恰好 1 次 init、缓存恢复 0 次）与 console 审计（0 uncaught / 0 React / 0 hydration）。

完整方法和结果见 [docs/final/TEST_REPORT.md](docs/final/TEST_REPORT.md)；需求对照见 [docs/final/REQUIREMENT_MATRIX.md](docs/final/REQUIREMENT_MATRIX.md)。

## Known Boundaries

- **首次进入一家公司需要约 15–30 秒**：其中 94–97% 是两次真实模型调用（数据层只占 0.17–0.6 秒）。产品用全屏研究过渡表达这段等待——真实已等待秒数、可随时返回，不用假进度。
- **时间敏感数据有 7 个自然日的新鲜度阈值**：超过即标 `stale`，结论里强制声明"当前状态无法由该数据确认"。财务报告期数据不按自然日判定（2026-Q2 不会因"不是今天"而过期）。
- **Follow-up 是原子 JSON，不是流式**；界面上的进度文案是状态，不是 token 流。
- **模型看不到对话历史**：每轮只携带当前 scope 与相关证据；历史保留在客户端供用户回看。
- **不支持的能力返回 UNKNOWN**（如银行无毛利率类指标、未接入新闻与历史估值序列）。
- **同行比较是行业级**：行业估值中位数与行业指数相对表现；不做逐家成分股的财务报表级对标。
- **桌面优先**：这是一个 1440×900 设计基准的空间化界面，窄屏（如 390×844）不在预期的空间交互环境内。

更完整的边界清单见 [docs/final/KNOWN_LIMITATIONS.md](docs/final/KNOWN_LIMITATIONS.md)。

## Tech Stack

Next.js（App Router）+ React 19 + TypeScript + Tailwind 4；测试用 Vitest；部署在 Vercel。技术栈不作为产品选择来说明——它只是实现手段。

## Repository Structure

```text
src/app/                 Next.js App Router 页面与 API 路由
  api/research/init      构建某公司的研究空间（Framer + Truth Layer + Composer）
  api/research/dimension 新增一个研究角度
  api/followup           沿当前 scope 追问
  api/stocks/search      标的检索
  observatory-v5/        研究画布（本提交的主界面）
src/components/v5/       研究画布与其子界面
src/lib/data/            扶摇适配、行业注册表
src/lib/metrics/         确定性指标引擎、解释护栏、数据新鲜度
src/lib/evidence/        证据引擎、冲突规则、UNKNOWN 构造
src/lib/research/        Research Framer、Capability Manifest、公司上下文
src/lib/ai/              证据打包、模型适配、校验
src/lib/v5/              画布层（研究架、切换守卫、交互计时、测试注入）
tests/                   Vitest 测试
scripts/                 打包、行业注册表构建、生产 smoke
docs/final/              提交文档（评审入口）
```

## Documentation

- [SUBMISSION.md](SUBMISSION.md) — 评审入口
- [docs/final/AI_USAGE_AND_VALIDATION.md](docs/final/AI_USAGE_AND_VALIDATION.md) — AI 使用与验证记录
- [docs/final/TEST_REPORT.md](docs/final/TEST_REPORT.md) — 测试说明
- [docs/final/REQUIREMENT_MATRIX.md](docs/final/REQUIREMENT_MATRIX.md) — 需求对照
- [docs/final/ARCHITECTURE.md](docs/final/ARCHITECTURE.md) — 架构
- [docs/final/PRODUCT_WALKTHROUGH.md](docs/final/PRODUCT_WALKTHROUGH.md) — 六张图走查
- [docs/final/KNOWN_LIMITATIONS.md](docs/final/KNOWN_LIMITATIONS.md) — 已知边界
