# StockLens

**个股证据诊断。** StockLens 把一个 A 股公司的当前状态组织成一张可探索的研究画布：AI 依据公司类型与研究问题动态生成诊断维度，确定性代码负责所有金融数字，模型只负责解释已有证据，并且每一条结论都能点回到原始字段、期次、口径与来源。

它不判断股票"好/坏"，不给评分，不给买卖建议，也不做涨跌预测——**先看证据，再下结论**。

## Live Demo

**https://stocklens-blush.vercel.app/observatory-v5**

建议桌面浏览器、宽度 ≥ 1280px。默认研究标的为美的集团 000333.SZ；可搜索任意 A 股并切换。

## Why StockLens

传统的个股页面把数据摆出来，但"这说明什么"要用户自己拼；聊天式 LLM 直接给结论，但用户无法验证、也无法追到原始口径。StockLens 解决的是**结论与证据之间的那段距离**：

- 结论不是凭空生成的文本，而是绑定到具体 Evidence ID 的关系判断；
- 每条证据都能回到指标、期次、单位、有效样本与计算口径；
- 证据不足时明确返回 UNKNOWN，而不是生成一个听起来合理的答案。

## Core Experience

```text
Company / Question
  → Dynamic Research Dimensions（依据公司类型与问题生成，非固定模板）
  → Evidence（fact / inference / unknown，带 signal 与期次）
  → Deterministic Metrics（区间收益、波动、回撤、估值比较、单季/累计口径分离）
  → Grounded Interpretation（模型只组织已存在的证据）
  → Claim Drilldown（沿 ①②③ 锚点回到数据）
  → Follow-up Research（带当前 scope 继续追问）
```

## Product Design

三层职责分离，是这套产品的核心设计：

| 层 | 负责 | 纪律 |
|---|---|---|
| **Truth Layer** | 扶摇数据适配 → 标准化 → 确定性指标引擎 → 证据引擎 | **LLM 完全禁入**。缺失 = `null`（绝不以 0 冒充），真实 0 不改写，单季与累计口径严格分离 |
| **Intelligence Layer** | Research Framer（选维度）、Composer（组织维度内的结论）、Follow-up（沿证据追问） | 只能引用已存在的 Evidence ID；输出全部经过确定性校验，伪造引用整体拒绝 |
| **Experience Layer** | Research Canvas、Focus Aperture、Reading、Evidence、AI Research Thread | 只做呈现、组织、钻取与交互，不产生任何新的金融结论 |

## AI / Deterministic Boundary

**LLM 负责：**
- Research Framer：理解公司类型与用户问题，命名 4–6 个研究维度（自由命名，非枚举）
- Composer：把某个维度下已有的证据组织成 claims
- Follow-up：围绕当前 scope 的证据做有依据的追问回答

**确定性代码负责：**
- 全部金融计算：同比、单季还原、区间收益、年化波动率、最大回撤、估值比较、行业相对表现
- 证据构造：事实/推断/未知的判定、冲突规则的触发、引用完整性
- 校验：证据绑定、分区类型、合规扫描

**LLM 不得编造金融事实**：它不能调用不存在的数据、不能重算数字、不能新增或修改 Evidence、不能给评级或建议。校验失败会做一次修复重试，仍失败则该维度 `synthesis = null`——**证据照常返回，AI 失败不污染事实层**。

## Data Sources

- **扶摇金融数据 API**（唯一事实来源）：行情快照与历史 K 线（前复权）、三大报表多期、官方财务指标、估值快照、交易日历、标的检索、行业指数行情与成分股、异动与热榜、分红送转。
- **本地行业注册表**：由扶摇行业指数成分股离线构建（90 个一级行业 / 5572 只标的），用于把标的映射到行业上下文；运行期不做扫描。
- **DeepSeek API**：仅用于上述 Intelligence Layer 的三处模型调用。

> iFinD MCP 未接入：新闻/公告类数据在扶摇侧当前不可用，iFinD MCP 需要付费计划授权，因此**没有**把它算作数据来源。相关维度以 UNKNOWN 显式呈现。

## Run Locally

```bash
npm install
cp .env.example .env.local     # 填入下述变量
npm run dev                    # http://localhost:3000/observatory-v5
```

其他命令：

```bash
npm run build                  # next build
npm run start -- --port 3100   # 生产模式本地运行
npm run test                   # Vitest 全量
npm run lint                   # ESLint
npm run package:submission     # 生成提交包（见 docs/final/PACKAGE_MANIFEST.md）
```

## Environment Variables

仅变量名（真实值只存在于本地 `.env.local` 与部署平台，不进仓库）：

| 变量 | 用途 |
|---|---|
| `FUYAO_API_KEY` | 扶摇金融数据 API 鉴权（服务端） |
| `DEEPSEEK_API_KEY` | DeepSeek 模型调用（服务端） |
| `DEEPSEEK_BASE_URL` | DeepSeek 接口地址 |
| `DEEPSEEK_MODEL` | 使用的模型名 |

前端不直接请求任何外部数据源，所有密钥只走服务端。

## Tests

**385 个自动化测试 / 28 个测试文件**，全部通过；另有 `npx tsc --noEmit`、`npx eslint`、`npx next build` 三项工程校验。

测试覆盖：确定性指标引擎、证据引擎与冲突规则、AI 校验与证据绑定、研究空间初始化、语义层级、载荷守卫、打包预算等。详见 [docs/final/TEST_REPORT.md](docs/final/TEST_REPORT.md)。

## Known Boundaries

- **首次进入一家公司需要约 15–30 秒**：这段时间里 Research Framer 与 Composer 两次真实模型调用占 94–97%，数据层只占零点几秒。产品用**全屏研究过渡**（真实已等待秒数、可随时返回上一家公司）来表达这段等待，而不是假进度条。
- **Follow-up 是原子 JSON，不是流式**：一次追问一次完整返回；界面上的 `Reviewing current evidence…` 是进度态，不是 token 流。
- **模型看不到对话历史**：每一轮 follow-up 只携带当前 scope 与相关证据；线程历史保留在客户端，用于用户回看，不发送给模型。
- **不支持的能力明确返回 UNKNOWN**：例如银行没有毛利率类指标、未接入新闻与历史估值序列时，对应维度直接标注证据不完整并列出缺失数据。
- **同行比较是行业级**：已实现行业估值中位数比较与行业指数相对表现；**不做**逐家成分股的财务报表级对标。
- **桌面优先**：这是一个 1440×900 设计基准的空间化研究界面，窄屏（如 390×844 手机宽度）不在预期的空间交互环境内。
- 更完整的边界清单（含已知的视觉与文案问题）见 [docs/final/KNOWN_LIMITATIONS.md](docs/final/KNOWN_LIMITATIONS.md)。

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
src/lib/metrics/         确定性指标引擎
src/lib/evidence/        证据引擎、冲突规则、UNKNOWN 构造
src/lib/research/        Research Framer、Capability Manifest、公司上下文
src/lib/ai/              证据打包、模型调用、校验
src/lib/v5/              画布层（研究架、切换守卫、交互计时、测试注入）
tests/                   Vitest 测试
scripts/                 打包、行业注册表构建、生产 smoke
docs/final/              提交文档（本目录为评审入口）
```

## Documentation

- [SUBMISSION.md](SUBMISSION.md) — 评审入口
- [docs/final/AI_USAGE_AND_VALIDATION.md](docs/final/AI_USAGE_AND_VALIDATION.md) — AI 使用与验证记录
- [docs/final/TEST_REPORT.md](docs/final/TEST_REPORT.md) — 测试说明
- [docs/final/REQUIREMENT_MATRIX.md](docs/final/REQUIREMENT_MATRIX.md) — 需求对照
- [docs/final/ARCHITECTURE.md](docs/final/ARCHITECTURE.md) — 架构
- [docs/final/PRODUCT_WALKTHROUGH.md](docs/final/PRODUCT_WALKTHROUGH.md) — 六张图走查
- [docs/final/KNOWN_LIMITATIONS.md](docs/final/KNOWN_LIMITATIONS.md) — 已知边界
